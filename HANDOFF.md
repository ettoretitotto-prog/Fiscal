# HANDOFF — Scontrino Digitale MVP

### Stato Attuale
*   **Architettura Serverless:** Il sistema non dipende più da un server locale (FastAPI/main.py è opzionale).
*   **Cassa Demo:** La pagina `cassa.html` scrive correttamente gli scontrini direttamente su Firebase Realtime Database.
*   **Multi-tenant:** Il sistema supporta più casse simultanee tramite parametro URL `?cassa=ID`.
*   **Hosting:** Deploy eseguito su Firebase Hosting (`https://fiscal-9a0c8.web.app`).
*   **Database:** Realtime Database attivo e funzionante (nodo `/scontrini`).

### Cose da Fare / Bug
*   **Ricezione Cliente:** `index.html` non riceve ancora lo scontrino in tempo reale. Probabile bug nel listener `on('value')` o nel filtraggio dei timestamp/status.
*   **Cleanup Scontrini:** Manca un sistema (es. Firebase Cloud Functions) per eliminare gli scontrini vecchi dal database.
*   **Sicurezza:** Le regole di sicurezza (`firestore.rules` create per errore invece di `database.rules.json`) vanno corrette per proteggere il Realtime Database.
*   **Integrazione Hardware:** Passaggio da `cassa.html` (demo manuale) a lettura automatica da stampanti ESC/POS reali.

### Architettura
*   `firebase-config.js`: Credenziali API per l'accesso al database.
*   `cassa.html`: Simulatore POS (JS Firebase SDK `set()` su `/scontrini`).
*   `index.html`: Portale cliente (JS Firebase SDK `on()` su `/scontrini`).
*   `main.py`: Backend Python (FastAPI + Admin SDK) — attualmente non necessario per il flusso demo ma utile per integrazioni future lato server.
*   `serviceAccountKey.json`: Chiave privata per l'Admin SDK di Firebase.
*   `firebase.json`: Configurazione Hosting.
