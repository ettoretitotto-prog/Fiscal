import { onCall } from "firebase-functions/v2/https";
import { REGION, db, requireAdmin, tsMillis } from "./common";
import type { Proof } from "./proofs";

interface ShopStats {
  shopId: string;
  proofsCreated: number;
  linksOpened: number;
  totalOpens: number;
  giftsSentByEmail: number;
  recipientsSaved: number;
  exchanges: number;
  discountsUsed: number;
  extraSpentCents: number;
  marketingConsents: number;
}

/** Ultimo consenso marketing per (email, negozio): conta solo chi è ancora "sì". */
async function marketingByShop(): Promise<Map<string, Map<string, { granted: boolean; at: number; role: string; version: string }>>> {
  const snap = await db.collection("consents").where("kind", "==", "marketing").get();
  const byShop = new Map<string, Map<string, { granted: boolean; at: number; role: string; version: string }>>();
  for (const d of snap.docs) {
    const c = d.data();
    const at = tsMillis(c.at) ?? 0;
    if (!byShop.has(c.shopId)) byShop.set(c.shopId, new Map());
    const m = byShop.get(c.shopId)!;
    const prev = m.get(c.email);
    if (!prev || prev.at <= at) m.set(c.email, { granted: !!c.granted, at, role: c.role, version: c.policyVersion });
  }
  return byShop;
}

/** Metriche per negozio per la dashboard admin. */
export const adminStats = onCall({ region: REGION }, async (req) => {
  await requireAdmin(req);
  const [shops, proofs, sends, mkt] = await Promise.all([
    db.collection("shops").get(),
    db.collection("proofs").get(),
    db.collection("giftSends").where("status", "==", "sent").get(),
    marketingByShop(),
  ]);
  const stats = new Map<string, ShopStats>();
  const get = (shopId: string) => {
    if (!stats.has(shopId)) {
      stats.set(shopId, {
        shopId, proofsCreated: 0, linksOpened: 0, totalOpens: 0, giftsSentByEmail: 0, recipientsSaved: 0,
        exchanges: 0, discountsUsed: 0, extraSpentCents: 0, marketingConsents: 0,
      });
    }
    return stats.get(shopId)!;
  };
  shops.docs.forEach((s) => get(s.id));
  for (const d of proofs.docs) {
    const p = d.data() as Proof;
    const s = get(p.shopId);
    s.proofsCreated++;
    if (p.openCount > 0) s.linksOpened++;
    s.totalOpens += p.openCount ?? 0;
    if (p.recipientSavedAt) s.recipientsSaved++;
    if (p.status === "exchanged") s.exchanges++;
    if (p.discountUsedAt) s.discountsUsed++;
    s.extraSpentCents += p.extraSpentCents ?? 0;
  }
  for (const d of sends.docs) get(d.data().shopId).giftsSentByEmail++;
  for (const [shopId, m] of mkt) get(shopId).marketingConsents = [...m.values()].filter((v) => v.granted).length;

  const names = new Map(shops.docs.map((s) => [s.id, s.data().name as string]));
  return {
    generatedAt: Date.now(),
    shops: [...stats.values()].map((s) => ({ ...s, shopName: names.get(s.shopId) ?? s.shopId })),
  };
});

/** Dati per l'esportazione CSV. kind = "proofs" | "marketing" | "events". */
export const adminExport = onCall({ region: REGION }, async (req) => {
  await requireAdmin(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const shopId = typeof d.shopId === "string" && d.shopId ? d.shopId : null;
  const kind = d.kind;

  if (kind === "marketing") {
    const mkt = await marketingByShop();
    const rows: Record<string, unknown>[] = [];
    for (const [sid, m] of mkt) {
      if (shopId && sid !== shopId) continue;
      for (const [emailAddr, v] of m) {
        if (!v.granted) continue;
        rows.push({ negozio: sid, email: emailAddr, ruolo: v.role === "buyer" ? "acquirente" : "destinatario", consenso_il: v.at, versione_informativa: v.version });
      }
    }
    return { rows };
  }

  if (kind === "events") {
    let q: FirebaseFirestore.Query = db.collection("events");
    if (shopId) q = q.where("shopId", "==", shopId);
    const snap = await q.get();
    return {
      rows: snap.docs.map((e) => {
        const v = e.data();
        return { negozio: v.shopId, evento: v.type, prova: v.proofId, data: tsMillis(v.at), importo_cent: v.amountCents ?? "" };
      }),
    };
  }

  // Default: prove (senza email né foto: minimizzazione dei dati)
  let q: FirebaseFirestore.Query = db.collection("proofs");
  if (shopId) q = q.where("shopId", "==", shopId);
  const snap = await q.get();
  return {
    rows: snap.docs.map((doc) => {
      const p = doc.data() as Proof;
      return {
        negozio: p.shopId,
        codice: p.code,
        creata_il: tsMillis(p.createdAt),
        descrizione: p.description,
        stato: p.status === "exchanged" ? "cambiata" : "attiva",
        cambio_il: tsMillis(p.exchangedAt) ?? "",
        sconto_il: tsMillis(p.discountUsedAt) ?? "",
        speso_in_piu_eur: ((p.extraSpentCents ?? 0) / 100).toFixed(2).replace(".", ","),
        aperture_link: p.openCount ?? 0,
        salvata_dal_destinatario: p.recipientSavedAt ? "sì" : "no",
        marketing_acquirente: p.buyerMarketing ? "sì" : "no",
      };
    }),
  };
});
