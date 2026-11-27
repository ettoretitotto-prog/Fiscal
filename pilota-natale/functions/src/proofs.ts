import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import {
  REGION, TZ, PRIVACY_VERSION, RECEIPT_RETENTION_DAYS, baseUrl, bool, bucket, db, email, eventData,
  FieldValue, fmtDate, giftUrl, newToken, ownerUrl, randomCode, rateLimit, sha256, str, Timestamp, token, tsMillis,
} from "./common";
import { RESEND_API_KEY, buyerMail, giftMail, sendMail, type ProofMailData } from "./mail";

export const PRIVACY_NOTICE_TEXT = "Continuando accetti l'Informativa privacy.";
export const MARKETING_TEXT = "Voglio ricevere novità da Fiscal";

const opts = { region: REGION, secrets: [RESEND_API_KEY], memory: "512MiB" as const, timeoutSeconds: 60 };

export interface Proof {
  shopId: string;
  shopName: string;
  code: string;
  description: string;
  buyerEmail: string;
  receiptPath: string | null;
  receiptContentType: string;
  receiptDeleteAt: Timestamp;
  createdAt: Timestamp;
  creatorUid: string;
  sessionId: string | null;
  giftToken: string;
  ownerTokenHash: string;
  status: "active" | "exchanged";
  exchangedAt: Timestamp | null;
  discountUsedAt: Timestamp | null;
  extraSpentCents: number;
  openCount: number;
  firstOpenedAt: Timestamp | null;
  lastOpenedAt: Timestamp | null;
  recipientSavedAt: Timestamp | null;
  recipientEmail: string | null;
  buyerMarketing: boolean;
  buyerEmailStatus: "pending" | "sent" | "failed";
}

export interface ShopDoc {
  name: string; address: string; exchangeRules: string; discountText: string; active: boolean;
}

export const qrUrlFor = (giftToken: string) => `${baseUrl()}/api/qr/${giftToken}.png`;

export async function mailDataFor(p: Proof, ownerToken = ""): Promise<ProofMailData> {
  const shop = (await db.doc(`shops/${p.shopId}`).get()).data() as ShopDoc | undefined;
  return {
    shopName: shop?.name ?? p.shopName,
    shopAddress: shop?.address ?? "",
    description: p.description,
    purchaseDate: fmtDate(p.createdAt),
    code: p.code,
    giftUrl: giftUrl(p.giftToken),
    ownerUrl: ownerToken ? ownerUrl(ownerToken) : "",
    qrUrl: qrUrlFor(p.giftToken),
    receiptUrl: ownerToken ? `${baseUrl()}/api/receipt/o/${ownerToken}` : "",
    exchangeRules: shop?.exchangeRules ?? "",
    discountText: shop?.discountText ?? "",
  };
}

export async function proofByOwnerToken(ownerToken: string) {
  const q = await db.collection("proofs").where("ownerTokenHash", "==", sha256(ownerToken)).limit(1).get();
  if (q.empty) throw new HttpsError("not-found", "Link non valido o scaduto.");
  return q.docs[0];
}

export async function proofByGiftToken(giftToken: string) {
  const q = await db.collection("proofs").where("giftToken", "==", giftToken).limit(1).get();
  if (q.empty) throw new HttpsError("not-found", "Regalo non trovato. Controlla il link.");
  return q.docs[0];
}

export function consentDocs(args: {
  email: string; role: "buyer" | "recipient"; marketing: boolean; shopId: string; proofId: string; clientVersion: unknown;
}) {
  const base = {
    email: args.email, role: args.role, shopId: args.shopId, proofId: args.proofId,
    policyVersion: PRIVACY_VERSION,
    clientPolicyVersion: typeof args.clientVersion === "string" ? args.clientVersion.slice(0, 40) : null,
    at: FieldValue.serverTimestamp(),
  };
  return [
    { ...base, kind: "privacy_notice", granted: true, text: PRIVACY_NOTICE_TEXT },
    { ...base, kind: "marketing", granted: args.marketing, text: MARKETING_TEXT },
  ];
}

/** Solo foto raster: un SVG potrebbe contenere script. */
export const ALLOWED_IMAGE_TYPES: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "image/heif": ["heif"],
};

const UPLOAD_NAME_RE = /^uploads\/([A-Za-z0-9]+)\/([A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp|heic|heif))$/;

// ======================= createProof =======================
/**
 * Crea una prova d'acquisto regalo da una foto già caricata in uploads/{uid}/.
 * Chiamata dalla pagina /n/{shopId} (utente anonimo).
 */
export const createProof = onCall(opts, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sessione scaduta: ricarica la pagina.");
  const d = (req.data ?? {}) as Record<string, unknown>;

  const shopId = str(d.shopId, "negozio", 3, 40);
  const description = str(d.description, "descrizione", 2, 120);
  const buyerEmail = email(d.email);
  const marketing = bool(d.marketing);
  const sessionId = typeof d.sessionId === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(d.sessionId) ? d.sessionId : null;
  const uploadPath = str(d.uploadPath, "foto", 10, 200);
  const m = UPLOAD_NAME_RE.exec(uploadPath);
  if (!m || m[1] !== uid) throw new HttpsError("permission-denied", "Foto non valida.");

  await rateLimit(`createProof:${uid}`, 30);

  const shopSnap = await db.doc(`shops/${shopId}`).get();
  const shop = shopSnap.data() as ShopDoc | undefined;
  if (!shop || !shop.active) throw new HttpsError("failed-precondition", "Questo negozio non è attivo.");

  // Verifica e sposta la foto (uploads/ → receipts/)
  const upload = bucket().file(uploadPath);
  const [exists] = await upload.exists();
  if (!exists) throw new HttpsError("failed-precondition", "Foto non trovata: riprova a scattarla.");
  const [meta] = await upload.getMetadata();
  const contentType = String(meta.contentType ?? "").toLowerCase();
  if (!ALLOWED_IMAGE_TYPES[contentType]?.includes(m[3]) || Number(meta.size) > 10 * 1024 * 1024) {
    throw new HttpsError("invalid-argument", "Il file deve essere una foto (max 10 MB).");
  }
  const proofRef = db.collection("proofs").doc();
  const ext = m[3] === "jpeg" ? "jpg" : m[3];
  const receiptPath = `receipts/${shopId}/${proofRef.id}.${ext}`;
  await upload.copy(bucket().file(receiptPath));

  const giftToken = newToken();
  const ownerToken = newToken();
  const now = Timestamp.now();

  let code = "";
  try {
    for (let attempt = 0; attempt < 10 && !code; attempt++) {
      const candidate = randomCode();
      const created = await db.runTransaction(async (tx) => {
        const codeRef = db.doc(`codes/${candidate}`);
        if ((await tx.get(codeRef)).exists) return false;
        const proof: Proof = {
          shopId, shopName: shop.name, code: candidate, description, buyerEmail,
          receiptPath, receiptContentType: contentType,
          receiptDeleteAt: Timestamp.fromMillis(now.toMillis() + RECEIPT_RETENTION_DAYS * 86_400_000),
          createdAt: now, creatorUid: uid, sessionId,
          giftToken, ownerTokenHash: sha256(ownerToken),
          status: "active", exchangedAt: null, discountUsedAt: null, extraSpentCents: 0,
          openCount: 0, firstOpenedAt: null, lastOpenedAt: null,
          recipientSavedAt: null, recipientEmail: null,
          buyerMarketing: marketing, buyerEmailStatus: "pending",
        };
        tx.create(codeRef, { proofId: proofRef.id, shopId, createdAt: now });
        tx.create(proofRef, proof);
        for (const c of consentDocs({ email: buyerEmail, role: "buyer", marketing, shopId, proofId: proofRef.id, clientVersion: d.policyVersion })) {
          tx.create(db.collection("consents").doc(), c);
        }
        tx.create(db.collection("events").doc(), eventData("proof_created", shopId, proofRef.id));
        return true;
      });
      if (created) code = candidate;
    }
    if (!code) throw new HttpsError("internal", "Impossibile generare un codice univoco. Riprova.");
  } catch (e) {
    await bucket().file(receiptPath).delete().catch(() => {});
    throw e;
  }
  await upload.delete().catch(() => {});

  // Email a chi regala (se fallisce la prova resta valida: si vede subito a schermo)
  let emailSent = false;
  try {
    const proof = (await proofRef.get()).data() as Proof;
    const data = await mailDataFor(proof, ownerToken);
    const [photo] = await bucket().file(receiptPath).download();
    await sendMail({ to: buyerEmail, ...buyerMail(data), attachments: [{ filename: `scontrino-${code}.${ext}`, content: photo }] });
    emailSent = true;
  } catch (e) {
    logger.error("Email acquirente non inviata", { proofId: proofRef.id, err: String(e) });
  }
  await proofRef.update({ buyerEmailStatus: emailSent ? "sent" : "failed" });

  return { code, ownerToken, giftUrl: giftUrl(giftToken), ownerUrl: ownerUrl(ownerToken), emailSent };
});

// ======================= getOwnerProof =======================
/** Dati per la pagina /c/{ownerToken}: la copia completa di chi regala. */
export const getOwnerProof = onCall({ region: REGION }, async (req) => {
  const ownerToken = token((req.data ?? {}).ownerToken);
  const snap = await proofByOwnerToken(ownerToken);
  const p = snap.data() as Proof;
  const shop = (await db.doc(`shops/${p.shopId}`).get()).data() as ShopDoc | undefined;
  const sends = await db.collection("giftSends").where("proofId", "==", snap.id).orderBy("createdAt", "asc").get();
  return {
    shopName: shop?.name ?? p.shopName,
    shopAddress: shop?.address ?? "",
    exchangeRules: shop?.exchangeRules ?? "",
    discountText: shop?.discountText ?? "",
    description: p.description,
    code: p.code,
    buyerEmail: p.buyerEmail,
    purchaseDate: tsMillis(p.createdAt),
    giftUrl: giftUrl(p.giftToken),
    receiptAvailable: !!p.receiptPath,
    status: p.status,
    exchangedAt: tsMillis(p.exchangedAt),
    discountUsedAt: tsMillis(p.discountUsedAt),
    opened: p.openCount > 0,
    recipientSaved: !!p.recipientSavedAt,
    sends: sends.docs.map((s) => {
      const g = s.data();
      return {
        id: s.id, toEmail: g.toEmail, status: g.status,
        scheduledAt: tsMillis(g.scheduledAt), sentAt: tsMillis(g.sentAt),
      };
    }),
  };
});

// ======================= sendGift =======================
const MAX_SENDS_PER_PROOF = 10;
const MAX_SCHEDULE_DAYS = 120;

/** Invia (subito o in una data/ora) il link regalo all'email del destinatario. */
export const sendGift = onCall(opts, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const ownerToken = token(d.ownerToken);
  const toEmail = email(d.toEmail, "email del destinatario");
  const fromName = typeof d.fromName === "string" ? d.fromName.trim().slice(0, 60) : "";
  const message = typeof d.message === "string" ? d.message.trim().slice(0, 400) : "";
  const nowMs = Date.now();
  let scheduledMs = nowMs;
  if (d.scheduledAt !== undefined && d.scheduledAt !== null) {
    if (typeof d.scheduledAt !== "number" || !Number.isFinite(d.scheduledAt)) throw new HttpsError("invalid-argument", "Data non valida.");
    if (d.scheduledAt < nowMs - 60_000) throw new HttpsError("invalid-argument", "La data di invio è nel passato.");
    if (d.scheduledAt > nowMs + MAX_SCHEDULE_DAYS * 86_400_000) throw new HttpsError("invalid-argument", "Puoi programmare al massimo 120 giorni avanti.");
    scheduledMs = Math.max(nowMs, d.scheduledAt);
  }

  const snap = await proofByOwnerToken(ownerToken);
  await rateLimit(`sendGift:${snap.id}`, 20);
  const p = snap.data() as Proof;
  const existing = await db.collection("giftSends").where("proofId", "==", snap.id).get();
  if (existing.docs.filter((s) => s.data().status !== "cancelled").length >= MAX_SENDS_PER_PROOF) {
    throw new HttpsError("resource-exhausted", "Hai raggiunto il numero massimo di invii per questo regalo.");
  }

  const immediate = scheduledMs - nowMs < 2 * 60_000;
  const ref = await db.collection("giftSends").add({
    proofId: snap.id, shopId: p.shopId, toEmail, fromName, message,
    purpose: "consegna", // usata SOLO per consegnare il regalo, mai per marketing
    status: "scheduled", attempts: 0, scheduledByUser: !immediate,
    scheduledAt: Timestamp.fromMillis(scheduledMs),
    createdAt: FieldValue.serverTimestamp(), sentAt: null, error: null,
  });
  // Se l'invio immediato non riesce resta in coda e il dispatcher riprova da solo:
  // non chiediamo all'utente di ripetere (eviterebbe email doppie).
  if (immediate) await deliverGiftSend(ref.id);
  const g = (await ref.get()).data()!;
  return {
    id: ref.id, status: g.status, scheduledAt: tsMillis(g.scheduledAt), sentAt: tsMillis(g.sentAt), toEmail,
    retrying: immediate && g.status !== "sent",
  };
});

/** Annulla un invio programmato non ancora partito. */
export const cancelGiftSend = onCall({ region: REGION }, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const ownerToken = token(d.ownerToken);
  const sendId = str(d.sendId, "invio", 5, 40);
  const snap = await proofByOwnerToken(ownerToken);
  const ref = db.doc(`giftSends/${sendId}`);
  await db.runTransaction(async (tx) => {
    const g = await tx.get(ref);
    if (!g.exists || g.data()!.proofId !== snap.id) throw new HttpsError("not-found", "Invio non trovato.");
    if (g.data()!.status !== "scheduled") throw new HttpsError("failed-precondition", "L'invio è già partito.");
    tx.update(ref, { status: "cancelled", cancelledAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

/** Consegna un invio: lo "prenota" in transazione per evitare doppi invii. */
export async function deliverGiftSend(sendId: string): Promise<boolean> {
  const ref = db.doc(`giftSends/${sendId}`);
  const claimed = await db.runTransaction(async (tx) => {
    const g = await tx.get(ref);
    if (!g.exists || g.data()!.status !== "scheduled") return null;
    tx.update(ref, { status: "sending", attempts: FieldValue.increment(1), claimedAt: Timestamp.now() });
    return g.data()!;
  });
  if (!claimed) return false;
  try {
    const proofSnap = await db.doc(`proofs/${claimed.proofId}`).get();
    const p = proofSnap.data() as Proof;
    const data = await mailDataFor(p);
    await sendMail({ to: claimed.toEmail, ...giftMail({ ...data, fromName: claimed.fromName ?? "", message: claimed.message ?? "" }) });
    const batch = db.batch();
    batch.update(ref, { status: "sent", sentAt: FieldValue.serverTimestamp(), error: null });
    batch.create(db.collection("events").doc(), eventData("gift_sent", p.shopId, proofSnap.id, { scheduled: claimed.scheduledByUser === true }));
    await batch.commit();
    return true;
  } catch (e) {
    const attempts = (claimed.attempts ?? 0) + 1;
    logger.error("Invio regalo fallito", { sendId, attempts, err: String(e) });
    await ref.update(
      attempts < 3
        ? { status: "scheduled", scheduledAt: Timestamp.fromMillis(Date.now() + 10 * 60_000), error: String(e).slice(0, 300) }
        : { status: "failed", error: String(e).slice(0, 300) },
    );
    return false;
  }
}

// ======================= dispatchScheduledGifts =======================
/** Ogni 5 minuti spedisce gli invii programmati arrivati a scadenza. */
export const dispatchScheduledGifts = onSchedule(
  { schedule: "every 5 minutes", timeZone: TZ, region: REGION, secrets: [RESEND_API_KEY], timeoutSeconds: 300 },
  async () => {
    // Invii rimasti "in invio" per un crash: tornano in coda.
    const stuck = await db.collection("giftSends")
      .where("status", "==", "sending")
      .where("claimedAt", "<=", Timestamp.fromMillis(Date.now() - 15 * 60_000))
      .limit(50)
      .get();
    for (const doc of stuck.docs) await doc.ref.update({ status: "scheduled" });

    const due = await db.collection("giftSends")
      .where("status", "==", "scheduled")
      .where("scheduledAt", "<=", Timestamp.now())
      .limit(100)
      .get();
    let sent = 0;
    for (const doc of due.docs) if (await deliverGiftSend(doc.id)) sent++;
    if (due.size) logger.info(`Invii programmati: ${sent}/${due.size} consegnati`);
  },
);
