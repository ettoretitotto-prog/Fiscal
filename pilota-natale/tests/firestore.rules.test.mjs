// Test delle regole Firestore (eseguiti con l'emulatore):  npm run test:rules
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, writeBatch, collection, getDocs, deleteDoc } from "firebase/firestore";

let env;
const shop = (o = {}) => ({
  name: "Negozio", address: "Via Roma 1", exchangeRules: "Cambio entro il 31/01",
  discountText: "10%", active: true, ...o,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fiscal-rules",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/admin1"), { role: "admin" });
    await setDoc(doc(db, "users/shopA"), { role: "shop", shopId: "negozio-a" });
    await setDoc(doc(db, "users/shopB"), { role: "shop", shopId: "negozio-b" });
    await setDoc(doc(db, "shops/negozio-a"), shop({ name: "A" }));
    await setDoc(doc(db, "shops/negozio-b"), shop({ name: "B" }));
    await setDoc(doc(db, "shopAccounts/negozio-a"), { loginEmail: "a@x.it", uid: "shopA" });
    await setDoc(doc(db, "proofs/p1"), { shopId: "negozio-a", receiptPath: "x" });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const as = (uid) => env.authenticatedContext(uid).firestore();

describe("shops", () => {
  test("chiunque legge un negozio per ID", () => assertSucceeds(getDoc(doc(anon(), "shops/negozio-a"))));
  test("l'elenco negozi è solo admin", async () => {
    await assertFails(getDocs(collection(anon(), "shops")));
    await assertFails(getDocs(collection(as("shopA"), "shops")));
    await assertSucceeds(getDocs(collection(as("admin1"), "shops")));
  });
  test("admin crea un negozio valido", () => assertSucceeds(setDoc(doc(as("admin1"), "shops/nuovo-negozio"), shop())));
  test("ID negozio non valido rifiutato", () => assertFails(setDoc(doc(as("admin1"), "shops/AB"), shop())));
  test("campi extra rifiutati", () => assertFails(setDoc(doc(as("admin1"), "shops/nuovo"), shop({ hacked: 1 }))));
  test("anonimo/negozio non creano negozi", async () => {
    await assertFails(setDoc(doc(anon(), "shops/nuovo"), shop()));
    await assertFails(setDoc(doc(as("shopA"), "shops/nuovo"), shop()));
  });
  test("il negozio modifica solo regole e sconto del proprio negozio", async () => {
    await assertSucceeds(updateDoc(doc(as("shopA"), "shops/negozio-a"), { exchangeRules: "Nuove regole", discountText: "15%" }));
    await assertFails(updateDoc(doc(as("shopA"), "shops/negozio-a"), { name: "Altro nome" }));
    await assertFails(updateDoc(doc(as("shopA"), "shops/negozio-a"), { active: false }));
    await assertFails(updateDoc(doc(as("shopA"), "shops/negozio-b"), { exchangeRules: "x" }));
  });
  test("testi troppo lunghi rifiutati", () =>
    assertFails(updateDoc(doc(as("shopA"), "shops/negozio-a"), { exchangeRules: "x".repeat(601) })));
  test("solo admin elimina", async () => {
    await assertFails(deleteDoc(doc(as("shopA"), "shops/negozio-a")));
    await assertSucceeds(deleteDoc(doc(as("admin1"), "shops/negozio-a")));
  });
});

describe("users (ruoli)", () => {
  test("ognuno legge il proprio profilo, non quello altrui", async () => {
    await assertSucceeds(getDoc(doc(as("shopA"), "users/shopA")));
    await assertFails(getDoc(doc(as("shopA"), "users/shopB")));
    await assertFails(getDoc(doc(anon(), "users/shopA")));
  });
  test("nessuno si promuove admin da solo", async () => {
    await assertFails(setDoc(doc(as("shopA"), "users/shopA"), { role: "admin" }));
    await assertFails(setDoc(doc(as("nuovo"), "users/nuovo"), { role: "admin" }));
  });
  test("admin assegna un negozio solo se esiste (anche nello stesso batch)", async () => {
    await assertFails(setDoc(doc(as("admin1"), "users/u9"), { role: "shop", shopId: "inesistente" }));
    const db = as("admin1");
    const b = writeBatch(db);
    b.set(doc(db, "shops/creato-ora"), shop());
    b.set(doc(db, "users/u9"), { role: "shop", shopId: "creato-ora", email: "z@x.it" });
    await assertSucceeds(b.commit());
  });
});

describe("dati riservati e prove", () => {
  test("shopAccounts solo admin", async () => {
    await assertFails(getDoc(doc(as("shopA"), "shopAccounts/negozio-a")));
    await assertSucceeds(getDoc(doc(as("admin1"), "shopAccounts/negozio-a")));
  });
  test("prove mai accessibili dai client (nemmeno admin)", async () => {
    await assertFails(getDoc(doc(anon(), "proofs/p1")));
    await assertFails(getDoc(doc(as("shopA"), "proofs/p1")));
    await assertFails(setDoc(doc(anon(), "proofs/p2"), { shopId: "negozio-a" }));
  });
});
