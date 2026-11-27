import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "shop";

export interface UserProfile {
  role: Role;
  shopId?: string;
  email?: string;
}

/** Informazioni pubbliche del negozio (shops/{shopId}). */
export interface Shop {
  id: string;
  name: string;
  address: string;
  exchangeRules: string;
  discountText: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** Dati riservati del negozio, solo admin (shopAccounts/{shopId}). */
export interface ShopAccount {
  loginEmail: string;
  uid: string;
  createdAt?: Timestamp;
}
