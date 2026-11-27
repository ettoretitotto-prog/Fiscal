import { useEffect, useRef, useState, type FormEvent } from "react";
import { LogoutButton, RequireRole } from "../../components/Auth";
import { Alert, Button, Card, Field, Input, Page, Spinner, TextArea, errorMessage } from "../../components/ui";
import { useSession } from "../../lib/session";
import { getShop, updateShop } from "../../lib/shops";
import type { Shop } from "../../lib/types";
import { auth } from "../../lib/firebase";
import {
  fmtDate, fmtDateTime, fmtEuro, fnError, shopAction, shopLookup, type LookupResult, type ShopProof,
} from "../../lib/api";

export default function ShopHome() {
  return (
    <RequireRole role="shop" title="Accesso negozio" subtitle="Area negozio · Pilota Natale">
      <ShopApp />
    </RequireRole>
  );
}

function ShopApp() {
  const { profile } = useSession();
  const [shop, setShop] = useState<Shop | null>(null);
  const [tab, setTab] = useState<"verifica" | "impostazioni">("verifica");
  useEffect(() => {
    if (profile?.shopId) getShop(profile.shopId).then(setShop);
  }, [profile?.shopId]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs text-stone-500">Fiscal · Negozio</div>
            <div className="truncate font-bold">{shop?.name ?? "…"}</div>
          </div>
          <LogoutButton />
        </div>
        <div className="mx-auto grid max-w-md grid-cols-2 px-4 pb-2 text-sm font-semibold">
          <button onClick={() => setTab("verifica")} className={`rounded-lg py-2 ${tab === "verifica" ? "bg-brand text-white" : "text-stone-600"}`}>Verifica regalo</button>
          <button onClick={() => setTab("impostazioni")} className={`rounded-lg py-2 ${tab === "impostazioni" ? "bg-brand text-white" : "text-stone-600"}`}>Impostazioni</button>
        </div>
      </header>
      <Page>
        {tab === "verifica" ? <Verify /> : shop ? <Settings shop={shop} onSaved={setShop} /> : <Spinner />}
      </Page>
    </div>
  );
}

// ===================== Verifica =====================

function Verify() {
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);

  async function lookup(q: string) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await shopLookup(q));
    } catch (e) {
      setError(fnError(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setCode("");
    setError("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.trim()) lookup(code.trim());
  }

  if (result) {
    return (
      <>
        {result.valid ? <ProofCard initial={result.proof} /> : <Invalid reason={result.reason} />}
        <Button variant="secondary" className="mt-4 w-full" onClick={reset}>Nuova verifica</Button>
      </>
    );
  }

  return (
    <>
      {scanning ? (
        <Scanner
          onResult={(text) => { setScanning(false); lookup(text); }}
          onCancel={() => setScanning(false)}
          onError={(m) => { setScanning(false); setError(m); }}
        />
      ) : (
        <button
          onClick={() => { setError(""); setScanning(true); }}
          className="flex w-full flex-col items-center gap-2 rounded-2xl bg-brand px-4 py-10 text-white shadow-sm active:bg-brand-dark"
        >
          <span className="text-5xl" aria-hidden>📷</span>
          <span className="text-xl font-bold">Scansiona il QR del regalo</span>
        </button>
      )}

      <Card className="mt-5">
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Oppure scrivi il codice">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="FSC-7K3P"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="text-center font-mono text-2xl tracking-widest"
            />
          </Field>
          <Button type="submit" busy={busy} disabled={!code.trim()} className="w-full">Verifica</Button>
        </form>
      </Card>
      {busy && !code && <Spinner label="Verifico…" />}
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
    </>
  );
}

function Invalid({ reason }: { reason: "not_found" | "other_shop" | "bad_code" }) {
  const msg = {
    other_shop: "Prova non valida per questo negozio",
    not_found: "Prova non trovata",
    bad_code: "Codice non valido",
  }[reason];
  const sub = {
    other_shop: "Questa prova d'acquisto è stata creata in un altro negozio.",
    not_found: "Controlla il codice (FSC- seguito da 4 caratteri) o riprova la scansione.",
    bad_code: "Il codice è FSC- seguito da 4 lettere/numeri, es. FSC-7K3P.",
  }[reason];
  return (
    <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-6 text-center text-red-900" role="alert">
      <div className="text-5xl" aria-hidden>✕</div>
      <div className="mt-2 text-xl font-bold">{msg}</div>
      <p className="mt-1 text-sm">{sub}</p>
    </div>
  );
}

function Scanner({ onResult, onCancel, onError }: { onResult: (t: string) => void; onCancel: () => void; onError: (m: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cb = useRef({ onResult, onError });
  cb.current = { onResult, onError };
  useEffect(() => {
    let scanner: { stop: () => void; destroy: () => void } | null = null;
    let done = false;
    (async () => {
      const { default: QrScanner } = await import("qr-scanner");
      if (!videoRef.current || done) return;
      const s = new QrScanner(
        videoRef.current,
        (r) => { if (!done) { done = true; s.stop(); cb.current.onResult(r.data); } },
        { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
      );
      scanner = s;
      try {
        await s.start();
      } catch {
        cb.current.onError("Fotocamera non disponibile: consenti l'accesso alla fotocamera oppure scrivi il codice.");
      }
    })();
    return () => { done = true; scanner?.stop(); scanner?.destroy(); };
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
      <button onClick={onCancel} className="w-full bg-stone-900 py-3 font-semibold text-white">Annulla</button>
    </div>
  );
}

function ReceiptPhoto({ proofId }: { proofId: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let objectUrl = "";
    (async () => {
      try {
        const idToken = await auth.currentUser!.getIdToken();
        const res = await fetch(`/api/receipt/p/${proofId}`, { headers: { Authorization: `Bearer ${idToken}` } });
        if (!res.ok) throw new Error(res.status === 410 ? "Foto non più conservata." : "Foto non disponibile.");
        objectUrl = URL.createObjectURL(await res.blob());
        setUrl(objectUrl);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [proofId]);
  if (error) return <p className="text-sm text-stone-500">{error}</p>;
  if (!url) return <Spinner label="Carico la foto dello scontrino…" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Scontrino originale" className="max-h-[60vh] w-full rounded-xl border border-stone-200 bg-stone-50 object-contain" />
      <span className="mt-1 block text-center text-xs text-stone-500">Tocca per ingrandire</span>
    </a>
  );
}

function ProofCard({ initial }: { initial: ShopProof }) {
  const [p, setP] = useState(initial);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState<"" | "exchange" | "discount">("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const used = p.status === "exchanged";

  async function act(action: "exchange" | "discount") {
    setError("");
    setMsg("");
    let extraSpent: number | null = null;
    if (action === "discount" && extra.trim()) {
      extraSpent = Number(extra.replace(",", "."));
      if (!Number.isFinite(extraSpent) || extraSpent < 0) return setError("Importo non valido.");
    }
    if (action === "exchange" && !window.confirm(`Confermi il cambio per ${p.code}? La prova non sarà più valida.`)) return;
    setBusy(action);
    try {
      const r = await shopAction({ proofId: p.id, action, extraSpent });
      setP(r.proof);
      if (r.already) setError(action === "exchange" ? `Cambio già effettuato il ${fmtDateTime(r.at)}.` : `Sconto già applicato il ${fmtDateTime(r.at)}.`);
      else setMsg(action === "exchange" ? "✓ Cambio registrato." : `✓ Sconto registrato${extraSpent ? ` (+${fmtEuro(Math.round(extraSpent * 100))})` : ""}.`);
      setExtra("");
    } catch (e) {
      setError(fnError(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-5 text-center ${used ? "border-2 border-amber-300 bg-amber-50 text-amber-900" : "border-2 border-green-300 bg-green-50 text-green-900"}`}>
        <div className="text-4xl" aria-hidden>{used ? "⚠️" : "✓"}</div>
        <div className="mt-1 text-xl font-bold">{used ? "Prova già usata" : "Prova valida"}</div>
        {used && <div className="text-sm">Cambio effettuato il {fmtDateTime(p.exchangedAt)}</div>}
        <div className="mt-2 font-mono text-2xl font-extrabold tracking-widest">{p.code}</div>
      </div>

      <Card>
        <dl className="space-y-2">
          <div><dt className="text-xs uppercase text-stone-500">Articolo</dt><dd className="text-lg font-semibold">{p.description}</dd></div>
          <div><dt className="text-xs uppercase text-stone-500">Data d'acquisto</dt><dd>{fmtDate(p.purchaseDate)}</dd></div>
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            <span className={`rounded-full px-2 py-1 ${used ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>{used ? "Cambiata" : "Attiva"}</span>
            <span className={`rounded-full px-2 py-1 ${p.discountUsedAt ? "bg-stone-200 text-stone-700" : "bg-brand-soft text-brand"}`}>
              {p.discountUsedAt ? `Sconto usato il ${fmtDate(p.discountUsedAt)}` : "Sconto disponibile"}
            </span>
            {p.extraSpentCents > 0 && <span className="rounded-full bg-stone-100 px-2 py-1">Speso in più: {fmtEuro(p.extraSpentCents)}</span>}
          </div>
        </dl>
        <div className="mt-4">
          <div className="mb-2 text-xs uppercase text-stone-500">Scontrino originale</div>
          {p.receiptAvailable ? <ReceiptPhoto proofId={p.id} /> : <p className="text-sm text-stone-500">Foto non più conservata.</p>}
        </div>
      </Card>

      {msg && <Alert kind="success">{msg}</Alert>}
      {error && <Alert>{error}</Alert>}

      <Button variant={used ? "secondary" : "primary"} disabled={used} busy={busy === "exchange"} className="w-full text-lg" onClick={() => act("exchange")}>
        {used ? "Cambio già effettuato" : "Cambio effettuato"}
      </Button>

      <Card>
        <Field label="Importo speso in più (€) · facoltativo">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={extra}
            onChange={(e) => setExtra(e.target.value.replace(/[^0-9.,]/g, ""))}
            disabled={!!p.discountUsedAt}
          />
        </Field>
        <Button variant="secondary" disabled={!!p.discountUsedAt} busy={busy === "discount"} className="mt-3 w-full" onClick={() => act("discount")}>
          {p.discountUsedAt ? "Sconto già applicato" : "Sconto applicato"}
        </Button>
      </Card>
    </div>
  );
}

// ===================== Impostazioni =====================

function Settings({ shop, onSaved }: { shop: Shop; onSaved: (s: Shop) => void }) {
  const [rules, setRules] = useState(shop.exchangeRules);
  const [discount, setDiscount] = useState(shop.discountText);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setError("");
    try {
      await updateShop(shop.id, { exchangeRules: rules, discountText: discount });
      onSaved({ ...shop, exchangeRules: rules.trim(), discountText: discount.trim() });
      setMsg("Impostazioni salvate. Valgono subito per tutti i regali, anche quelli già inviati.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Regole di cambio" hint="Le vede chi riceve il regalo. Es. “Cambio entro il 31 gennaio con cartellino”.">
          <TextArea rows={4} maxLength={600} value={rules} onChange={(e) => setRules(e.target.value)} />
        </Field>
        <Field label="Sconto offerto" hint="Es. “10% sul prossimo acquisto entro il 31/01”.">
          <Input maxLength={300} value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        {msg && <Alert kind="success">{msg}</Alert>}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" busy={busy} className="w-full">Salva</Button>
      </form>
    </Card>
  );
}
