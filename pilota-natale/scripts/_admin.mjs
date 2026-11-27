// Inizializza firebase-admin verso gli EMULATORI (default) o verso il progetto reale (--prod).
// Produzione: serve GOOGLE_APPLICATION_CREDENTIALS=/percorso/serviceAccountKey.json
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const PROJECT_ID = "fiscal-9a0c8";
export const PROD = process.argv.includes("--prod");

if (!PROD) {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
  initializeApp({ projectId: PROJECT_ID });
  console.log("→ Emulatori locali");
} else {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("Per --prod imposta GOOGLE_APPLICATION_CREDENTIALS con il percorso di serviceAccountKey.json");
    process.exit(1);
  }
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  console.log(`→ PRODUZIONE (${PROJECT_ID})`);
}

export const auth = getAuth();
export const db = getFirestore();

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
