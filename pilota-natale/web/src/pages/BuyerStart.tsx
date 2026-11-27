import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { getShop } from "../lib/shops";
import type { Shop } from "../lib/types";
import { createProof, fnError, type CreateProofResult } from "../lib/api";
import { compressPhoto, ensureSignedIn, randomId, uploadReceipt } from "../lib/upload";
import { EMAIL_RE } from "../lib/shops";
import { Alert, Brand, Button, Card, Field, Input, Page, Spinner } from "../components/ui";
import { PrivacyNotice } from "../components/PrivacyNotice";

const EMAIL_KEY = "fiscal.buyerEmail";
const loadEmail = () => { try { return localStorage.getItem(EMAIL_KEY) ?? ""; } catch { return ""; } };
const saveEmail = (v: string) => { try { localStorage.setItem(EMAIL_KEY, v); } catch { /* ignore */ } };

interface Created extends CreateProofResult { description: string }

export default function BuyerStart() {
  const { shopId = "" } = useParams();
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  useEffect(() => {
    getShop(shopId).then(setShop).catch(() => setShop(null));
    ensureSignedIn().catch(() => {}); // prepara il login anonimo mentre l'utente scatta
  }, [shopId]);

  if (shop === undefined) return <Spinner />;
  if (!shop || !shop.active) {
    return (
      <Page>
        <Brand subtitle="Prova d'acquisto regalo" />
        <Alert>Questo QR non è attivo. Chiedi al personale del negozio.</Alert>
      </Page>
    );
  }
  return <BuyerFlow shop={shop} />;
}

function BuyerFlow({ shop }: { shop: Shop }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionId = useRef(randomId(16));
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState(loadEmail);
  const [emailLocked, setEmailLocked] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created[]>([]);
  const [showForm, setShowForm] = useState(true);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function openCamera() {
    fileRef.current?.click();
  }

  function onPhoto(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)) {
      setError("Seleziona una foto dello scontrino.");
      return;
    }
    setError("");
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
    setShowForm(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!photo) return setError("Scatta prima la foto dello scontrino.");
    if (description.trim().length < 2) return setError("Scrivi una breve descrizione dell'articolo.");
    if (!EMAIL_RE.test(email.trim())) return setError("Controlla la tua email.");
    setBusy(true);
    setProgress(0);
    try {
      const blob = await compressPhoto(photo);
      const uploadPath = await uploadReceipt(blob, setProgress);
      setProgress(null);
      const res = await createProof({
        shopId: shop.id, uploadPath, description: description.trim(), email: email.trim(),
        marketing, sessionId: sessionId.current,
      });
      saveEmail(email.trim());
      setEmailLocked(true);
      setCreated((c) => [...c, { ...res, description: description.trim() }]);
      setPhoto(null);
      setPreview("");
      setDescription("");
      setShowForm(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(fnError(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function addAnother() {
    setShowForm(true);
    setError("");
    openCamera(); // il click dell'utente permette di riaprire subito la fotocamera
  }

  const last = created[created.length - 1];

  return (
    <Page>
      <Brand subtitle="Prova d'acquisto regalo" />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }}
      />

      <div className="mb-4">
        <p className="text-sm text-stone-500">Stai acquistando da</p>
        <h1 className="text-2xl font-bold leading-tight">{shop.name}</h1>
      </div>

      {last && !showForm && (
        <Card className="mb-4 border-brand/30">
          <div className="text-3xl" aria-hidden>🎁</div>
          <h2 className="mt-1 text-xl font-bold">Prova regalo creata!</h2>
          <p className="mt-1 text-stone-700">
            {last.emailSent
              ? <>Ti abbiamo inviato un'email a <strong>{email}</strong> con la tua copia e il link regalo.</>
              : <>L'email non è partita, ma la prova è valida: apri la tua copia qui sotto e salvala.</>}
          </p>
          <div className="my-4 rounded-xl border-2 border-dashed border-brand p-3 text-center">
            <div className="text-xs text-stone-500">{last.description}</div>
            <div className="font-mono text-2xl font-extrabold tracking-widest">{last.code}</div>
          </div>
          <div className="grid gap-2">
            <Link to={`/c/${last.ownerToken}`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 py-3 font-semibold text-white">
              Apri la tua copia e invia il regalo
            </Link>
            <Button variant="secondary" onClick={addAnother}>📷 Aggiungi un altro regalo</Button>
          </div>
        </Card>
      )}

      {created.length > 1 && !showForm && (
        <Card className="mb-4">
          <h3 className="mb-2 font-semibold">I tuoi regali di oggi</h3>
          <ul className="divide-y divide-stone-100">
            {created.map((c) => (
              <li key={c.code} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{c.description}</span>
                <Link to={`/c/${c.ownerToken}`} className="shrink-0 font-mono text-sm text-brand underline">{c.code}</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showForm && (
        <Card>
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <div className="mb-2 text-sm font-semibold">1. Foto dello scontrino fiscale</div>
              {preview ? (
                <div className="space-y-2">
                  <img src={preview} alt="Anteprima dello scontrino" className="max-h-72 w-full rounded-xl border border-stone-200 object-contain bg-stone-50" />
                  <Button type="button" variant="ghost" onClick={openCamera} className="w-full">Rifai la foto</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openCamera}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/40 bg-brand-soft px-4 py-8 text-brand"
                >
                  <span className="text-4xl" aria-hidden>📷</span>
                  <span className="text-lg font-bold">Fotografa lo scontrino</span>
                  <span className="text-xs text-stone-600">Deve vedersi bene data, numero e totale</span>
                </button>
              )}
            </div>

            <Field label="2. Cosa hai regalato?" hint="Es. “Maglione blu, tg M”. Lo vedrà chi riceve il regalo.">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} placeholder="Maglione blu, tg M" required />
            </Field>

            <Field label="3. La tua email" hint="Ti mandiamo la tua copia (con il prezzo) e il link regalo da inviare.">
              {emailLocked ? (
                <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                  <span className="truncate">{email}</span>
                  <button type="button" className="text-sm text-brand underline" onClick={() => setEmailLocked(false)}>Cambia</button>
                </div>
              ) : (
                <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              )}
            </Field>

            {!emailLocked && <PrivacyNotice marketing={marketing} onMarketing={setMarketing} />}
            {emailLocked && <p className="text-xs text-stone-500">Continuando accetti l'<Link to="/privacy" target="_blank" className="underline">Informativa privacy</Link>.</p>}

            {error && <Alert>{error}</Alert>}
            {progress !== null && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200" aria-label="Caricamento foto">
                <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            <Button type="submit" busy={busy} className="w-full text-lg">Crea la prova regalo</Button>
            {created.length > 0 && (
              <button type="button" className="w-full text-sm text-stone-500 underline" onClick={() => { setShowForm(false); setPhoto(null); setPreview(""); }}>
                Annulla
              </button>
            )}
          </form>
        </Card>
      )}
    </Page>
  );
}
