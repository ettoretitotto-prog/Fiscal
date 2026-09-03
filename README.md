# Scontrino Digitale — Zero-Hardware Multi-Tenant MVP

Questo MVP connette una cassa (POS o tablet) a un dispositivo cliente (NFC o URL statico) in tempo reale tramite **Firebase Realtime Database**.

## Struttura del Progetto

- `main.py` — Backend FastAPI che riceve POST `/api/receipt` dalle casse e scrive nel Realtime Database.
- `index.html` — Pagina cliente che ascolta i cambiamenti in tempo reale della propria cassa per renderizzare lo scontrino, con form opzionale di raccolta contatti (Instagram/Telefono) per il marketing del negoziante.
- `cassa.html` — Simulatore di cassa per il pitch/demo, per aggiungere prodotti e inviare lo scontrino.
- `capture-service.js` — Servizio Node.js che cattura il testo grezzo stampato tramite stampante virtuale RedMon (Windows).
- `receipt-normalizer.js` — Normalizza il testo grezzo dello scontrino in un oggetto JSON strutturato.
- `firebase-receipt-sender.js` — Invia gli scontrini normalizzati a Firebase con retry automatico e coda offline.
- `receipt-processor.js` — Servizio integrato che orchestra cattura → normalizzazione → invio Firebase → finestra di stampa cartacea opzionale (system tray).
- `serviceAccountKey.json` — Certificato privato di amministrazione Firebase (NON incluso nel repository Git).

## Flusso Funzionale Multi-Tenant & Sicuro (TTL)

1. **Tap NFC del Cliente:**
   Il cliente tocca lo sticker NFC che lo indirizza a:
   `https://fiscal-9a0c8.web.app/?cassa=negozio1`

2. **In ascolto (onSnapshot / value):**
   La pagina si apre e si mette in ascolto in tempo reale su Firebase sul nodo `scontrini` per la cassa `negozio1` dove lo scontrino è `UNCLAIMED` e il timestamp non è più vecchio di 45 secondi.

3. **Stampa della Cassa (POST):**
   La cassa effettua una POST a `/api/receipt` (oppure scrive direttamente via SDK, vedi `cassa.html`/`firebase-receipt-sender.js`) con il JSON dello scontrino. Il dato viene memorizzato su Firebase impostando il server timestamp e lo stato `UNCLAIMED`.

4. **Claim istantaneo:**
   Il browser del cliente rileva l'inserimento, renderizza lo scontrino fiscale in stile "Documento Commerciale" italiano, imposta lo stato a `CLAIMED` (consumandolo in modo che nessun altro possa riceverlo) e arresta il listener.

5. **Raccolta contatti (opzionale):**
   Dopo la visualizzazione dello scontrino, il cliente può lasciare Instagram o telefono per ricevere promozioni dal negoziante. I dati vengono salvati nel nodo `clienti/{cassa_id}/...` di Firebase, separati e protetti rispetto al nodo pubblico `scontrini`.

**Cassa unica di riferimento**: il progetto è configurato per il punto vendita `Negozio 1`, con ID tecnico `negozio1`. Le pagine cliente e demo usano `negozio1` come fallback se il parametro URL `?cassa=` non è specificato.

## Decisione futura: archiviazione e isolamento dei dati

L'attuale configurazione Firebase è mantenuta per avviare il primo punto vendita senza un cambiamento strutturale. Prima di distribuire Fiscal a più clienti, bisognerà decidere e implementare una delle seguenti architetture:

- **backend unico gestito dal proprietario**, con isolamento logico per ogni cliente/punto vendita;
- **backend o progetto separato per ogni cliente**, con dati e credenziali isolati.

La decisione dovrà definire autenticazione, autorizzazioni, conservazione/cancellazione degli scontrini, accesso ai contatti marketing e procedure di backup. Le regole Firebase attuali non sono ancora un modello multi-cliente definitivo.

## Come testare localmente (backend FastAPI, opzionale)

1. Attiva l'ambiente virtuale:
   ```bash
   source .venv/bin/activate
   ```
2. Installa le dipendenze:
   ```bash
   pip install fastapi uvicorn firebase-admin
   ```
3. Avvia il backend locale:
   ```bash
   python main.py
   ```
4. Apri l'app cliente: `http://localhost:8000/?cassa=negozio1`
5. Apri la cassa demo: `http://localhost:8000/cassa.html?cassa=negozio1`
6. Aggiungi prodotti nella cassa, clicca "Invia scontrino" e guardalo apparire istantaneamente sul cliente!

## Test rapido su hosting (senza backend)

1. Esegui il build della UI cliente:
   ```bash
   npm --prefix "Digital Receipt" run build
   ```
2. Esegui il deploy hosting:
   ```bash
   firebase deploy --only hosting
   ```
3. Apri `https://fiscal-9a0c8.web.app/cassa.html`
4. Compila il form dello scontrino e clicca "Invia scontrino"
5. Apri `https://fiscal-9a0c8.web.app/?cassa=negozio1` in un'altra scheda/dispositivo
6. Lo scontrino appare istantaneamente; compila (opzionalmente) il form Instagram/Telefono
7. Verifica su Firebase Console (Realtime Database) che scontrino e contatto siano stati salvati

## Programmazione chip NFC

1. Scarica l'app "NFC Tools" (iOS o Android)
2. Apri l'app → "Scrivi" → aggiungi record "URL/URI"
3. Inserisci: `https://fiscal-9a0c8.web.app/?cassa=negozio1`
4. Clicca "Scrivi" e avvicina il chip NFC

## Mappa della Documentazione

| File | Contenuto |
|------|-----------|
| `GUIDA_COMMERCIANTE.md` | Guida operativa rapida per l'uso quotidiano da parte del negoziante |
| `GUIDA_SETUP_COMPLETA_WINDOWS.md` | Setup completo su PC Windows con RedMon + verifica catena Firebase |
| `SETUP_FIREBASE_CREDENTIALS.md` | Come ottenere e configurare `serviceAccountKey.json` |
| `PROMPT_1_REDMON_SETUP.md` / `PROMPT_1_TEST_GUIDE.md` | Setup e test della stampante virtuale RedMon → `capture-service.js` |
| `PROMPT_2_NORMALIZER_SETUP.md` | Normalizzazione dello scontrino grezzo in JSON (`receipt-normalizer.js`) |
| `PROMPT_3_FIREBASE_SENDER_SETUP.md` | Invio a Firebase con retry e coda offline (`firebase-receipt-sender.js`) |
| `PROMPT_4_DIGITAL_PRINT_LOGIC.md` | Logica digitale/cartaceo con system tray (`receipt-processor.js`) |
| `TEST_NUOVE_FUNZIONALITA.md` | Test end-to-end completo della pipeline Prompt 1→4 |
| `TESTING_GUIDE.md` / `TEST_MANUALE.md` | Test della funzionalità di raccolta contatti (Instagram/Telefono) |
| `IMPLEMENTATION_SUMMARY.md` | Dettagli tecnici implementazione raccolta contatti |
| `DEPLOYMENT_GUIDE.md` | Deploy su Firebase Hosting (frontend) |
| `BACKEND_DEPLOYMENT_GUIDE.md` / `DECISION_BACKEND.md` | Deploy opzionale del backend Python su PythonAnywhere e relative considerazioni |
