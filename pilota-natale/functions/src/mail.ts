import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { IS_EMULATOR, baseUrl, db, FieldValue } from "./common";

// Chiave API di Resend (https://resend.com):  firebase functions:secrets:set RESEND_API_KEY
export const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
// Mittente e risposta, da functions/.env. Finché il dominio non è verificato su Resend
// usa onboarding@resend.dev, che consegna SOLO all'email del proprietario dell'account Resend.
const MAIL_FROM = () => (process.env.MAIL_FROM ?? "").trim() || "Fiscal <onboarding@resend.dev>";
const MAIL_REPLY_TO = () => (process.env.MAIL_REPLY_TO ?? "").trim();

export interface Attachment { filename: string; content: Buffer }
export interface Mail { to: string; subject: string; html: string; text: string; attachments?: Attachment[] }

function apiKey(): string {
  try {
    return RESEND_API_KEY.value() ?? "";
  } catch {
    return "";
  }
}

/**
 * Invia un'email transazionale con Resend.
 * Negli emulatori (o senza chiave) non invia nulla: salva l'email in `devOutbox`
 * così si può controllare il contenuto dalla UI degli emulatori.
 */
export async function sendMail(m: Mail): Promise<string> {
  const key = apiKey();
  if (IS_EMULATOR || !key || key === "none") {
    if (!IS_EMULATOR) logger.error("RESEND_API_KEY non impostata: email NON inviata", { subject: m.subject });
    const ref = await db.collection("devOutbox").add({
      to: m.to, subject: m.subject, html: m.html, text: m.text,
      attachments: (m.attachments ?? []).map((a) => a.filename),
      at: FieldValue.serverTimestamp(),
    });
    if (!IS_EMULATOR) throw new Error("Servizio email non configurato");
    return `dev-${ref.id}`;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM(),
      to: [m.to],
      subject: m.subject,
      html: m.html,
      text: m.text,
      ...(MAIL_REPLY_TO() ? { reply_to: MAIL_REPLY_TO() } : {}),
      ...(m.attachments?.length
        ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) }
        : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    logger.error("Invio email fallito", { status: res.status, body });
    throw new Error(body.message ?? `Resend HTTP ${res.status}`);
  }
  return body.id ?? "";
}

// ---------------- Template ----------------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const nl2br = (s: string) => esc(s).replace(/\n/g, "<br>");

function layout(title: string, inner: string, footer: string): string {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#14532d;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:700">🎁 Fiscal</td></tr>
<tr><td style="padding:24px">${inner}</td></tr>
<tr><td style="padding:16px 24px;background:#fafaf9;color:#78716c;font-size:12px;line-height:1.5">${footer}
<br><a href="${baseUrl()}/privacy" style="color:#78716c">Informativa privacy</a></td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#14532d;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">${esc(label)}</a>`;

const codeBox = (code: string, qrUrl: string) => `
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0;width:100%"><tr>
<td align="center" style="border:2px dashed #14532d;border-radius:12px;padding:16px">
<img src="${esc(qrUrl)}" width="180" height="180" alt="QR del regalo" style="display:block;margin:0 auto 8px">
<div style="font-size:12px;color:#57534e">Codice da mostrare in cassa</div>
<div style="font-size:28px;font-weight:800;letter-spacing:3px;font-family:Menlo,Consolas,monospace">${esc(code)}</div>
</td></tr></table>`;

export interface ProofMailData {
  shopName: string;
  shopAddress: string;
  description: string;
  purchaseDate: string;
  code: string;
  giftUrl: string;
  ownerUrl: string;
  qrUrl: string;
  receiptUrl: string;
  exchangeRules: string;
  discountText: string;
}

/** Email a chi regala: (a) la sua copia con la foto, (b) la versione regalo. */
export function buyerMail(d: ProofMailData) {
  const subject = `La tua prova d'acquisto regalo · ${d.shopName}`;
  const html = layout(subject, `
<h1 style="font-size:22px;margin:0 0 8px">Ecco la tua prova d'acquisto regalo</h1>
<p style="margin:0 0 20px;color:#57534e">${esc(d.description)} · ${esc(d.shopName)} · ${esc(d.purchaseDate)}</p>

<h2 style="font-size:16px;margin:0 0 4px">A. La tua copia (con il prezzo)</h2>
<p style="margin:0 0 12px;font-size:14px;color:#b91c1c"><strong>Non inoltrarla:</strong> contiene la foto dello scontrino.</p>
<img src="${esc(d.receiptUrl)}" alt="Foto dello scontrino" width="240" style="display:block;max-width:100%;border:1px solid #e7e5e4;border-radius:8px;margin:0 0 12px">
<p style="margin:0 0 24px">${button(d.ownerUrl, "Apri la tua copia")}</p>
<p style="margin:0 0 24px;font-size:13px;color:#57534e">Dalla tua copia puoi inviare il regalo per email adesso o programmarlo per una data e un'ora.</p>

<hr style="border:none;border-top:1px solid #e7e5e4;margin:0 0 24px">

<h2 style="font-size:16px;margin:0 0 4px">B. Versione regalo (senza prezzo)</h2>
<p style="margin:0 0 8px;font-size:14px">Manda questo link a chi riceve il regalo, con WhatsApp, Messaggi o come preferisci:</p>
<p style="margin:0 0 8px;word-break:break-all;font-size:14px"><a href="${esc(d.giftUrl)}" style="color:#14532d">${esc(d.giftUrl)}</a></p>
${codeBox(d.code, d.qrUrl)}
`, "Hai ricevuto questa email perché hai creato una prova d'acquisto regalo con Fiscal.");
  const text = `Ecco la tua prova d'acquisto regalo
${d.description} – ${d.shopName} – ${d.purchaseDate}

A. LA TUA COPIA (con il prezzo, non inoltrarla): ${d.ownerUrl}
La foto dello scontrino è in allegato.

B. VERSIONE REGALO (senza prezzo) da inviare: ${d.giftUrl}
Codice da mostrare in cassa: ${d.code}
`;
  return { subject, html, text };
}

/** Email al destinatario inviata da chi regala (solo consegna, mai marketing). */
export function giftMail(d: ProofMailData & { fromName: string; message: string }) {
  const who = d.fromName ? esc(d.fromName) : "Qualcuno";
  const subject = `${d.fromName || "Qualcuno"} ti ha fatto un regalo 🎁`;
  const html = layout(subject, `
<h1 style="font-size:22px;margin:0 0 8px">${who} ti ha fatto un regalo!</h1>
${d.message ? `<p style="margin:0 0 16px;padding:12px 16px;background:#f5f5f4;border-radius:12px;font-style:italic">“${nl2br(d.message)}”</p>` : ""}
<p style="margin:0 0 4px">Acquistato da <strong>${esc(d.shopName)}</strong> il ${esc(d.purchaseDate)}.</p>
<p style="margin:0 0 20px;color:#57534e">Se vuoi cambiarlo, con questa prova d'acquisto puoi farlo in negozio.</p>
<p style="margin:0 0 8px">${button(d.giftUrl, "Apri la prova d'acquisto regalo")}</p>
${codeBox(d.code, d.qrUrl)}
`, "Il tuo indirizzo email è stato inserito da chi ti ha fatto il regalo ed è usato solo per consegnartelo, mai per marketing.");
  const text = `${d.fromName || "Qualcuno"} ti ha fatto un regalo!
${d.message ? `"${d.message}"\n` : ""}Acquistato da ${d.shopName} il ${d.purchaseDate}.
Apri la prova d'acquisto regalo: ${d.giftUrl}
Codice da mostrare in cassa: ${d.code}

Il tuo indirizzo è usato solo per consegnarti il regalo, mai per marketing.`;
  return { subject, html, text };
}

/** Email al destinatario che ha salvato il regalo. */
export function savedMail(d: ProofMailData) {
  const subject = `Il tuo regalo da ${d.shopName} è salvato`;
  const html = layout(subject, `
<h1 style="font-size:22px;margin:0 0 8px">Regalo salvato ✓</h1>
<p style="margin:0 0 4px"><strong>${esc(d.description)}</strong></p>
<p style="margin:0 0 16px;color:#57534e">${esc(d.shopName)}${d.shopAddress ? ` · ${esc(d.shopAddress)}` : ""} · acquistato il ${esc(d.purchaseDate)}</p>
${d.exchangeRules ? `<p style="margin:0 0 8px;font-size:14px"><strong>Cambio:</strong> ${nl2br(d.exchangeRules)}</p>` : ""}
${d.discountText ? `<p style="margin:0 0 16px;font-size:14px"><strong>Per te:</strong> ${nl2br(d.discountText)}</p>` : ""}
<p style="margin:0 0 8px">${button(d.giftUrl, "Apri la prova d'acquisto regalo")}</p>
${codeBox(d.code, d.qrUrl)}
`, "Hai ricevuto questa email perché hai salvato una prova d'acquisto regalo con Fiscal.");
  const text = `Regalo salvato: ${d.description}
${d.shopName} – acquistato il ${d.purchaseDate}
${d.exchangeRules ? `Cambio: ${d.exchangeRules}\n` : ""}${d.discountText ? `Per te: ${d.discountText}\n` : ""}
Apri: ${d.giftUrl}
Codice da mostrare in cassa: ${d.code}`;
  return { subject, html, text };
}
