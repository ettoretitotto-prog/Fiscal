import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { fmtDate, fmtDateTime, fnError, openGift, saveGift, type PublicGift } from "../lib/api";
import { qrDataUrl } from "../lib/qr";
import { EMAIL_RE } from "../lib/shops";
import { Alert, Brand, Button, Card, Field, Input, Page, Spinner } from "../components/ui";
import { PrivacyNotice } from "../components/PrivacyNotice";

const openedKey = (t: string) => `fiscal.opened.${t.slice(0, 12)}`;
function firstOpenOnThisDevice(token: string): boolean {
  try {
    if (localStorage.getItem(openedKey(token))) return false;
    localStorage.setItem(openedKey(token), "1");
    return true;
  } catch {
    return true;
  }
}

/**
 * Pagina pubblica del regalo. I dati arrivano dalla funzione openGift, che non
 * restituisce mai foto dello scontrino né prezzo.
 */
export default function GiftPage() {
  const { token = "" } = useParams();
  const [gift, setGift] = useState<PublicGift | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [qr, setQr] = useState("");

  useEffect(() => {
    openGift(token, firstOpenOnThisDevice(token))
      .then((g) => {
        setGift(g);
        qrDataUrl(g.giftUrl, 480).then(setQr);
      })
      .catch((e) => {
        setError(fnError(e));
        setGift(null);
      });
  }, [token]);

  if (gift === undefined) return <Spinner label="Apro il regalo…" />;
  if (gift === null) {
    return (
      <Page>
        <Brand subtitle="Prova d'acquisto regalo" />
        <Alert>{error || "Regalo non trovato."}</Alert>
      </Page>
    );
  }

  const used = gift.status === "exchanged";

  return (
    <Page>
      <Brand subtitle="Prova d'acquisto regalo" />

      <div className="mb-5 text-center">
        <div className="text-5xl" aria-hidden>🎁</div>
        <h1 className="mt-2 text-2xl font-bold leading-tight">Hai ricevuto un regalo</h1>
        <p className="mt-1 text-stone-600">da <strong>{gift.shopName}</strong></p>
      </div>

      {used && (
        <div className="mb-4">
          <Alert>Questa prova è già stata usata: cambio effettuato il {fmtDateTime(gift.exchangedAt)}.</Alert>
        </div>
      )}

      <Card className={used ? "opacity-70" : ""}>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Articolo</dt>
            <dd className="text-lg font-semibold">{gift.description}</dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Acquistato il</dt>
              <dd className="font-medium">{fmtDate(gift.purchaseDate)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Negozio</dt>
              <dd className="font-medium">{gift.shopName}</dd>
            </div>
          </div>
          {gift.shopAddress && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Indirizzo</dt>
              <dd>
                <a className="text-brand underline" target="_blank" rel="noreferrer"
                   href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${gift.shopName} ${gift.shopAddress}`)}`}>
                  {gift.shopAddress}
                </a>
              </dd>
            </div>
          )}
          {gift.exchangeRules && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Regole di cambio</dt>
              <dd className="whitespace-pre-line">{gift.exchangeRules}</dd>
            </div>
          )}
        </dl>

        {gift.discountText && (
          <div className={`mt-4 rounded-xl p-4 ${gift.discountUsedAt ? "bg-stone-100" : "bg-red-50"}`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-gift">Uno sconto per te</div>
            <div className="mt-1 font-semibold">{gift.discountText}</div>
            {gift.discountUsedAt && <div className="mt-1 text-sm text-stone-500">Già usato il {fmtDateTime(gift.discountUsedAt)}.</div>}
          </div>
        )}

        <div className="mt-5 flex flex-col items-center rounded-xl border-2 border-dashed border-brand p-4">
          <div className="mb-1 text-sm font-semibold">Mostra in cassa</div>
          {qr && <img src={qr} alt="QR da mostrare in cassa" className="h-52 w-52" />}
          <div className="font-mono text-3xl font-extrabold tracking-widest">{gift.code}</div>
        </div>
      </Card>

      <SaveGift token={token} initiallySaved={gift.saved} />
    </Page>
  );
}

function SaveGift({ token, initiallySaved }: { token: string; initiallySaved: boolean }) {
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | { emailSent: boolean; email: string }>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!EMAIL_RE.test(email.trim())) return setError("Controlla la tua email.");
    setBusy(true);
    try {
      const r = await saveGift({ giftToken: token, email: email.trim(), marketing });
      setDone({ emailSent: r.emailSent, email: email.trim() });
    } catch (err) {
      setError(fnError(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="mt-5">
        <Alert kind="success">
          {done.emailSent
            ? <>Regalo salvato! Ti abbiamo inviato una copia a <strong>{done.email}</strong>.</>
            : <>Regalo salvato, ma l'email non è partita. Tieni questo link tra i preferiti.</>}
        </Alert>
      </Card>
    );
  }

  return (
    <Card className="mt-5">
      <h2 className="text-lg font-bold">Salva il regalo</h2>
      <p className="mt-1 text-sm text-stone-600">
        {initiallySaved ? "Questo regalo è già stato salvato. Puoi riceverne una copia anche tu:" : "Ricevi una copia via email, così non la perdi."}
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <Field label="La tua email">
          <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <PrivacyNotice marketing={marketing} onMarketing={setMarketing} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" busy={busy} className="w-full">Salva il regalo</Button>
      </form>
    </Card>
  );
}
