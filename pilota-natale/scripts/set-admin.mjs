// Rende admin un account esistente (o lo crea con --password).
//   node scripts/set-admin.mjs tua@email.it [--password Segreta123] [--prod]
import { FieldValue } from "firebase-admin/firestore";
import { auth, db, upsertUser } from "./_admin.mjs";

const email = process.argv[2];
if (!email || email.startsWith("--")) {
  console.error("Uso: node scripts/set-admin.mjs email@esempio.it [--password XXX] [--prod]");
  process.exit(1);
}
const pIdx = process.argv.indexOf("--password");
const password = pIdx > -1 ? process.argv[pIdx + 1] : undefined;

let user;
if (password) user = await upsertUser(email, password);
else user = await auth.getUserByEmail(email).catch(() => {
  console.error(`Nessun account ${email}. Crealo in Firebase Console → Authentication oppure passa --password.`);
  process.exit(1);
});

await db.doc(`users/${user.uid}`).set({ role: "admin", email, createdAt: FieldValue.serverTimestamp() });
console.log(`✓ ${email} (uid ${user.uid}) è admin.`);
process.exit(0);
