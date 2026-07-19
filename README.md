# Scontrino Digitale — Zero-Hardware Multi-Tenant MVP

Questo MVP connette una cassa (POS o tablet) a un dispositivo cliente (NFC o URL statico) in tempo reale tramite **Firebase Realtime Database**.

## Struttura del Progetto

- `main.py` — Backend FastAPI che riceve POST `/api/receipt` dalle casse e scrive nel Realtime Database.
- `index.html` — Pagina cliente che ascolta i cambiamenti in tempo reale della propria cassa per renderizzare lo scontrino.
- `cassa.html` — Simulatore di cassa per il pitch per aggiungere prodotti e inviare lo scontrino.
- `serviceAccountKey.json` — Certificato privato di amministrazione Firebase scaricato dalla console di Firebase.

## Flusso Funzionale Multi-Tenant & Sicuro (TTL)

1. **Tap NFC del Cliente:**
   Il cliente tocca lo sticker NFC che lo indirizza a:
   `https://fiscal-9a0c8.web.app/?cassa=demo01`

2. **In ascolto (onSnapshot / value):**
   La pagina si apre e si mette in ascolto in tempo reale su Firebase sul nodo `scontrini` per la cassa `demo01` dove lo scontrino è `UNCLAIMED` e il timestamp non è più vecchio di 45 secondi.

3. **Stampa della Cassa (POST):**
   La cassa effettua una POST a `/api/receipt` con il JSON dello scontrino. Il backend Python lo memorizza su Firebase impostando il server timestamp e lo stato `UNCLAIMED`.

4. **Claim istantaneo:**
   Il browser del cliente rileva l'inserimento, renderizza lo scontrino fiscale in stile "Documento Commerciale" italiano, imposta lo stato a `CLAIMED` (consumandolo in modo che nessun altro possa riceverlo) e arresta il listener.

## Come testare localmente

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
4. Apri l'app cliente: `http://localhost:8000/?cassa=demo01`
5. Apri la cassa demo: `http://localhost:8000/cassa.html?cassa=demo01`
6. Aggiungi prodotti nella cassa, clicca "Invia scontrino" e guardalo apparire istantaneamente sul cliente!
