import { useState, type FormEvent, type ReactNode } from "react";
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useSession } from "../lib/session";
import type { Role } from "../lib/types";
import { Alert, Brand, Button, Card, Field, Input, Page, Spinner, errorMessage } from "./ui";

export function LoginForm({ title, subtitle }: { title: string; subtitle: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onForgot() {
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError("Scrivi prima la tua email, poi tocca “Password dimenticata?”.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch {
      /* non riveliamo se l'email esiste */
    }
    setInfo("Se l'email è registrata, riceverai a breve un link per impostare una nuova password.");
  }

  return (
    <Page>
      <Brand subtitle={subtitle} />
      <Card>
        <h1 className="mb-4 text-xl font-bold">{title}</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          {info && <Alert kind="success">{info}</Alert>}
          <Button type="submit" busy={busy} className="w-full">Accedi</Button>
          <button type="button" onClick={onForgot} className="w-full text-center text-sm text-brand underline">
            Password dimenticata?
          </button>
        </form>
      </Card>
    </Page>
  );
}

export function LogoutButton() {
  return (
    <button onClick={() => signOut(auth)} className="text-sm text-stone-500 underline">
      Esci
    </button>
  );
}

/** Mostra i figli solo se l'utente ha il ruolo richiesto; altrimenti il login o un avviso. */
export function RequireRole({ role, title, subtitle, children }: { role: Role; title: string; subtitle: string; children: ReactNode }) {
  const { loading, user, profile } = useSession();
  if (loading) return <Spinner />;
  if (!user) return <LoginForm title={title} subtitle={subtitle} />;
  if (profile?.role !== role) {
    return (
      <Page>
        <Brand subtitle={subtitle} />
        <Alert>
          L'account <strong>{user.email}</strong> non ha accesso a quest'area.
        </Alert>
        <div className="mt-4"><LogoutButton /></div>
      </Page>
    );
  }
  return <>{children}</>;
}
