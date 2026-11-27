import { useEffect, useState } from "react";
import { Link } from "react-router";
import AdminLayout from "./AdminLayout";
import { listShops } from "../../lib/shops";
import type { Shop } from "../../lib/types";
import { adminStats, fmtDateTime, fnError, type ShopStats } from "../../lib/api";
import { Alert, Card, Spinner, errorMessage } from "../../components/ui";
import { ExportButtons, METRICS, fmtMetric } from "../../components/Stats";

function Dashboard() {
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [stats, setStats] = useState<{ generatedAt: number; shops: ShopStats[] } | null>(null);
  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");

  useEffect(() => {
    listShops().then(setShops).catch((e) => setError(errorMessage(e)));
    adminStats().then(setStats).catch((e) => setStatsError(fnError(e)));
  }, []);

  const byShop = new Map(stats?.shops.map((s) => [s.shopId, s]) ?? []);
  const total: ShopStats | null = stats
    ? stats.shops.reduce<ShopStats>(
        (acc, s) => {
          for (const m of METRICS) (acc[m.key] as number) += s[m.key] as number;
          acc.totalOpens += s.totalOpens;
          return acc;
        },
        { shopId: "", shopName: "Totale", proofsCreated: 0, linksOpened: 0, totalOpens: 0, giftsSentByEmail: 0, recipientsSaved: 0, exchanges: 0, discountsUsed: 0, extraSpentCents: 0, marketingConsents: 0 },
      )
    : null;

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Negozi</h1>
        <Link to="/admin/negozi/nuovo" className="rounded-xl bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark">
          + Nuovo negozio
        </Link>
      </div>
      {error && <Alert>{error}</Alert>}
      {!shops && !error && <Spinner />}
      {shops?.length === 0 && (
        <Card><p className="text-stone-600">Nessun negozio ancora. Crea il primo con “Nuovo negozio”.</p></Card>
      )}

      {shops && shops.length > 0 && (
        <Card className="mb-5 overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500">
              <tr>
                <th className="px-4 py-3">Negozio</th>
                {METRICS.map((m) => <th key={m.key} className="px-2 py-3 text-right">{m.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {shops.map((s) => {
                const st = byShop.get(s.id);
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <Link to={`/admin/negozi/${s.id}`} className="font-semibold text-brand underline">{s.name}</Link>
                      {!s.active && <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">Disattivato</span>}
                      <div className="font-mono text-xs text-stone-400">/n/{s.id}</div>
                    </td>
                    {METRICS.map((m) => (
                      <td key={m.key} className="px-2 py-3 text-right tabular-nums">{st ? fmtMetric(st, m) : "…"}</td>
                    ))}
                  </tr>
                );
              })}
              {total && (
                <tr className="bg-stone-50 font-bold">
                  <td className="px-4 py-3">Totale</td>
                  {METRICS.map((m) => <td key={m.key} className="px-2 py-3 text-right tabular-nums">{fmtMetric(total, m)}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
      {statsError && <div className="mb-4"><Alert>Metriche non disponibili: {statsError}</Alert></div>}
      {stats && <p className="mb-3 text-xs text-stone-500">Aggiornate al {fmtDateTime(stats.generatedAt)} · ricarica la pagina per aggiornare.</p>}

      <Card>
        <h2 className="mb-3 font-bold">Esporta (tutti i negozi)</h2>
        <ExportButtons />
      </Card>
    </>
  );
}

export default function AdminHome() {
  return (
    <AdminLayout>
      <Dashboard />
    </AdminLayout>
  );
}
