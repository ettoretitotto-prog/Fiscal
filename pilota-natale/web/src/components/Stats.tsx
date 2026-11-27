import { useState } from "react";
import { adminExport, fmtEuro, fnError, type ShopStats } from "../lib/api";
import { downloadCsv } from "../lib/csv";
import { Alert, Button } from "./ui";

export const METRICS: { key: keyof ShopStats; label: string; euro?: boolean }[] = [
  { key: "proofsCreated", label: "Prove create" },
  { key: "linksOpened", label: "Link regalo aperti" },
  { key: "giftsSentByEmail", label: "Regali inviati per email" },
  { key: "recipientsSaved", label: "Salvati dal destinatario" },
  { key: "exchanges", label: "Cambi" },
  { key: "discountsUsed", label: "Sconti usati" },
  { key: "extraSpentCents", label: "Speso in più", euro: true },
  { key: "marketingConsents", label: "Consensi marketing" },
];

export function fmtMetric(s: ShopStats, m: (typeof METRICS)[number]): string {
  const v = s[m.key] as number;
  return m.euro ? fmtEuro(v) : String(v);
}

export function MetricGrid({ stats }: { stats: ShopStats }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {METRICS.map((m) => (
        <div key={m.key} className="rounded-xl bg-stone-50 p-3">
          <dt className="text-xs text-stone-500">{m.label}</dt>
          <dd className="text-2xl font-bold tabular-nums">{fmtMetric(stats, m)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ExportButtons({ shopId }: { shopId?: string }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const suffix = shopId ?? "tutti";
  const day = new Date().toISOString().slice(0, 10);

  async function run(kind: "proofs" | "marketing" | "events", name: string) {
    setBusy(kind);
    setError("");
    try {
      const { rows } = await adminExport(kind, shopId);
      downloadCsv(`fiscal-${name}-${suffix}-${day}.csv`, rows);
    } catch (e) {
      setError(fnError(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="secondary" busy={busy === "proofs"} onClick={() => run("proofs", "prove")}>CSV prove</Button>
        <Button variant="secondary" busy={busy === "events"} onClick={() => run("events", "eventi")}>CSV eventi</Button>
        <Button variant="secondary" busy={busy === "marketing"} onClick={() => run("marketing", "consensi-marketing")}>CSV consensi marketing</Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
