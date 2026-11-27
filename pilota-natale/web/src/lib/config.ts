// Configurazione web Firebase, risolta all'avvio:
// 1. sviluppo con emulatori → progetto "demo-fiscal-natale" (nessuna risorsa reale);
// 2. VITE_FIREBASE_CONFIG (JSON) se impostata;
// 3. altrimenti /__/firebase/init.json, che Firebase Hosting fornisce in automatico
//    con la configurazione del progetto su cui è pubblicato il sito.
export interface WebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId?: string;
  appId?: string;
}

export const USE_EMULATORS = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true";
export const DEMO_PROJECT_ID = "demo-fiscal-natale";

let config: WebConfig | null = null;

export async function loadConfig(): Promise<WebConfig> {
  if (config) return config;
  if (USE_EMULATORS) {
    config = {
      apiKey: "demo-api-key",
      authDomain: `${DEMO_PROJECT_ID}.firebaseapp.com`,
      projectId: DEMO_PROJECT_ID,
      storageBucket: `${DEMO_PROJECT_ID}.appspot.com`,
      appId: "demo-app",
    };
    return config;
  }
  const fromEnv = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
  if (fromEnv) {
    config = JSON.parse(fromEnv) as WebConfig;
    return config;
  }
  const res = await fetch("/__/firebase/init.json");
  if (!res.ok) throw new Error("Configurazione Firebase non disponibile");
  config = (await res.json()) as WebConfig;
  return config;
}

export function getConfig(): WebConfig {
  if (!config) throw new Error("loadConfig() non ancora chiamato");
  return config;
}
