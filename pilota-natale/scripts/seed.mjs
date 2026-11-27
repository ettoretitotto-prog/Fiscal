// Dati di esempio: 1 admin + 2 negozi finti con account + 3 prove regalo demo.
//   Emulatori:   node scripts/seed.mjs
//   Produzione:  SEED_PASSWORD=... node scripts/seed.mjs --prod
//                (crea i 2 negozi DEMO e le prove demo; l'admin lo crei con set-admin.mjs)
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { bucket, db, PROD, PROJECT_ID, upsertUser } from "./_admin.mjs";

const PASSWORD = process.env.SEED_PASSWORD ?? (PROD ? null : "fiscal-demo");
if (!PASSWORD || PASSWORD.length < 6) {
  console.error("Imposta SEED_PASSWORD (almeno 6 caratteri) per il seed in produzione.");
  process.exit(1);
}
const BASE = process.env.PUBLIC_BASE_URL ?? (PROD ? `https://${PROJECT_ID}.web.app` : "http://localhost:5173");

export const SHOPS = [
  {
    id: "bottega-aurora",
    name: "Bottega Aurora (DEMO)",
    address: "Calle dei Fabbri 12, Venezia",
    loginEmail: "negozio1@fiscal.test",
    exchangeRules: "Cambio entro il 31 gennaio 2027 presentando questa prova. Capi integri e con cartellino.",
    discountText: "10% sul prossimo acquisto entro il 31/01/2027",
  },
  {
    id: "passo-leggero",
    name: "Passo Leggero Calzature (DEMO)",
    address: "Corso del Popolo 48, Mestre",
    loginEmail: "negozio2@fiscal.test",
    exchangeRules: "Cambio taglia o modello entro il 15 gennaio 2027. Scarpe non indossate e nella loro scatola.",
    discountText: "5 € di sconto su una spesa di almeno 50 € entro il 31/01/2027",
  },
];

const PROOFS = [
  { code: "FSC-DEMA", shopId: "bottega-aurora", description: "Maglione blu, tg M (DEMO)", exchanged: false },
  { code: "FSC-DEMB", shopId: "bottega-aurora", description: "Sciarpa rossa (DEMO, già cambiata)", exchanged: true },
  { code: "FSC-DEMC", shopId: "passo-leggero", description: "Stivaletti neri n. 38 (DEMO)", exchanged: false },
];

if (!PROD) {
  const admin = await upsertUser("admin@fiscal.test", PASSWORD);
  await db.doc(`users/${admin.uid}`).set({ role: "admin", email: "admin@fiscal.test", createdAt: FieldValue.serverTimestamp() });
  console.log(`✓ admin@fiscal.test / ${PASSWORD}`);
}

for (const s of SHOPS) {
  const u = await upsertUser(s.loginEmail, PASSWORD);
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(db.doc(`shops/${s.id}`), {
    name: s.name, address: s.address, exchangeRules: s.exchangeRules, discountText: s.discountText,
    active: true, createdAt: now, updatedAt: now,
  });
  batch.set(db.doc(`shopAccounts/${s.id}`), { loginEmail: s.loginEmail, uid: u.uid, createdAt: now });
  batch.set(db.doc(`users/${u.uid}`), { role: "shop", shopId: s.id, email: s.loginEmail, createdAt: now });
  await batch.commit();
  console.log(`✓ ${s.name}  →  ${BASE}/n/${s.id}   (${s.loginEmail} / ${PASSWORD})`);
}

const photo = readFileSync(new URL("./assets/scontrino-demo.jpg", import.meta.url));
for (const p of PROOFS) {
  const existing = await db.doc(`codes/${p.code}`).get();
  if (existing.exists) {
    console.log(`= ${p.code} esiste già (rimuovilo per rigenerarlo)`);
    continue;
  }
  const ref = db.collection("proofs").doc();
  const giftToken = randomBytes(32).toString("base64url");
  const ownerToken = randomBytes(32).toString("base64url");
  const receiptPath = `receipts/${p.shopId}/${ref.id}.jpg`;
  await bucket().file(receiptPath).save(photo, { contentType: "image/jpeg" });
  const now = Timestamp.now();
  const shop = SHOPS.find((s) => s.id === p.shopId);
  const batch = db.batch();
  batch.set(db.doc(`codes/${p.code}`), { proofId: ref.id, shopId: p.shopId, createdAt: now });
  batch.set(ref, {
    shopId: p.shopId, shopName: shop.name, code: p.code, description: p.description, buyerEmail: "acquirente@fiscal.test",
    receiptPath, receiptContentType: "image/jpeg", receiptDeleteAt: Timestamp.fromMillis(now.toMillis() + 180 * 86_400_000),
    createdAt: now, creatorUid: "seed", sessionId: null,
    giftToken, ownerTokenHash: createHash("sha256").update(ownerToken).digest("hex"),
    status: p.exchanged ? "exchanged" : "active", exchangedAt: p.exchanged ? now : null,
    discountUsedAt: null, extraSpentCents: 0, openCount: 0, firstOpenedAt: null, lastOpenedAt: null,
    recipientSavedAt: null, recipientEmail: null, buyerMarketing: false, buyerEmailStatus: "sent",
  });
  batch.set(db.collection("events").doc(), { type: "proof_created", shopId: p.shopId, proofId: ref.id, at: now });
  if (p.exchanged) batch.set(db.collection("events").doc(), { type: "exchange", shopId: p.shopId, proofId: ref.id, at: now });
  await batch.commit();
  console.log(`✓ ${p.code}  ${p.description}\n    copia acquirente: ${BASE}/c/${ownerToken}\n    link regalo:      ${BASE}/r/${giftToken}`);
}
process.exit(0);
