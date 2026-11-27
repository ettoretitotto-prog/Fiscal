import {
  collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp,
  updateDoc, writeBatch, type FieldValue,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail,
} from "firebase/auth";
import { auth, db, publicBaseUrl, withSecondaryAuth } from "./firebase";
import type { Shop, ShopAccount } from "./types";

export const DEFAULT_RULES =
  "Cambio entro il 31 gennaio 2027 presentando questa prova in negozio. Articolo integro e con cartellino.";
export const DEFAULT_DISCOUNT = "10% sul prossimo acquisto entro il 31/01/2027";

export function slugify(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export const SHOP_ID_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("") + "!A1";
}

export function shopLink(shopId: string): string {
  return `${publicBaseUrl().replace(/\/+$/, "")}/n/${shopId}`;
}

export async function getShop(shopId: string): Promise<Shop | null> {
  const snap = await getDoc(doc(db, "shops", shopId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Shop) : null;
}

export async function listShops(): Promise<Shop[]> {
  const snap = await getDocs(query(collection(db, "shops"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Shop);
}

export async function getShopAccount(shopId: string): Promise<ShopAccount | null> {
  const snap = await getDoc(doc(db, "shopAccounts", shopId));
  return snap.exists() ? (snap.data() as ShopAccount) : null;
}

/** Invia l'email Firebase "imposta/reimposta la password" (gratuita, anche senza Blaze). */
export async function sendSetPasswordEmail(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/negozio` });
  } catch (e: unknown) {
    // Se il dominio non è tra quelli autorizzati, invia comunque senza link di ritorno.
    if ((e as { code?: string }).code === "auth/unauthorized-continue-uri") {
      await sendPasswordResetEmail(auth, email);
    } else {
      throw e;
    }
  }
}

export interface NewShopInput {
  shopId: string;
  name: string;
  address: string;
  loginEmail: string;
  exchangeRules: string;
  discountText: string;
}

export interface CreateShopResult {
  shopId: string;
  emailSent: boolean;
  emailError?: string;
}

/**
 * Crea un negozio:
 * 1. crea l'account Firebase Auth (email + password casuale) con un'istanza secondaria;
 * 2. scrive shops/{id}, shopAccounts/{id}, users/{uid} in un'unica scrittura atomica;
 * 3. invia al negozio l'email per impostare la password.
 * Se il passo 2 fallisce, l'account appena creato viene eliminato.
 */
export async function createShop(input: NewShopInput): Promise<CreateShopResult> {
  const shopId = input.shopId.trim();
  const loginEmail = input.loginEmail.trim().toLowerCase();
  if (!SHOP_ID_RE.test(shopId)) throw new Error("ID negozio non valido (3-40 caratteri: lettere minuscole, numeri, trattini).");
  if (!input.name.trim()) throw new Error("Il nome del negozio è obbligatorio.");
  if (!EMAIL_RE.test(loginEmail)) throw new Error("Email di accesso non valida.");
  if (await getShop(shopId)) throw new Error(`Esiste già un negozio con ID "${shopId}".`);

  await withSecondaryAuth(async (secondaryAuth) => {
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(secondaryAuth, loginEmail, randomPassword());
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "auth/email-already-in-use") throw new Error("Esiste già un account con questa email.");
      if (code === "auth/operation-not-allowed") throw new Error("Abilita il metodo di accesso Email/Password in Firebase Authentication.");
      throw e;
    }
    const uid = cred.user.uid;
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "shops", shopId), {
        name: input.name.trim(),
        address: input.address.trim(),
        exchangeRules: input.exchangeRules.trim(),
        discountText: input.discountText.trim(),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, "shopAccounts", shopId), { loginEmail, uid, createdAt: serverTimestamp() });
      batch.set(doc(db, "users", uid), { role: "shop", shopId, email: loginEmail, createdAt: serverTimestamp() });
      await batch.commit();
    } catch (e) {
      await deleteUser(cred.user).catch(() => {});
      throw e;
    }
  });

  try {
    await sendSetPasswordEmail(loginEmail);
    return { shopId, emailSent: true };
  } catch (e: unknown) {
    return { shopId, emailSent: false, emailError: (e as Error).message };
  }
}

export type ShopPatch = Partial<Pick<Shop, "name" | "address" | "exchangeRules" | "discountText" | "active">>;

export async function updateShop(shopId: string, patch: ShopPatch): Promise<void> {
  const clean: Record<string, string | boolean | FieldValue> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(patch)) clean[k] = typeof v === "string" ? v.trim() : v;
  await updateDoc(doc(db, "shops", shopId), clean);
}
