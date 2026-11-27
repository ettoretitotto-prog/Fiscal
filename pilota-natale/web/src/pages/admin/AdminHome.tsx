import { useEffect, useState } from "react";
import { Link } from "react-router";
import AdminLayout from "./AdminLayout";
import { listShops } from "../../lib/shops";
import type { Shop } from "../../lib/types";
import { Alert, Card, Spinner, errorMessage } from "../../components/ui";

function ShopList() {
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    listShops().then(setShops).catch((e) => setError(errorMessage(e)));
  }, []);

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
      <ul className="space-y-3">
        {shops?.map((s) => (
          <li key={s.id}>
            <Link to={`/admin/negozi/${s.id}`} className="block rounded-2xl border border-stone-200 bg-white p-4 shadow-sm hover:border-brand">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{s.name}</div>
                  <div className="truncate text-sm text-stone-500">{s.address || "—"}</div>
                  <div className="mt-1 font-mono text-xs text-stone-400">/n/{s.id}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${s.active ? "bg-brand-soft text-brand" : "bg-stone-100 text-stone-500"}`}>
                  {s.active ? "Attivo" : "Disattivato"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function AdminHome() {
  return (
    <AdminLayout>
      <ShopList />
    </AdminLayout>
  );
}
