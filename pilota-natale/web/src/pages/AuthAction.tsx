import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "../lib/firebase";
import { Alert, Brand, Button, Card, Field, Input, Page, Spinner } from "../components/ui";

/**
 * Pagina dei link inviati da Firebase Authentication ("imposta/reimposta la password").
 * È configurata come URL delle azioni email del progetto, così il link apre il nostro sito.
 */
export default function AuthAction() {
  const [params] = useSearchParams();
  const mode = params.get("mode");
  const oobCode = params.get("oobCode") ?? "";
  const continueUrl = safeContinue(params.get("continueUrl"));

  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (mode !== "resetPassword" || !oobCode) {
      setEmail(null);
      return;
    }
    verifyPasswordResetCode(auth, oobCode).then(setEmail).catch(() => setEmail(null));
  }, [mode, oobCode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (pwd.length < 8) return setError("La password deve avere almeno 8 caratteri.");
    if (pwd !== pwd2) return setError("Le due password non coincidono.");
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, pwd);
      setDone(true);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === "auth/weak-password" ? "Password troppo debole." : "Link scaduto o già usato. Richiedine uno nuovo con “Password dimenticata?”.");
    } finally {
      setBusy(false);
    }
  }

  if (email === undefined) return <Spinner />;

  return (
    <Page>
      <Brand subtitle="Imposta la password" />
      {email === null ? (
        <Alert>
          Link non valido o scaduto. Apri la pagina di accesso e usa “Password dimenticata?” per riceverne uno nuovo.
        </Alert>
      ) : done ? (
        <Card>
          <Alert kind="success">Password impostata per <strong>{email}</strong>.</Alert>
          <Link to={continueUrl} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-5 py-3 font-semibold text-white">
            Vai all'accesso
          </Link>
        </Card>
      ) : (
        <Card>
          <h1 className="text-xl font-bold">Scegli la password</h1>
          <p className="mt-1 text-sm text-stone-600">Account: <strong>{email}</strong></p>
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <Field label="Nuova password" hint="Almeno 8 caratteri.">
              <Input type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
            </Field>
            <Field label="Ripeti la password">
              <Input type="password" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} required />
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" busy={busy} className="w-full">Salva password</Button>
          </form>
        </Card>
      )}
    </Page>
  );
}

/** Accetta solo percorsi del nostro sito (niente redirect esterni). */
function safeContinue(raw: string | null): string {
  if (!raw) return "/negozio";
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return "/negozio";
    return u.pathname + u.search;
  } catch {
    return "/negozio";
  }
}
