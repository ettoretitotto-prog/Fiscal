import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import {
  cancelGiftSend, fmtDate, fmtDateTime, fnError, getOwnerProof, sendGift, type GiftSend, type OwnerProof,
} from "../lib/api";
import { qrDataUrl } from "../lib/qr";
import { EMAIL_RE } from "../lib/shops";
import { Alert, Brand, Button, Card, Field, Input, Page, Spinner, TextArea } from "../components/ui";

/** Valore di default per l'invio programmato: la mattina di Natale, o tra un'ora. */
function defaultSchedule(): string {
  const now = new Date();
  const xmas = new Date(now.getFullYear(), 11, 25, 8, 0);
  const d = xmas.getTime() > now.getTime() + 3_600_000 ? xmas : new Date(now.getTime() + 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS: Record<GiftSend["status"], string> = {
  scheduled: "Programmato",
  sending: "In invio…",
  sent: "Inviato",
  failed: "Non riuscito",
  cancelled: "Annullato",
};

export default function OwnerCopy() {
  const { token = "" } = useParams();
  const [proof, setProof] = useState<OwnerProof | null | undefined>(undefined);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setProof(await getOwnerProof(token));
    } catch (e) {
      setError(fnError(e));
      setProof(null);
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  if (proof === undefined) return <Spinner />;
  if (proof === null) {
    return (
      <Page>
        <Brand subtitle="La tua prova d'acquisto" />
        <Alert>{error || "Link non valido."}</Alert>
      </Page>
    );
  }
  return <OwnerView token={token} proof={proof} reload={load} />;
}

function OwnerView({ token, proof, reload }: { token: string; proof: OwnerProof; reload: () => Promise<void> }) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [showReceipt, setShowReceipt] = useState(true);
  useEffect(() => { qrDataUrl(proof.giftUrl, 480).then(setQr); }, [proof.giftUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(proof.giftUrl);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = proof.giftUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function share() {
    try {
      await navigator.share({
        title: "Un regalo per te 🎁",
        text: `Ecco la prova d'acquisto del tuo regalo da ${proof.shopName}. Se vuoi cambiarlo, mostrala in negozio:`,
        url: proof.giftUrl,
      });
    } catch { /* annullato */ }
  }

  return (
    <Page>
      <Brand subtitle="La tua copia · privata" />

      <h1 className="text-2xl font-bold leading-tight">{proof.description}</h1>
      <p className="mt-1 text-stone-600">{proof.shopName} · {fmtDate(proof.purchaseDate)}</p>

      {proof.status === "exchanged" && (
        <div className="mt-4"><Alert kind="info">Cambio effettuato in negozio il {fmtDateTime(proof.exchangedAt)}.</Alert></div>
      )}

      {/* ---------- Versione regalo ---------- */}
      <Card className="mt-5">
        <h2 className="text-lg font-bold">🎁 Versione regalo</h2>
        <p className="mt-1 text-sm text-stone-600">Senza prezzo e senza foto dello scontrino. Mandala a chi riceve il regalo.</p>
        <div className="my-4 flex flex-col items-center rounded-xl border-2 border-dashed border-brand p-4">
          {qr && <img src={qr} alt="QR del regalo" className="h-44 w-44" />}
          <div className="text-xs text-stone-500">Codice da mostrare in cassa</div>
          <div className="font-mono text-3xl font-extrabold tracking-widest">{proof.code}</div>
        </div>
        <div className="mb-3 break-all rounded-lg bg-stone-50 p-3 font-mono text-xs text-stone-600">{proof.giftUrl}</div>
        <div className="grid gap-2">
          <Button onClick={copyLink}>{copied ? "✓ Link copiato" : "Copia il link regalo"}</Button>
          {typeof navigator.share === "function" && <Button variant="secondary" onClick={share}>Condividi (WhatsApp, Messaggi…)</Button>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-2 py-1 ${proof.opened ? "bg-brand-soft text-brand" : "bg-stone-100 text-stone-500"}`}>
            {proof.opened ? "✓ Link aperto" : "Link non ancora aperto"}
          </span>
          {proof.recipientSaved && <span className="rounded-full bg-brand-soft px-2 py-1 text-brand">✓ Salvato dal destinatario</span>}
        </div>
      </Card>

      <SendByEmail token={token} proof={proof} reload={reload} />

      {/* ---------- Copia privata ---------- */}
      <Card className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🧾 Scontrino (solo per te)</h2>
          <button className="text-sm text-brand underline" onClick={() => setShowReceipt((v) => !v)}>{showReceipt ? "Nascondi" : "Mostra"}</button>
        </div>
        <p className="mt-1 text-sm text-red-700">Contiene il prezzo: non inoltrare questa pagina.</p>
        {showReceipt && (proof.receiptAvailable ? (
          <a href={`/api/receipt/o/${token}`} target="_blank" rel="noreferrer">
            <img src={`/api/receipt/o/${token}`} alt="Foto dello scontrino" className="mt-3 max-h-[70vh] w-full rounded-xl border border-stone-200 bg-stone-50 object-contain" />
          </a>
        ) : (
          <p className="mt-3 text-sm text-stone-500">La foto non è più conservata.</p>
        ))}
      </Card>
    </Page>
  );
}

function SendByEmail({ token, proof, reload }: { token: string; proof: OwnerProof; reload: () => Promise<void> }) {
  const [toEmail, setToEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [message, setMessage] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState(defaultSchedule);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    if (!EMAIL_RE.test(toEmail.trim())) return setError("Controlla l'email del destinatario.");
    let scheduledAt: number | null = null;
    if (schedule) {
      const t = new Date(when).getTime();
      if (!Number.isFinite(t)) return setError("Scegli data e ora dell'invio.");
      if (t < Date.now()) return setError("La data e l'ora devono essere nel futuro.");
      scheduledAt = t;
    }
    setBusy(true);
    try {
      const s = await sendGift({ ownerToken: token, toEmail: toEmail.trim(), fromName: fromName.trim(), message: message.trim(), scheduledAt });
      setOk(
        s.status === "sent" ? `Regalo inviato a ${s.toEmail}.`
        : s.retrying ? `L'email per ${s.toEmail} non è partita subito: riproviamo automaticamente nei prossimi minuti. Non serve reinviarla.`
        : `Invio programmato per ${fmtDateTime(s.scheduledAt)} a ${s.toEmail}.`,
      );
      setToEmail("");
      setMessage("");
      await reload();
    } catch (err) {
      setError(fnError(err));
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    try {
      await cancelGiftSend(token, id);
      await reload();
    } catch (err) {
      setError(fnError(err));
    }
  }

  return (
    <Card className="mt-5">
      <h2 className="text-lg font-bold">✉️ Invia il regalo per email</h2>
      <form onSubmit={onSubmit} className="mt-3 space-y-4">
        <Field label="Email di chi riceve il regalo" hint="Usata solo per consegnare il regalo, mai per marketing.">
          <Input type="email" inputMode="email" autoComplete="off" value={toEmail} onChange={(e) => setToEmail(e.target.value)} required />
        </Field>
        <Field label="Il tuo nome (facoltativo)" hint="Comparirà nell'email: “Giulia ti ha fatto un regalo”.">
          <Input maxLength={60} value={fromName} onChange={(e) => setFromName(e.target.value)} />
        </Field>
        <Field label="Messaggio (facoltativo)">
          <TextArea maxLength={400} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Buon Natale!" />
        </Field>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1 text-sm font-semibold">
          <button type="button" onClick={() => setSchedule(false)} className={`rounded-lg py-2 ${!schedule ? "bg-white shadow" : "text-stone-500"}`}>Invia subito</button>
          <button type="button" onClick={() => setSchedule(true)} className={`rounded-lg py-2 ${schedule ? "bg-white shadow" : "text-stone-500"}`}>Programma</button>
        </div>
        {schedule && (
          <Field label="Data e ora dell'invio">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </Field>
        )}
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">{ok}</Alert>}
        <Button type="submit" busy={busy} className="w-full">{schedule ? "Programma l'invio" : "Invia ora"}</Button>
      </form>

      {proof.sends.length > 0 && (
        <ul className="mt-5 divide-y divide-stone-100 border-t border-stone-100">
          {proof.sends.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.toEmail ?? "Destinatario"}</div>
                <div className="text-xs text-stone-500">
                  {STATUS[s.status]} · {fmtDateTime(s.status === "sent" ? s.sentAt : s.scheduledAt)}
                </div>
              </div>
              {s.status === "scheduled" && (
                <button className="shrink-0 text-xs text-red-700 underline" onClick={() => cancel(s.id)}>Annulla</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
