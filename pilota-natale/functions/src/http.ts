import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getAuth } from "firebase-admin/auth";
import QRCode from "qrcode";
import type { Response } from "express";
import { REGION, TOKEN_RE, bucket, db, giftUrl, profileOf, sha256 } from "./common";
import type { Proof } from "./proofs";

/**
 * Endpoint HTTP dietro Firebase Hosting (/api/**):
 *   GET /api/qr/{giftToken}.png          → QR del link regalo (per le email)
 *   GET /api/receipt/o/{ownerToken}      → foto scontrino per chi ha creato la prova (link privato)
 *   GET /api/receipt/p/{proofId}         → foto scontrino per il negozio proprietario
 *                                          (header Authorization: Bearer <ID token>)
 * La pagina del destinatario non ha alcun modo di ottenere la foto.
 */
export const api = onRequest({ region: REGION, memory: "512MiB", cors: false }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).send("Metodo non consentito");
    return;
  }
  const path = req.path.replace(/^\/api(?=\/)/, "");
  try {
    let m = /^\/qr\/([A-Za-z0-9_-]{43})\.png$/.exec(path);
    if (m) {
      const q = await db.collection("proofs").where("giftToken", "==", m[1]).limit(1).get();
      if (q.empty) return void res.status(404).send("Non trovato");
      const png = await QRCode.toBuffer(giftUrl(m[1]), { width: 360, margin: 2, errorCorrectionLevel: "M" });
      res.set("Cache-Control", "public, max-age=86400").type("image/png").send(png);
      return;
    }

    m = /^\/receipt\/o\/([A-Za-z0-9_-]{43})$/.exec(path);
    if (m && TOKEN_RE.test(m[1])) {
      const q = await db.collection("proofs").where("ownerTokenHash", "==", sha256(m[1])).limit(1).get();
      if (q.empty) return void res.status(404).send("Non trovato");
      return void (await streamReceipt(q.docs[0].data() as Proof, res));
    }

    m = /^\/receipt\/p\/([A-Za-z0-9]{5,40})$/.exec(path);
    if (m) {
      const authz = req.get("Authorization") ?? "";
      const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
      if (!idToken) return void res.status(401).send("Accesso richiesto");
      let uid: string;
      try {
        uid = (await getAuth().verifyIdToken(idToken)).uid;
      } catch {
        return void res.status(401).send("Accesso scaduto");
      }
      const prof = await profileOf(uid);
      const snap = await db.doc(`proofs/${m[1]}`).get();
      if (!snap.exists) return void res.status(404).send("Non trovato");
      const p = snap.data() as Proof;
      if (prof?.role !== "shop" || prof.shopId !== p.shopId) return void res.status(403).send("Non autorizzato");
      return void (await streamReceipt(p, res));
    }

    res.status(404).send("Non trovato");
  } catch (e) {
    logger.error("api error", { path, err: String(e) });
    res.status(500).send("Errore");
  }
});

async function streamReceipt(p: Proof, res: Response) {
  if (!p.receiptPath) {
    res.status(410).send("Foto non più disponibile");
    return;
  }
  const [buf] = await bucket().file(p.receiptPath).download();
  res.set("Cache-Control", "private, no-store").set("X-Robots-Tag", "noindex").type(p.receiptContentType || "image/jpeg").send(buf);
}
