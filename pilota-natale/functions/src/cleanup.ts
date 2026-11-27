import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { REGION, TZ, bucket, db, Timestamp } from "./common";

/**
 * Ogni notte:
 * - cancella le foto degli scontrini oltre il periodo di conservazione;
 * - cancella le foto caricate ma mai confermate (uploads/ più vecchi di 24 ore);
 * - pulisce i contatori del rate limit scaduti;
 * - cancella le email dei destinatari degli invii conclusi da più di 30 giorni
 *   (servivano solo per la consegna).
 */
export const nightlyCleanup = onSchedule(
  { schedule: "every day 03:30", timeZone: TZ, region: REGION, timeoutSeconds: 540 },
  async () => {
    const now = Timestamp.now();
    // Foto scadute: receiptDeleteAt torna null, così il documento esce dalla query.
    let photos = 0;
    for (;;) {
      const expired = await db.collection("proofs").where("receiptDeleteAt", "<=", now).limit(200).get();
      if (expired.empty) break;
      for (const d of expired.docs) {
        const path = d.data().receiptPath as string | null;
        if (path) await bucket().file(path).delete({ ignoreNotFound: true });
        await d.ref.update({ receiptPath: null, receiptDeleteAt: null, receiptDeletedAt: now });
        photos++;
      }
    }

    const [files] = await bucket().getFiles({ prefix: "uploads/" });
    const cutoff = Date.now() - 24 * 3_600_000;
    let uploads = 0;
    for (const f of files) {
      if (new Date(f.metadata.timeCreated ?? 0).getTime() < cutoff) {
        await f.delete({ ignoreNotFound: true });
        uploads++;
      }
    }

    const rl = await db.collection("rateLimits").where("expiresAt", "<=", now).limit(450).get();
    const batch = db.batch();
    rl.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    const old = Timestamp.fromMillis(Date.now() - 30 * 86_400_000);
    let redacted = 0;
    for (const status of ["sent", "cancelled", "failed"]) {
      let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      for (;;) {
        let q = db.collection("giftSends").where("status", "==", status).where("scheduledAt", "<=", old).orderBy("scheduledAt").limit(300);
        if (last) q = q.startAfter(last);
        const sends = await q.get();
        if (sends.empty) break;
        last = sends.docs[sends.docs.length - 1];
        for (const d of sends.docs) {
          if (d.data().toEmail === null) continue;
          await d.ref.update({ toEmail: null, fromName: null, message: null, redactedAt: now });
          redacted++;
        }
      }
    }

    logger.info("Pulizia notturna", { photos, uploads, rateLimits: rl.size, redacted });
  },
);
