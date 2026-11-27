import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { createHash, randomBytes, randomInt } from "node:crypto";

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const bucket = () => getStorage().bucket();
export { FieldValue, Timestamp };

export const REGION = "europe-west1";
export const TZ = "Europe/Rome";
export const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

/** Versione dell'informativa: deve coincidere con web/src/lib/privacy.ts. */
export const PRIVACY_VERSION = "2026-11-v1";

/** Giorni dopo la creazione oltre i quali la foto dello scontrino viene cancellata. */
export const RECEIPT_RETENTION_DAYS = 180;

// URL pubblico del sito (link nelle email), da functions/.env. Vuoto = https://{progetto}.web.app
export function baseUrl(): string {
  const v = (process.env.PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (v) return v;
  const project = process.env.GCLOUD_PROJECT ?? JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId;
  return IS_EMULATOR ? "http://localhost:5173" : `https://${project}.web.app`;
}

export const giftUrl = (giftToken: string) => `${baseUrl()}/r/${giftToken}`;
export const ownerUrl = (ownerToken: string) => `${baseUrl()}/c/${ownerToken}`;

// ---------- token e codici ----------

/** Token non indovinabile: 32 byte casuali (256 bit) in base64url. */
export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Alfabeto senza caratteri ambigui (niente 0/O, 1/I/L). */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LEN = 4;
export function randomCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `FSC-${s}`;
}
/** Normalizza ciò che digita il negoziante: "fsc 7k3p", "7K3P", "FSC-7K3P" → "FSC-7K3P". */
export function normalizeCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^FSC/, "");
  if (raw.length !== CODE_LEN) return null;
  for (const c of raw) if (!CODE_ALPHABET.includes(c)) return null;
  return `FSC-${raw}`;
}

// ---------- validazione input ----------

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function str(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== "string") throw new HttpsError("invalid-argument", `Campo ${field} mancante.`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpsError("invalid-argument", `Campo ${field} non valido.`);
  return s;
}
export function email(v: unknown, field = "email"): string {
  const s = str(v, field, 5, 254).toLowerCase();
  if (!EMAIL_RE.test(s)) throw new HttpsError("invalid-argument", "Indirizzo email non valido.");
  return s;
}
export function token(v: unknown): string {
  if (typeof v !== "string" || !TOKEN_RE.test(v)) throw new HttpsError("not-found", "Link non valido.");
  return v;
}
export const bool = (v: unknown) => v === true;

// ---------- ruoli ----------

export interface Profile { role: "admin" | "shop"; shopId?: string; email?: string }

export async function profileOf(uid: string | undefined): Promise<Profile | null> {
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists ? (snap.data() as Profile) : null;
}

export async function requireShop(req: CallableRequest): Promise<{ uid: string; shopId: string }> {
  const uid = req.auth?.uid;
  if (!uid || req.auth?.token.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "Accedi con l'account del negozio.");
  }
  const p = await profileOf(uid);
  if (p?.role !== "shop" || !p.shopId) throw new HttpsError("permission-denied", "Account non abilitato come negozio.");
  return { uid, shopId: p.shopId };
}

export async function requireAdmin(req: CallableRequest): Promise<string> {
  const uid = req.auth?.uid;
  const p = await profileOf(uid);
  if (!uid || p?.role !== "admin") throw new HttpsError("permission-denied", "Solo admin.");
  return uid;
}

// ---------- rate limit semplice (finestra oraria) ----------

export async function rateLimit(key: string, maxPerHour: number): Promise<void> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const ref = db.doc(`rateLimits/${sha256(key).slice(0, 40)}_${hour}`);
  const ok = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const n = (snap.exists ? (snap.data()!.n as number) : 0) + 1;
    if (n > maxPerHour) return false;
    tx.set(ref, { n, expiresAt: Timestamp.fromMillis((hour + 2) * 3_600_000) });
    return true;
  });
  if (!ok) throw new HttpsError("resource-exhausted", "Troppe richieste. Riprova tra un po'.");
}

// ---------- eventi per le metriche ----------

export type EventType =
  | "proof_created" | "link_opened" | "recipient_saved" | "gift_sent"
  | "exchange" | "discount_used" | "extra_spent";

export function eventData(type: EventType, shopId: string, proofId: string, extra: Record<string, unknown> = {}) {
  return { type, shopId, proofId, at: FieldValue.serverTimestamp(), ...extra };
}
export async function logEvent(type: EventType, shopId: string, proofId: string, extra: Record<string, unknown> = {}) {
  await db.collection("events").add(eventData(type, shopId, proofId, extra));
}

// ---------- formattazione ----------

export function fmtDate(ts: Timestamp | Date | undefined | null, withTime = false): string {
  if (!ts) return "";
  const d = ts instanceof Timestamp ? ts.toDate() : ts;
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ, day: "numeric", month: "long", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}
export const tsMillis = (t: Timestamp | undefined | null) => (t ? t.toMillis() : null);
