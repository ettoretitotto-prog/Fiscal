// Inizializza firebase-admin verso gli EMULATORI (default) o verso il progetto reale (--prod).
// Produzione: serve GOOGLE_APPLICATION_CREDENTIALS=/percorso/serviceAccountKey.json
// (Console Firebase → Impostazioni progetto → Account di servizio → Genera nuova chiave privata)
import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export const PROD = process.argv.includes("--prod");
const rc = JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8"));
export const PROJECT_ID = PROD ? (process.env.GCLOUD_PROJECT ?? rc.projects.default) : "demo-fiscal-natale";

if (!PROD) {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
  initializeApp({ projectId: PROJECT_ID, storageBucket: `${PROJECT_ID}.appspot.com` });
  console.log(`→ Emulatori locali (${PROJECT_ID})`);
} else {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("Per --prod imposta GOOGLE_APPLICATION_CREDENTIALS con il percorso della chiave del service account.");
    process.exit(1);
  }
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
    storageBucket: process.env.STORAGE_BUCKET ?? `${PROJECT_ID}.firebasestorage.app`,
  });
  console.log(`→ PRODUZIONE (${PROJECT_ID})`);
}

export const auth = getAuth();
export const db = getFirestore();
export const bucket = () => getStorage().bucket();

export async function upsertUser(email, password) {
  try {
    const u = await auth.getUserByEmail(email);
    if (password) await auth.updateUser(u.uid, { password });
    return u;
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    return auth.createUser({ email, password, emailVerified: true });
  }
}
