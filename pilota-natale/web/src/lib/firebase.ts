import { initializeApp, getApp, getApps, deleteApp, type FirebaseApp } from "firebase/app";
import { getAuth, initializeAuth, inMemoryPersistence, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { getConfig, USE_EMULATORS } from "./config";

// Questo modulo va importato solo DOPO loadConfig() (vedi main.tsx / boot.tsx).
const cfg = getConfig();
// Con gli emulatori il telefono in LAN raggiunge il PC allo stesso host della pagina.
const EMU_HOST = window.location.hostname;

export const app = getApps().length ? getApp() : initializeApp(cfg);
export const auth = getAuth(app);
auth.languageCode = "it";
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "europe-west1");

if (USE_EMULATORS) {
  connectAuthEmulator(auth, `http://${EMU_HOST}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMU_HOST, 8080);
  connectStorageEmulator(storage, EMU_HOST, 9199);
  connectFunctionsEmulator(functions, EMU_HOST, 5001);
}

/** Chiama una Cloud Function "callable". */
export async function call<I, O>(name: string, data: I): Promise<O> {
  const res = await httpsCallable<I, O>(functions, name)(data);
  return res.data;
}

/**
 * Istanza Auth secondaria in memoria: permette all'admin di creare l'account di un
 * negozio senza perdere la propria sessione.
 */
export async function withSecondaryAuth<T>(fn: (a: Auth) => Promise<T>): Promise<T> {
  const name = `secondary-${Math.random().toString(36).slice(2)}`;
  const secondary: FirebaseApp = initializeApp(cfg, name);
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
