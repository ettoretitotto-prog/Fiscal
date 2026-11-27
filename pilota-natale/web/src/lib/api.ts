import { call } from "./firebase";
import { PRIVACY_VERSION } from "./privacy";

export type ProofStatus = "active" | "exchanged";

export interface CreateProofResult { code: string; ownerToken: string; giftUrl: string; ownerUrl: string; emailSent: boolean }
export const createProof = (d: {
  shopId: string; uploadPath: string; description: string; email: string; marketing: boolean; sessionId: string;
}) => call<typeof d & { policyVersion: string }, CreateProofResult>("createProof", { ...d, policyVersion: PRIVACY_VERSION });

export interface GiftSend { id: string; toEmail: string | null; status: "scheduled" | "sending" | "sent" | "failed" | "cancelled"; scheduledAt: number | null; sentAt: number | null }
export interface OwnerProof {
  shopName: string; shopAddress: string; exchangeRules: string; discountText: string;
  description: string; code: string; buyerEmail: string; purchaseDate: number; giftUrl: string;
  receiptAvailable: boolean; status: ProofStatus; exchangedAt: number | null; discountUsedAt: number | null;
  opened: boolean; recipientSaved: boolean; sends: GiftSend[];
}
export const getOwnerProof = (ownerToken: string) => call<{ ownerToken: string }, OwnerProof>("getOwnerProof", { ownerToken });
export const sendGift = (d: { ownerToken: string; toEmail: string; fromName: string; message: string; scheduledAt: number | null }) =>
  call<typeof d, GiftSend & { retrying: boolean }>("sendGift", d);
export const cancelGiftSend = (ownerToken: string, sendId: string) =>
  call<{ ownerToken: string; sendId: string }, { ok: true }>("cancelGiftSend", { ownerToken, sendId });

export interface PublicGift {
  shopName: string; shopAddress: string; exchangeRules: string; discountText: string;
  description: string; purchaseDate: number; code: string; giftUrl: string;
  status: ProofStatus; exchangedAt: number | null; discountUsedAt: number | null; saved: boolean;
}
export const openGift = (giftToken: string, countOpen: boolean) =>
  call<{ giftToken: string; countOpen: boolean }, PublicGift>("openGift", { giftToken, countOpen });
export const saveGift = (d: { giftToken: string; email: string; marketing: boolean }) =>
  call<typeof d & { policyVersion: string }, { ok: true; emailSent: boolean }>("saveGift", { ...d, policyVersion: PRIVACY_VERSION });

export interface ShopProof {
  id: string; code: string; description: string; purchaseDate: number; status: ProofStatus;
  exchangedAt: number | null; discountUsedAt: number | null; extraSpentCents: number;
  receiptAvailable: boolean; recipientSaved: boolean;
}
export type LookupResult =
  | { valid: true; proof: ShopProof }
  | { valid: false; reason: "not_found" | "other_shop" | "bad_code" };
export const shopLookup = (query: string) => call<{ query: string }, LookupResult>("shopLookup", { query });
export const shopAction = (d: { proofId: string; action: "exchange" | "discount"; extraSpent?: number | null }) =>
  call<typeof d, { already: boolean; at: number; proof: ShopProof }>("shopAction", d);

export interface ShopStats {
  shopId: string; shopName: string; proofsCreated: number; linksOpened: number; totalOpens: number;
  giftsSentByEmail: number; recipientsSaved: number; exchanges: number; discountsUsed: number;
  extraSpentCents: number; marketingConsents: number;
}
export const adminStats = () => call<Record<string, never>, { generatedAt: number; shops: ShopStats[] }>("adminStats", {});
export const adminExport = (kind: "proofs" | "marketing" | "events", shopId?: string) =>
  call<{ kind: string; shopId?: string }, { rows: Record<string, string | number | null>[] }>("adminExport", { kind, shopId });

// ---------- formattazione ----------
const TZ = "Europe/Rome";
export const fmtDate = (ms: number | null | undefined) =>
  ms ? new Intl.DateTimeFormat("it-IT", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(ms) : "";
export const fmtDateTime = (ms: number | null | undefined) =>
  ms ? new Intl.DateTimeFormat("it-IT", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms) : "";
export const fmtEuro = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);

/** Messaggio leggibile da un errore di Cloud Function. */
export function fnError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? "";
  if (code.startsWith("storage/") || code.startsWith("auth/")) {
    if (code === "storage/unauthorized") return "Foto non accettata (solo foto, max 10 MB). Rifai la foto.";
    if (/retry-limit|canceled|network/.test(code)) return "Connessione assente o lenta. Riprova.";
    return "Caricamento non riuscito. Riprova.";
  }
  if (err?.code === "functions/unavailable" || err?.code === "functions/internal" && !err.message) return "Servizio momentaneamente non disponibile. Riprova.";
  if (err?.message && !/^(internal|INTERNAL)$/.test(err.message)) return err.message;
  return "Si è verificato un errore. Riprova.";
}
