# Fiscal · Pilota Natale

Prova d'acquisto regalo digitale che sostituisce lo scontrino di cortesia di carta.

Progetto **completamente separato** dal vecchio Fiscal (scontrini digitali via cassa/NFC, nella radice del repo):
cartella propria, dipendenze proprie e **progetto Firebase proprio** ("Fiscal Pilota Natale", piano Blaze).

## Indice
1. [Come funziona](#come-funziona)
2. [Architettura e dati](#architettura-e-dati)
3. [Setup del progetto Firebase (una volta)](#setup-del-progetto-firebase-una-volta)
4. [Email con Resend](#email-con-resend)
5. [Deploy](#deploy)
6. [Sviluppo locale con gli emulatori](#sviluppo-locale-con-gli-emulatori)
7. [Checklist di test: dalla foto in cassa al cambio in negozio](#checklist-di-test-dalla-foto-in-cassa-al-cambio-in-negozio)
8. [Sicurezza e privacy](#sicurezza-e-privacy)
9. [Problemi comuni](#problemi-comuni)

---

## Come funziona

| Chi | Pagina | Cosa fa |
|---|---|---|
| Chi regala | `/n/{negozio}` (QR statico in cassa) | Fotografa lo scontrino, descrive l'articolo, inserisce l'email. "Aggiungi un altro regalo" riapre la fotocamera senza richiedere l'email. Ogni scontrino = una prova. |
| Chi regala | `/c/{token privato}` (link nell'email) | La sua copia con la foto (prezzo visibile). Copia/condivide il link regalo, lo invia per email subito o programma data e ora. |
| Destinatario | `/r/{token regalo}` | Negozio, data, articolo, regole di cambio, sconto, QR e codice `FSC-XXXX`. **Mai** foto né prezzo. Può salvarlo con la sua email. |
| Negozio | `/negozio` (email + password) | Scansiona il QR o scrive il codice, vede foto e dettagli (solo per le prove del proprio negozio), registra "Cambio effettuato" e "Sconto applicato" + importo speso in più. Imposta regole e sconto. |
| Admin | `/admin` | Crea negozi (con account e email per la password), scarica QR/cartello in PNG/PDF, vede le metriche, esporta CSV. |
| Tutti | `/privacy` | Informativa (versione `2026-11-v1`, **bozza da validare**). |

Email inviate (tramite Resend):
- **a chi regala**, alla creazione: (a) la sua copia con la foto in allegato e il link privato; (b) la versione regalo con link, codice e QR;
- **al destinatario**, quando chi regala lo invia (subito o programmato): link, codice, QR, messaggio. L'indirizzo serve solo per la consegna;
- **al destinatario che salva il regalo**: copia con link, codice, regole e sconto.

## Architettura e dati

```
pilota-natale/
├── web/              App unica (Vite + React + TypeScript + Tailwind), mobile-first, PWA
├── functions/        Cloud Functions v2 (TypeScript, europe-west1)
├── firestore.rules   Regole Firestore      ─┐
├── storage.rules     Regole Storage         ├─ testate in tests/
├── firestore.indexes.json                  ─┘
├── scripts/          seed, set-admin, controllo build
└── tests/            test delle regole (emulatore)
```

**Firestore**

| Collezione | Contenuto | Accesso client |
|---|---|---|
| `users/{uid}` | `role: admin \| shop`, `shopId` | proprio profilo in lettura; scrive solo l'admin |
| `shops/{shopId}` | nome, indirizzo, regole cambio, sconto, attivo | lettura per ID; il negozio modifica solo regole e sconto; l'admin tutto |
| `shopAccounts/{shopId}` | email di accesso | solo admin |
| `proofs/{id}` | negozio, codice, descrizione, email acquirente, percorso foto, `giftToken`, hash del token privato, stato, cambio, sconto, importo extra, aperture, salvataggio | **nessuno** (solo Functions) |
| `codes/{FSC-XXXX}` | codice → prova (unicità garantita in transazione) | nessuno |
| `consents/{id}` | email, tipo (`privacy_notice` / `marketing`), concesso, **testo mostrato**, **versione informativa**, data e ora server, ruolo, negozio, prova | nessuno |
| `giftSends/{id}` | invii al destinatario (`purpose: "consegna"`), stato, data programmata | nessuno |
| `events/{id}` | `proof_created`, `link_opened`, `recipient_saved`, `gift_sent`, `exchange`, `discount_used`, `extra_spent` | nessuno |
| `rateLimits`, `devOutbox` | tecnici | nessuno |

**Storage**: `uploads/{uid}/…` (solo creazione dal browser di chi regala, solo immagini ≤ 10 MB) →
la Function la sposta in `receipts/{shopId}/{proofId}.jpg` (nessun accesso dai client).

**Cloud Functions** (tutte in `europe-west1`)

| Funzione | Tipo | Uso |
|---|---|---|
| `createProof` | callable | crea la prova dalla foto caricata, codice univoco, token, consensi, evento, email |
| `getOwnerProof`, `sendGift`, `cancelGiftSend` | callable | pagina `/c/` di chi regala |
| `dispatchScheduledGifts` | pianificata, ogni 5 min | invia gli invii programmati (con ripresa automatica e 3 tentativi) |
| `openGift`, `saveGift` | callable | pagina `/r/` del destinatario (solo dati pubblici) |
| `shopLookup`, `shopAction` | callable | app negozio (cambio/sconto in transazione: niente doppio uso) |
| `adminStats`, `adminExport` | callable | metriche e CSV |
| `api` | HTTP via Hosting `/api/**` | `/api/qr/{token}.png` (QR nelle email), `/api/receipt/o/{token}` (foto per chi regala), `/api/receipt/p/{id}` (foto per il negozio con login) |
| `nightlyCleanup` | pianificata, 03:30 | cancella le foto dopo 180 giorni, gli upload abbandonati e le email di consegna dopo 30 giorni |

La configurazione web non va copiata a mano: l'app la legge da `/__/firebase/init.json`, che Firebase Hosting
fornisce per il progetto su cui è pubblicata.

---

## Setup del progetto Firebase (una volta)

Nella [console Firebase](https://console.firebase.google.com), progetto **Fiscal Pilota Natale**:

1. **ID progetto** – *Impostazioni progetto → Generali*. Se non è `fiscal-pilota-natale`, aggiorna
   `.firebaserc` (oppure `firebase use --add`).
2. **App web** – *Impostazioni progetto → Le tue app → Aggiungi app → Web* (nome "pilota", senza Hosting extra).
   Non serve copiare la configurazione.
3. **Firestore** – *Firestore Database → Crea database* → modalità produzione → località
   **`eur3 (europe-west)`** o `europe-west1`.
4. **Storage** – *Storage → Inizia* → stessa località (es. `europe-west1`).
5. **Authentication** – *Inizia* → *Metodo di accesso*: abilita **Email/password** e **Anonimo**.
   *Impostazioni → Domini autorizzati*: c'è già `<id-progetto>.web.app`; aggiungi l'eventuale dominio personalizzato.
   *Modelli*: imposta la lingua in **italiano** (email "reimposta password" ai negozi).
6. **Budget** – Google Cloud Console → *Fatturazione → Budget e avvisi* → avviso a 5 €.
   Per 3-5 negozi i consumi restano nelle quote gratuite.

### Diventare admin
Dopo il primo deploy: *Authentication → Utenti → Aggiungi utente* (la tua email + password), copia l'**UID**,
poi *Firestore → Avvia raccolta* `users` → ID documento = UID → campi `role` (string) = `admin`, `email` (string).

In alternativa con una chiave di service account (*Impostazioni progetto → Account di servizio → Genera nuova chiave*,
**non** committarla):
```bash
GOOGLE_APPLICATION_CREDENTIALS=~/chiavi/pilota.json node scripts/set-admin.mjs tua@email.it --password UnaPassword --prod
```

## Email con Resend

1. Crea un account su [resend.com](https://resend.com) e una **API key** (permesso "Sending access").
2. Salvala come secret delle Functions:
   ```bash
   firebase functions:secrets:set RESEND_API_KEY
   ```
3. **Configurazione attuale**: dominio `resofiscal.it` verificato su Resend (regione Irlanda), mittente
   `Fiscal <regali@resofiscal.it>`, risposte a `MAIL_REPLY_TO` (vedi `functions/.env`).
4. **Test senza dominio** (solo per un nuovo progetto): lascia in `functions/.env` `MAIL_FROM="Fiscal <onboarding@resend.dev>"`.
   Resend consegnerà **solo all'email con cui hai creato l'account Resend**: usa quella per le prove.
5. **Per il pilota vero**: Resend → *Domains → Add domain* (es. `tuodominio.it`), aggiungi i record DNS (SPF/DKIM)
   dal tuo provider, attendi "Verified", poi in `functions/.env`:
   ```
   MAIL_FROM="Fiscal <regali@tuodominio.it>"
   MAIL_REPLY_TO=tua@email.it
   ```
   e rifai `npm run deploy`.

Se `RESEND_API_KEY` manca, le prove vengono create lo stesso, ma le email non partono (errore nei log delle Functions).

## Deploy

Dal tuo computer (Node 20+):
```bash
npm install -g firebase-tools
firebase login
cd pilota-natale
npm run install:all
npm run deploy
```
`npm run deploy` compila web e Functions, controlla che la build non punti agli emulatori, poi pubblica
Hosting, regole Firestore/Storage, indici e Functions. Al primo deploy Firebase chiede di abilitare alcune API
(Cloud Functions, Cloud Build, Artifact Registry, Cloud Scheduler, Secret Manager): conferma.

Sito: **https://resofiscal.it** (dominio su register.it; `www.resofiscal.it` reindirizza lì).
Anche `https://fiscal-pilota-natale.web.app` resta raggiungibile.

### Deploy con service account (senza `firebase login`, anche da una sessione Claude Code)
Se la chiave JSON di un service account del progetto è nella variabile `GOOGLE_SERVICE_ACCOUNT_JSON`
(e la chiave Resend in `RESEND_API_KEY`):
```bash
umask 077 && printf '%s' "$GOOGLE_SERVICE_ACCOUNT_JSON" > /tmp/sa.json
export GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa.json
# se il service account appartiene a un ALTRO progetto Google Cloud, le quote vanno
# attribuite a questo progetto, altrimenti le API rispondono "API not enabled":
export GOOGLE_CLOUD_QUOTA_PROJECT=fiscal-pilota-natale
printf '%s' "$RESEND_API_KEY" | npx firebase functions:secrets:set RESEND_API_KEY --data-file -
npm run deploy
```

Dati demo in produzione (2 negozi **(DEMO)** + 3 prove `FSC-DEMA`, `FSC-DEMB` già cambiata, `FSC-DEMC`):
```bash
GOOGLE_APPLICATION_CREDENTIALS=~/chiavi/pilota.json SEED_PASSWORD=UnaPasswordDemo node scripts/seed.mjs --prod
```
Stampa i link di prova. Gli account demo sono `negozio1@fiscal.test` e `negozio2@fiscal.test`.

## Sviluppo locale con gli emulatori

Requisiti: Node 20+, Java 21+.
```bash
cd pilota-natale
npm run install:all
cp web/.env.example web/.env.development.local   # VITE_USE_EMULATORS=true (solo vite dev)
npm run emulators            # terminale 1: Auth, Firestore, Storage, Functions, Pub/Sub + UI su :4000
npm run seed                 # terminale 2: admin + 2 negozi + 3 prove demo (stampa i link)
npm run web:dev              # terminale 2: http://localhost:5173
npm run test:rules:running   # test regole Firestore/Storage (a emulatori spenti: npm run test:rules)
```
Account demo: `admin@fiscal.test`, `negozio1@fiscal.test`, `negozio2@fiscal.test` — password `fiscal-demo`.
Negli emulatori le email **non partono**: le trovi in Firestore → `devOutbox` (UI su http://localhost:4000).

Dal telefono in locale: stessa Wi-Fi, apri `http://IP-DEL-PC:5173`. La fotocamera nel browser richiede HTTPS:
per provare foto e scansione QR usa il sito pubblicato.

---

## Checklist di test: dalla foto in cassa al cambio in negozio

Servono: 2 telefoni (A = chi regala, B = destinatario/cassa) e un PC per l'admin.
Usa come email di chi regala quella del tuo account Resend (se il dominio non è ancora verificato).

**Admin e negozio**
- [ ] PC: `/admin` → accedi → **+ Nuovo negozio** (nome, indirizzo, una tua email di accesso, regole, sconto) → *Crea negozio*.
- [ ] Arriva l'email "reimposta la password" → imposta la password del negozio.
- [ ] Scarica **Cartello stampabile (PDF A5)** e stampalo (o tienilo aperto sul PC).

**In cassa: chi regala (telefono A)**
- [ ] Inquadra il QR del cartello → si apre `/n/{negozio}` con il nome del negozio.
- [ ] *Fotografa lo scontrino* → la fotocamera si apre → scatta → anteprima visibile.
- [ ] Descrizione "Maglione blu, tg M", email. Il testo "Continuando accetti l'Informativa privacy" c'è e la casella "Voglio ricevere novità da Fiscal" **non** è spuntata.
- [ ] *Crea la prova regalo* → "Prova regalo creata!" con codice `FSC-XXXX`.
- [ ] *Aggiungi un altro regalo* → la fotocamera si riapre subito, l'email **non** viene richiesta → crea il secondo regalo con un codice diverso.
- [ ] Email ricevuta: sezione A con la foto (allegato + anteprima) e *Apri la tua copia*; sezione B con link, codice e QR.

**La copia di chi regala (telefono A)**
- [ ] *Apri la tua copia*: foto dello scontrino visibile, versione regalo con QR e codice.
- [ ] *Copia il link regalo* → incollalo in WhatsApp/Note: il link è `/r/…`.
- [ ] *Invia per email* → *Invia ora* a un tuo secondo indirizzo → compare "Inviato".
- [ ] *Programma* → tra 10 minuti → compare "Programmato" → entro ~5 minuti dall'ora scelta diventa "Inviato" (ricarica la pagina).
- [ ] Programma un altro invio e premi *Annulla* → "Annullato".

**Destinatario (telefono B)**
- [ ] Apri il link regalo: negozio, data, articolo, regole, sconto, QR e codice. **Nessuna foto, nessun prezzo.**
- [ ] *Salva il regalo* con un'email (casella marketing non spuntata di default) → "Regalo salvato!" → arriva l'email.
- [ ] Sul telefono A la copia mostra "✓ Link aperto" e "✓ Salvato dal destinatario".

**Cambio in negozio (telefono B come cassa)**
- [ ] `/negozio` → accedi con l'account del negozio → *Scansiona il QR del regalo* → inquadra il QR sul telefono del destinatario.
- [ ] "Prova valida": foto dello scontrino originale (prezzo, data, numero), descrizione, stato.
- [ ] Importo speso in più "25,50" → *Sconto applicato* → "Sconto registrato".
- [ ] *Cambio effettuato* → conferma → "Cambio registrato".
- [ ] Riscansiona lo stesso QR → **"Prova già usata"** con data e ora del cambio.
- [ ] Scrivi a mano il codice dell'altro regalo (es. `fsc 7k3p`, anche minuscolo) → "Prova valida".
- [ ] Con il seed: scrivi `FSC-DEMC` dall'account di Bottega Aurora → **"Prova non valida per questo negozio"**.
- [ ] *Impostazioni*: cambia lo sconto → salva → ricarica il link regalo sul telefono B: si vede il nuovo testo e il banner "già usata".

**Metriche**
- [ ] `/admin`: per il negozio di prova i numeri corrispondono: prove create 2, link aperti 1, salvati 1, cambi 1, sconti 1, speso in più 25,50 €, consensi marketing secondo le spunte.
- [ ] *CSV prove*, *CSV eventi*, *CSV consensi marketing* si aprono in Excel con colonne separate e accenti corretti.
- [ ] *Disattiva negozio* → il QR mostra "Questo QR non è attivo" → *Riattiva*.

## Sicurezza e privacy

- **Foto degli scontrini**: mai leggibili dai client. Si vedono solo da `/api/receipt/o/{token}` (link privato
  di chi regala) o `/api/receipt/p/{id}` con login del **negozio proprietario**. La pagina `/r/` e le funzioni
  che la servono non restituiscono mai foto, prezzo o email.
- **Token**: 256 bit casuali (`crypto.randomBytes(32)`); il token privato di chi regala è salvato solo come hash SHA-256.
- **Codice corto** `FSC-XXXX`: alfabeto senza caratteri ambigui, unicità garantita in transazione lato server,
  cercabile solo da un negozio loggato e solo tra le sue prove.
- **Rate limit** su creazione prove (30/ora per dispositivo), invii (20/ora per prova) e salvataggi.
- **Consensi**: per ogni conferma si salvano due record (informativa + marketing, quest'ultimo anche se "no")
  con testo mostrato, versione dell'informativa e ora del server. L'email del destinatario inserita da chi regala
  sta solo in `giftSends` (`purpose: "consegna"`), non entra nei consensi né nell'export marketing, ed è cancellata
  30 giorni dopo l'invio.
- **Conservazione**: foto degli scontrini cancellate 180 giorni dopo la creazione (`RECEIPT_RETENTION_DAYS` in
  `functions/src/common.ts`). Adeguala alla scadenza dei cambi dei negozi e all'informativa.
- L'**informativa** in `web/src/pages/Privacy.tsx` è una **bozza**: va completata (titolare, contatti) e validata.
  Se cambi il testo aggiorna `PRIVACY_VERSION` in `web/src/lib/privacy.ts` **e** `functions/src/common.ts`.

## Problemi comuni

| Sintomo | Causa / soluzione |
|---|---|
| "Servizio non disponibile" all'apertura del sito | Manca l'app web nel progetto (setup punto 2) o il sito non è stato pubblicato con `firebase deploy`. |
| "Sessione scaduta" o errore alla creazione della prova | Accesso **Anonimo** non abilitato in Authentication. |
| Le email non arrivano | `RESEND_API_KEY` non impostata, oppure mittente `onboarding@resend.dev` e destinatario diverso dall'email del tuo account Resend. Controlla i log: *Functions → Log*. |
| L'invio programmato non parte | Cloud Scheduler non abilitato: rifai il deploy delle Functions e accetta l'abilitazione dell'API. |
| Il negozio vede "Account non abilitato" | Il documento `users/{uid}` del negozio manca: ricrea il negozio dall'admin. |
| Errore CORS su una funzione (es. `getOwnerProof`) | Al primo deploy la funzione non è stata resa pubblica (succede se la build fallisce una volta). Le callable controllano gli accessi nel codice, quindi devono essere invocabili da tutti: `gcloud run services add-iam-policy-binding <nome-minuscolo> --member=allUsers --role=roles/run.invoker --region europe-west1`, oppure rifai il deploy di quella funzione. |
| Link dell'email "reimposta password" con `apiKey=` vuoto | Succede nei primi minuti dopo la creazione dell'app web. Richiedi un nuovo link con "Password dimenticata?". In alternativa, in *Authentication → Modelli → Personalizza URL azione*, imposta `https://<id-progetto>.web.app/auth/azione` (pagina del sito per scegliere la password). |
| Fotocamera non si apre per scansionare | Serve HTTPS e il permesso fotocamera del browser; in alternativa scrivi il codice. |
