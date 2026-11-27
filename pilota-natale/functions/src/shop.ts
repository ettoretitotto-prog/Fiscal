import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION, TOKEN_RE, db, eventData, FieldValue, normalizeCode, requireShop, str, Timestamp, tsMillis } from "./common";
import type { Proof } from "./proofs";

function publicProof(id: string, p: Proof) {
  return {
    id,
    code: p.code,
    description: p.description,
    purchaseDate: tsMillis(p.createdAt),
    status: p.status,
    exchangedAt: tsMillis(p.exchangedAt),
    discountUsedAt: tsMillis(p.discountUsedAt),
    extraSpentCents: p.extraSpentCents ?? 0,
    receiptAvailable: !!p.receiptPath,
    recipientSaved: !!p.recipientSavedAt,
  };
}

/** Estrae il token da un link /r/{token} (QR) oppure accetta il token nudo. */
function tokenFrom(q: string): string | null {
  const m = /\/r\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/.exec(q);
  if (m) return m[1];
  return TOKEN_RE.test(q) ? q : null;
}

/**
 * Il negozio cerca una prova per QR (link regalo) o per codice corto.
 * Vede solo le prove create dal QR del proprio negozio.
 */
export const shopLookup = onCall({ region: REGION }, async (req) => {
  const { shopId } = await requireShop(req);
  const q = str((req.data ?? {}).query, "codice", 3, 500);

  let snap: FirebaseFirestore.DocumentSnapshot | null = null;
  const tok = tokenFrom(q);
  if (tok) {
    const r = await db.collection("proofs").where("giftToken", "==", tok).limit(1).get();
    snap = r.empty ? null : r.docs[0];
  } else {
    const code = normalizeCode(q);
    if (!code) return { valid: false, reason: "bad_code" };
    const c = await db.doc(`codes/${code}`).get();
    if (c.exists) snap = await db.doc(`proofs/${c.data()!.proofId}`).get();
  }
  if (!snap || !snap.exists) return { valid: false, reason: "not_found" };
  const p = snap.data() as Proof;
  if (p.shopId !== shopId) return { valid: false, reason: "other_shop" };
  return { valid: true, proof: publicProof(snap.id, p) };
});

/** "Cambio effettuato" oppure "Sconto applicato" (+ importo speso in più). */
export const shopAction = onCall({ region: REGION }, async (req) => {
  const { uid, shopId } = await requireShop(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const proofId = str(d.proofId, "prova", 5, 40);
  const action = d.action;
  if (action !== "exchange" && action !== "discount") throw new HttpsError("invalid-argument", "Azione non valida.");

  let extraCents = 0;
  if (action === "discount" && d.extraSpent !== undefined && d.extraSpent !== null && d.extraSpent !== "") {
    const n = typeof d.extraSpent === "number" ? d.extraSpent : Number(String(d.extraSpent).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100_000) throw new HttpsError("invalid-argument", "Importo non valido.");
    extraCents = Math.round(n * 100);
  }

  const ref = db.doc(`proofs/${proofId}`);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Prova non trovata.");
    const p = snap.data() as Proof;
    if (p.shopId !== shopId) throw new HttpsError("permission-denied", "Prova non valida per questo negozio.");
    const now = Timestamp.now();
    if (action === "exchange") {
      if (p.status === "exchanged") return { already: true, at: tsMillis(p.exchangedAt) };
      tx.update(ref, { status: "exchanged", exchangedAt: now, exchangedBy: uid });
      tx.create(db.collection("events").doc(), eventData("exchange", shopId, proofId));
    } else {
      if (p.discountUsedAt) return { already: true, at: tsMillis(p.discountUsedAt) };
      tx.update(ref, { discountUsedAt: now, discountBy: uid, extraSpentCents: FieldValue.increment(extraCents) });
      tx.create(db.collection("events").doc(), eventData("discount_used", shopId, proofId));
      if (extraCents > 0) tx.create(db.collection("events").doc(), eventData("extra_spent", shopId, proofId, { amountCents: extraCents }));
    }
    return { already: false, at: now.toMillis() };
  });
  const fresh = await ref.get();
  return { ...result, proof: publicProof(fresh.id, fresh.data() as Proof) };
});
