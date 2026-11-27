import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import AdminLayout from "./AdminLayout";
import { getShop, getShopAccount, sendSetPasswordEmail, shopLink, updateShop } from "../../lib/shops";
import { downloadPosterPdf, downloadPosterPng, downloadQrPng, qrDataUrl } from "../../lib/qr";
import type { Shop, ShopAccount } from "../../lib/types";
import { Alert, Button, Card, Field, Input, Spinner, TextArea, errorMessage } from "../../components/ui";

function ShopDetail({ shopId }: { shopId: string }) {
  const [params] = useSearchParams();
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  const [account, setAccount] = useState<ShopAccount | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string>("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [exchangeRules, setExchangeRules] = useState("");
  const [discountText, setDiscountText] = useState("");

  const link = shopLink(shopId);

  useEffect(() => {
    (async () => {
      try {
        const [s, a] = await Promise.all([getShop(shopId), getShopAccount(shopId)]);
        setShop(s);
        setAccount(a);
        if (s) {
          setName(s.name);
          setAddress(s.address);
          setExchangeRules(s.exchangeRules);
          setDiscountText(s.discountText);
        }
      } catch (e) {
        setError(errorMessage(e));
        setShop(null);
      }
    })();
    qrDataUrl(link, 512).then(setQr);
  }, [shopId, link]);

  async function run(key: string, fn: () => Promise<void>, ok: string) {
    setBusy(key);
    setError("");
    setMsg("");
    try {
      await fn();
      setMsg(ok);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    await run("save", async () => {
      await updateShop(shopId, { name, address, exchangeRules, discountText });
      setShop((s) => (s ? { ...s, name: name.trim(), address: address.trim(), exchangeRules: exchangeRules.trim(), discountText: discountText.trim() } : s));
    }, "Modifiche salvate.");
  }

  if (shop === undefined) return <Spinner />;
  if (shop === null) return <Alert>{error || "Negozio non trovato."}</Alert>;

  const created = params.get("creato") === "1";
  const emailErr = params.get("emailErr");

  return (
    <>
      <Link to="/admin" className="text-sm text-brand underline">← Negozi</Link>
      <div className="mb-5 mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{shop.name}</h1>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${shop.active ? "bg-brand-soft text-brand" : "bg-stone-100 text-stone-500"}`}>
          {shop.active ? "Attivo" : "Disattivato"}
        </span>
      </div>

      {created && !emailErr && (
        <div className="mb-4"><Alert kind="success">Negozio creato. Abbiamo inviato a <strong>{account?.loginEmail}</strong> l'email per impostare la password.</Alert></div>
      )}
      {created && emailErr && (
        <div className="mb-4"><Alert>Negozio creato, ma l'email per la password non è partita ({emailErr}). Usa “Reinvia email password”.</Alert></div>
      )}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {msg && <div className="mb-4"><Alert kind="success">{msg}</Alert></div>}

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">QR del negozio</h2>
          {qr ? <img src={qr} alt={`QR per ${shop.name}`} className="mx-auto w-full max-w-64 rounded-lg border border-stone-200" /> : <Spinner label="Genero il QR…" />}
          <a href={link} target="_blank" rel="noreferrer" className="mt-3 block break-all text-center font-mono text-xs text-brand underline">{link}</a>
          <div className="mt-4 grid gap-2">
            <Button variant="primary" onClick={() => downloadPosterPdf(link, shopId, shop.name)}>Cartello stampabile (PDF A5)</Button>
            <Button variant="secondary" onClick={() => downloadPosterPng(link, shopId, shop.name)}>Cartello (PNG)</Button>
            <Button variant="secondary" onClick={() => downloadQrPng(link, shopId)}>Solo QR (PNG)</Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">Accesso del negozio</h2>
          <p className="text-sm text-stone-600">Email di accesso</p>
          <p className="mb-4 break-all font-semibold">{account?.loginEmail ?? "—"}</p>
          <div className="grid gap-2">
            <Button
              variant="secondary"
              busy={busy === "pwd"}
              disabled={!account}
              onClick={() => run("pwd", () => sendSetPasswordEmail(account!.loginEmail), `Email per la password inviata a ${account?.loginEmail}.`)}
            >
              Reinvia email password
            </Button>
            <Button
              variant={shop.active ? "danger" : "primary"}
              busy={busy === "active"}
              onClick={() =>
                run("active", async () => {
                  await updateShop(shopId, { active: !shop.active });
                  setShop({ ...shop, active: !shop.active });
                }, shop.active ? "Negozio disattivato: il QR non accetta nuove prove." : "Negozio riattivato.")
              }
            >
              {shop.active ? "Disattiva negozio" : "Riattiva negozio"}
            </Button>
          </div>
          <p className="mt-4 text-xs text-stone-500">Le metriche del negozio (prove, link aperti, cambi, sconti, CSV) arrivano al passo 6.</p>
        </Card>
      </div>

      <Card className="mt-5">
        <h2 className="mb-3 font-bold">Dati e regole</h2>
        <form onSubmit={onSave} className="space-y-4">
          <Field label="Nome del negozio"><Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Indirizzo"><Input maxLength={160} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <Field label="Regole di cambio"><TextArea maxLength={600} value={exchangeRules} onChange={(e) => setExchangeRules(e.target.value)} /></Field>
          <Field label="Sconto offerto"><Input maxLength={300} value={discountText} onChange={(e) => setDiscountText(e.target.value)} /></Field>
          <Button type="submit" busy={busy === "save"} className="w-full">Salva modifiche</Button>
        </form>
      </Card>
    </>
  );
}

export default function AdminShop() {
  const { shopId = "" } = useParams();
  return (
    <AdminLayout>
      <ShopDetail shopId={shopId} />
    </AdminLayout>
  );
}
