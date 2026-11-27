// Dati di esempio: 1 admin + 2 negozi finti con relativo account.
//   Emulatori:   node scripts/seed.mjs
//   Produzione:  SEED_PASSWORD=... node scripts/seed.mjs --prod   (crea solo i 2 negozi demo)
import { FieldValue } from "firebase-admin/firestore";
import { db, PROD, upsertUser } from "./_admin.mjs";

const PASSWORD = process.env.SEED_PASSWORD ?? (PROD ? null : "fiscal-demo");
if (!PASSWORD || PASSWORD.length < 6) {
  console.error("Imposta SEED_PASSWORD (almeno 6 caratteri) per il seed in produzione.");
  process.exit(1);
}

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
  console.log(`✓ ${s.name}  →  /n/${s.id}   (${s.loginEmail} / ${PASSWORD})`);
}
process.exit(0);
