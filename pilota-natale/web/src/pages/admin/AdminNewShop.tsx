import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import AdminLayout from "./AdminLayout";
import { DEFAULT_DISCOUNT, DEFAULT_RULES, SHOP_ID_RE, createShop, slugify } from "../../lib/shops";
import { Alert, Button, Card, Field, Input, TextArea, errorMessage } from "../../components/ui";

function NewShopForm() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [shopId, setShopId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [address, setAddress] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [exchangeRules, setExchangeRules] = useState(DEFAULT_RULES);
  const [discountText, setDiscountText] = useState(DEFAULT_DISCOUNT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const effectiveId = idTouched ? shopId : slugify(name);
  const idValid = SHOP_ID_RE.test(effectiveId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await createShop({ shopId: effectiveId, name, address, loginEmail, exchangeRules, discountText });
      const q = res.emailSent ? "creato=1" : `creato=1&emailErr=${encodeURIComponent(res.emailError ?? "")}`;
      navigate(`/admin/negozi/${res.shopId}?${q}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/admin" className="text-sm text-brand underline">← Negozi</Link>
      <h1 className="mb-5 mt-2 text-2xl font-bold">Nuovo negozio</h1>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nome del negozio">
            <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Bottega Aurora" />
          </Field>
          <Field
            label="ID nel link del QR"
            hint={<>Il QR aprirà <span className="font-mono">/n/{effectiveId || "…"}</span>. Non si può cambiare dopo la stampa.</>}
          >
            <Input
              value={effectiveId}
              maxLength={40}
              onChange={(e) => { setIdTouched(true); setShopId(slugify(e.target.value) || e.target.value.toLowerCase()); }}
              className="font-mono"
            />
          </Field>
          {effectiveId && !idValid && <Alert>L'ID deve avere 3-40 caratteri: lettere minuscole, numeri e trattini.</Alert>}
          <Field label="Indirizzo">
            <Input maxLength={160} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Via, numero, città" />
          </Field>
          <Field label="Email di accesso del negozio" hint="Riceverà un'email per impostare la password.">
            <Input type="email" inputMode="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
          </Field>
          <Field label="Regole di cambio" hint="Mostrate al destinatario del regalo.">
            <TextArea maxLength={600} value={exchangeRules} onChange={(e) => setExchangeRules(e.target.value)} />
          </Field>
          <Field label="Sconto offerto" hint="Es. 10% sul prossimo acquisto entro il 31/01.">
            <Input maxLength={300} value={discountText} onChange={(e) => setDiscountText(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" busy={busy} disabled={!idValid} className="w-full">Crea negozio</Button>
        </form>
      </Card>
    </>
  );
}

export default function AdminNewShop() {
  return (
    <AdminLayout>
      <NewShopForm />
    </AdminLayout>
  );
}
