# Fiscal · Pilota Natale

Prova d'acquisto regalo digitale che sostituisce lo scontrino di cortesia di carta.
Progetto **separato** dal vecchio software Fiscal (scontrini digitali via cassa/NFC, nella radice del repo):
cartella, dipendenze, regole e sito Hosting propri. Condivide solo il progetto Firebase `fiscal-9a0c8`.

| Cosa | Dove |
|---|---|
| Web app (cliente, destinatario, negozio, admin) | `web/` (Vite + React + TypeScript + Tailwind) |
| Regole Firestore / Storage | `firestore.rules`, `storage.rules` |
| Cloud Functions (email, link, scansione) | `functions/` *(dal passo 2-3, richiede Blaze)* |
| Seed e script admin | `scripts/` |
| Test regole | `tests/` |

Sito pubblico: `https://fiscal-natale.web.app` (sito Hosting separato; il sito del vecchio Fiscal resta intatto).

## Stato dei passi

| # | Passo | Stato | Serve Blaze? |
|---|---|---|---|
| 1 | Admin + negozi + QR | ✅ | No |
| 2 | Web app cliente (foto scontrino) | ⏳ | **Sì** (Storage + Functions) |
| 3 | Email e link regalo | ⏳ | **Sì** |
| 4 | Pagina destinatario | ⏳ | **Sì** |
| 5 | Web app negoziante | ⏳ | **Sì** |
| 6 | Metriche e CSV | ⏳ | **Sì** |

> **Perché Blaze.** Da ottobre 2024 i nuovi bucket Cloud Storage (`*.firebasestorage.app`) e le
> Cloud Functions richiedono il piano Blaze. Per un pilota di 3-5 negozi i consumi restano dentro le
> quote gratuite (2M invocazioni/mese, 5 GB di Storage): costo atteso **0 €**. Imposta comunque un
> avviso di budget (es. 5 €) in Google Cloud → Fatturazione → Budget e avvisi.
> Senza Blaze si può sviluppare e provare **tutto** in locale con gli emulatori Firebase.

## Modello dei dati (passo 1)

- `users/{uid}` → `{ role: "admin" | "shop", shopId?, email }`: ruolo dell'account. Lo scrive solo un admin.
- `shops/{shopId}` → `{ name, address, exchangeRules, discountText, active }`: dati **pubblici**
  del negozio (leggibili per ID; l'elenco è solo admin). Il negozio può modificare solo regole e sconto.
- `shopAccounts/{shopId}` → `{ loginEmail, uid }`: dati riservati, solo admin.
- Tutto il resto (prove, codici, consensi, eventi…) è chiuso ai client e gestito dalle Functions.

## Setup locale (sviluppo, gratis)

Requisiti: Node 20+, Java 11+ (per gli emulatori).

```bash
cd pilota-natale
npm install
npm --prefix web install
cp web/.env.example web/.env.local      # VITE_USE_EMULATORS=true
npm run emulators                       # terminale 1: Auth + Firestore (+ Storage) + UI su :4000
npm run seed                            # terminale 2: admin + 2 negozi demo
npm run web:dev                         # terminale 2: app su http://localhost:5173
npm run test:rules                      # test delle regole Firestore
```

Account demo (solo emulatori): `admin@fiscal.test`, `negozio1@fiscal.test`, `negozio2@fiscal.test`, password `fiscal-demo`.
Le email "imposta password" degli emulatori non partono: i link si vedono nella UI emulatori → Authentication.

**Dal telefono in locale**: telefono e PC sulla stessa Wi-Fi, apri `http://IP-DEL-PC:5173`
(l'app punta automaticamente agli emulatori sullo stesso IP). La fotocamera via browser richiede HTTPS:
per i test con foto usa il deploy reale.

## Deploy del passo 1 (funziona sul piano gratuito Spark)

Una tantum, in Firebase Console del progetto `fiscal-9a0c8`:

1. **Firestore**: se non esiste ancora, *Firestore Database → Crea database* in modalità produzione,
   località `eur3 (europe-west)`.
2. **Authentication → Metodo di accesso**: abilita **Email/password**
   (dal passo 2 anche **Anonimo**).
3. **Authentication → Impostazioni → Domini autorizzati**: aggiungi `fiscal-natale.web.app`.
4. **Authentication → Modelli** (facoltativo): imposta la lingua dei modelli email in italiano.

Poi dal tuo computer:

```bash
npm install -g firebase-tools
firebase login
cd pilota-natale
npm install && npm --prefix web install
firebase hosting:sites:create fiscal-natale      # crea il sito separato (una volta)
npm run deploy:step1                              # build + hosting:natale + regole Firestore
```

Se il nome `fiscal-natale` è già preso, scegline un altro e aggiornalo in `.firebaserc`.

> ⚠️ `firebase deploy --only firestore` sostituisce le regole Firestore del progetto. Il vecchio
> Fiscal non usa Firestore (usa il Realtime Database, le cui regole non vengono toccate), quindi è sicuro.

**Diventa admin**: crea il tuo utente in *Authentication → Utenti → Aggiungi utente*, poi in
*Firestore → Avvia raccolta* `users` → documento con ID = **UID** del tuo utente, campi
`role` (string) = `admin` e `email` (string) = la tua email.
In alternativa, con una chiave di service account:

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/serviceAccountKey.json node scripts/set-admin.mjs tua@email.it --prod
```

## Come provare il passo 1 dal telefono

1. Apri `https://fiscal-natale.web.app/admin` e accedi con l'account admin.
2. **+ Nuovo negozio** → nome, indirizzo, email di accesso (usane una tua) → **Crea negozio**.
3. Controlla la casella email: arriva "Reimposta la password" da Firebase → imposta la password.
4. Nella scheda del negozio scarica **Cartello stampabile (PDF A5)** e aprilo.
5. Inquadra il QR del cartello con la fotocamera di un altro telefono → si apre `/n/{id}` con il nome del negozio.
6. Apri `https://fiscal-natale.web.app/negozio` e accedi con l'email del negozio e la nuova password.
7. Prova **Disattiva negozio** → ricarica il QR: compare "Questo QR non è attivo". Riattivalo.
