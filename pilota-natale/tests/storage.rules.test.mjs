// Test delle regole Storage (emulatore):  npm run test:rules
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

let env;
const IMG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fiscal-rules",
    storage: { rules: readFileSync(new URL("../storage.rules", import.meta.url), "utf8") },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), "receipts/negozio-a/p1.jpg"), IMG, { contentType: "image/jpeg" });
  });
});
after(() => env.cleanup());

const as = (uid) => env.authenticatedContext(uid).storage();
const anon = () => env.unauthenticatedContext().storage();

describe("storage", () => {
  test("chi regala carica la foto nella propria cartella", () =>
    assertSucceeds(uploadBytes(ref(as("u1"), "uploads/u1/abcdefgh12.jpg"), IMG, { contentType: "image/jpeg" })));
  test("non nella cartella di un altro", () =>
    assertFails(uploadBytes(ref(as("u1"), "uploads/u2/abcdefgh12.jpg"), IMG, { contentType: "image/jpeg" })));
  test("senza login no", () =>
    assertFails(uploadBytes(ref(anon(), "uploads/u1/abcdefgh13.jpg"), IMG, { contentType: "image/jpeg" })));
  test("solo immagini", () =>
    assertFails(uploadBytes(ref(as("u1"), "uploads/u1/abcdefgh14.jpg"), IMG, { contentType: "application/pdf" })));
  test("niente SVG (potrebbe contenere script)", () =>
    assertFails(uploadBytes(ref(as("u1"), "uploads/u1/abcdefgh16.png"), IMG, { contentType: "image/svg+xml" })));
  test("niente file troppo grandi", () =>
    assertFails(uploadBytes(ref(as("u1"), "uploads/u1/abcdefgh15.jpg"), new Uint8Array(11 * 1024 * 1024), { contentType: "image/jpeg" })));
  test("nessuno rilegge il proprio upload dal client", () =>
    assertFails(getBytes(ref(as("u1"), "uploads/u1/abcdefgh12.jpg"))));
  test("nessuno sovrascrive o cancella", async () => {
    await assertFails(uploadBytes(ref(as("u1"), "uploads/u1/abcdefgh12.jpg"), IMG, { contentType: "image/jpeg" }));
    await assertFails(deleteObject(ref(as("u1"), "uploads/u1/abcdefgh12.jpg")));
  });
  test("le foto degli scontrini non sono mai leggibili dai client", async () => {
    await assertFails(getBytes(ref(anon(), "receipts/negozio-a/p1.jpg")));
    await assertFails(getBytes(ref(as("u1"), "receipts/negozio-a/p1.jpg")));
    await assertFails(uploadBytes(ref(as("u1"), "receipts/negozio-a/p2.jpg"), IMG, { contentType: "image/jpeg" }));
  });
});
