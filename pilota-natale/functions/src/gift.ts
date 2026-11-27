import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { REGION, bool, db, email, eventData, FieldValue, giftUrl, rateLimit, Timestamp, token, tsMillis } from "./common";
import { RESEND_API_KEY, savedMail, sendMail } from "./mail";
import { consentDocs, mailDataFor, proofByGiftToken, type Proof, type ShopDoc } from "./proofs";

/**
 * Dati PUBBLICI del regalo per la pagina /r/{giftToken}.
 * Non restituisce MAI foto, prezzo, email o percorso dello scontrino.
 */
export const openGift = onCall({ region: REGION }, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const giftToken = token(d.giftToken);
  const snap = await proofByGiftToken(giftToken);
  const p = snap.data() as Proof;
  const shop = (await db.doc(`shops/${p.shopId}`).get()).data() as ShopDoc | undefined;

  // Conta l'apertura (il client la segnala una sola volta per dispositivo).
  if (bool(d.countOpen)) {
    const now = Timestamp.now();
    const batch = db.batch();
    batch.update(snap.ref, {
      openCount: FieldValue.increment(1),
      lastOpenedAt: now,
      ...(p.firstOpenedAt ? {} : { firstOpenedAt: now }),
    });
    batch.create(db.collection("events").doc(), eventData("link_opened", p.shopId, snap.id, { first: !p.firstOpenedAt }));
    await batch.commit().catch((e) => logger.warn("conteggio apertura fallito", String(e)));
  }

  return {
    shopName: shop?.name ?? p.shopName,
    shopAddress: shop?.address ?? "",
    exchangeRules: shop?.exchangeRules ?? "",
    discountText: shop?.discountText ?? "",
    description: p.description,
    purchaseDate: tsMillis(p.createdAt),
    code: p.code,
    giftUrl: giftUrl(p.giftToken),
    status: p.status,
    exchangedAt: tsMillis(p.exchangedAt),
    discountUsedAt: tsMillis(p.discountUsedAt),
    saved: !!p.recipientSavedAt,
  };
});

/** Il destinatario salva il regalo con la sua email: riceve una copia via email. */
export const saveGift = onCall({ region: REGION, secrets: [RESEND_API_KEY] }, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const giftToken = token(d.giftToken);
  const recipientEmail = email(d.email);
  const marketing = bool(d.marketing);
  const snap = await proofByGiftToken(giftToken);
  await rateLimit(`saveGift:${snap.id}`, 10);
  const p = snap.data() as Proof;

  const batch = db.batch();
  batch.update(snap.ref, {
    recipientEmail,
    ...(p.recipientSavedAt ? {} : { recipientSavedAt: FieldValue.serverTimestamp() }),
  });
  for (const c of consentDocs({ email: recipientEmail, role: "recipient", marketing, shopId: p.shopId, proofId: snap.id, clientVersion: d.policyVersion })) {
    batch.create(db.collection("consents").doc(), c);
  }
  if (!p.recipientSavedAt) batch.create(db.collection("events").doc(), eventData("recipient_saved", p.shopId, snap.id));
  await batch.commit();

  let emailSent = false;
  try {
    await sendMail({ to: recipientEmail, ...savedMail(await mailDataFor(p)) });
    emailSent = true;
  } catch (e) {
    logger.error("Email destinatario non inviata", { proofId: snap.id, err: String(e) });
  }
  return { ok: true, emailSent };
});
