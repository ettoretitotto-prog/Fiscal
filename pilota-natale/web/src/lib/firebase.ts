import { initializeApp, getApp, getApps, deleteApp, type FirebaseApp } from "firebase/app";
import { getAuth, initializeAuth, inMemoryPersistence, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

// Configurazione web del progetto Firebase "fiscal-9a0c8" (valori pubblici,
// la sicurezza è garantita dalle regole Firestore/Storage, non da questi valori).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBtLDRSn5Jo7ZiAqiVJMEch4JLl7dLcFxo",
  authDomain: "fiscal-9a0c8.firebaseapp.com",
  projectId: "fiscal-9a0c8",
  storageBucket: "fiscal-9a0c8.firebasestorage.app",
  messagingSenderId: "203263315808",
  appId: "1:203263315808:web:b0ad8d1e3f92c478fc9805",
};

// Solo in `vite dev`: una build di produzione non può mai puntare agli emulatori.
export const USE_EMULATORS = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true";
// Con gli emulatori, il telefono in LAN raggiunge il PC allo stesso host della pagina.
const EMU_HOST = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";

export const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
auth.languageCode = "it";
export const db = getFirestore(app);

if (USE_EMULATORS) {
  connectAuthEmulator(auth, `http://${EMU_HOST}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMU_HOST, 8080);
}

/**
 * Istanza Auth secondaria: permette all'admin di creare l'account di un
 * negozio senza perdere la propria sessione (funziona anche senza Cloud Functions).
 */
export async function withSecondaryAuth<T>(fn: (a: Auth) => Promise<T>): Promise<T> {
  const name = `secondary-${Math.random().toString(36).slice(2)}`;
  const secondary: FirebaseApp = initializeApp(FIREBASE_CONFIG, name);
  // In memoria: la sessione del nuovo account negozio non resta salvata nel browser dell'admin.
  const a = initializeAuth(secondary, { persistence: inMemoryPersistence });
  a.languageCode = "it";
  if (USE_EMULATORS) connectAuthEmulator(a, `http://${EMU_HOST}:9099`, { disableWarnings: true });
  try {
    return await fn(a);
  } finally {
    await deleteApp(secondary).catch(() => {});
  }
}

/** URL pubblico usato nei QR dei negozi e nei link. */
export function publicBaseUrl(): string {
  const env = import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined;
  return (env && env.trim()) || window.location.origin;
}
