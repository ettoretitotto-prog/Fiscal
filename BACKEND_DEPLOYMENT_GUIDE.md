# 🚀 Guida Deploy Backend - PythonAnywhere (Consigliato)

## ✅ Obiettivo
Mettere il backend `main.py` online su un server cloud 24/7, in modo che:
- La cassa possa inviare gli scontrini via API
- Il sito frontend (già online su Firebase Hosting) possa ricevere gli scontrini
- Il sistema funzioni sempre, anche quando il tuo PC è spento

---

## 📋 Opzioni di Deploy

### Opzione 1: PythonAnywhere (CONSIGLIATA - Gratuita)
✅ Facile da configurare  
✅ Supporta Python nativamente  
✅ Piano gratuito sufficiente per test  
✅ Nessuna carta di credito richiesta  

### Opzione 2: Heroku (Deprecato ma ancora funzionante)
⚠️ Richiede carta di credito  
⚠️ Piano gratuito rimosso nel 2022  

### Opzione 3: Railway / Render
💰 Piani a pagamento  

---

## 🎯 Step-by-Step: Deploy su PythonAnywhere

### Step 1: Registrazione
1. Vai su https://www.pythonanywhere.com
2. Clicca "Sign up for free"
3. Crea un account (username, email, password)
4. Verifica l'email

### Step 2: Upload dei file
1. Accedi a PythonAnywhere
2. Vai a "Files" (in alto a sinistra)
3. Crea una cartella `/home/tuousername/fiscal`
4. Upload i seguenti file:
   - `main.py`
   - `firebase-config.js`
   - `serviceAccountKey.json`
   - `database.rules.json`

**Nota:** Non serve uploadare `index.html` e `cassa.html` perché sono già su Firebase Hosting.

### Step 3: Configurazione Web App
1. Vai a "Web" (in alto a sinistra)
2. Clicca "Add a new web app"
3. Scegli "Manual configuration"
4. Seleziona "Python 3.10" (o versione più recente)
5. Clicca "Next"

### Step 4: Configurazione WSGI
1. Vai a "Web" → "Web app configuration"
2. Scorri fino a "WSGI configuration file"
3. Clicca sul link `/var/www/tuousername_pythonanywhere_com_wsgi.py`
4. Sostituisci il contenuto con:

```python
import sys
import os

# Aggiungi il percorso della tua app
path = '/home/tuousername/fiscal'
if path not in sys.path:
    sys.path.append(path)

# Importa l'app FastAPI
from main import app

# WSGI application
application = app
```

5. Salva il file (Ctrl+S)

### Step 5: Installa le dipendenze
1. Vai a "Consoles" (in alto a sinistra)
2. Clicca "Bash console"
3. Esegui i seguenti comandi:

```bash
cd /home/tuousername/fiscal
pip install fastapi uvicorn firebase-admin
```

### Step 6: Ricarica l'app
1. Torna a "Web"
2. Clicca il bottone "Reload" (verde, in alto a destra)
3. Attendi 10-20 secondi

### Step 7: Verifica il deploy
1. Vai a `https://tuousername.pythonanywhere.com`
2. Dovrebbe apparire lo scontrino digitale (index.html)
3. Prova l'endpoint API:
   ```bash
   curl -X POST https://tuousername.pythonanywhere.com/api/receipt \
     -H "Content-Type: application/json" \
     -d '{
       "cassa_id": "TV01",
       "store_name": "Test Store",
       "items": [{"name": "Prodotto", "qty": 1, "price": 10.00}],
       "total": 12.20,
       "tax_id": "IT00000000000"
     }'
   ```

---

## 🧪 Test Senza NFC (Simulazione)

### Metodo 1: Usa cassa.html per generare scontrini
1. Apri https://fiscal-9a0c8.web.app/cassa.html
2. Compila il form:
   - **Cassa ID**: TV01
   - **Nome Negozio**: Negozio Test
   - **Articoli**: Aggiungi prodotti
   - **Totale**: Calcolato automaticamente
3. Clicca "Invia Scontrino"
4. Subito dopo, apri https://fiscal-9a0c8.web.app/?cassa=TV01
5. Dovrebbe apparire lo scontrino che hai appena creato
6. Compila il form Instagram/Telefono per testare la raccolta contatti

### Metodo 2: Usa curl per generare scontrini (Avanzato)
```bash
# Genera uno scontrino
curl -X POST https://tuousername.pythonanywhere.com/api/receipt \
  -H "Content-Type: application/json" \
  -d '{
    "cassa_id": "TV01",
    "store_name": "Negozio Test",
    "items": [
      {"name": "Caffè", "qty": 1, "price": 2.50},
      {"name": "Cornetto", "qty": 1, "price": 1.50}
    ],
    "total": 4.90,
    "tax_id": "IT00000000000"
  }'

# Poi accedi a: https://fiscal-9a0c8.web.app/?cassa=TV01
```

### Metodo 3: Simula NFC con un link
1. Crea un link: `https://fiscal-9a0c8.web.app/?cassa=TV01`
2. Apri il link sul tuo telefono
3. Genera uno scontrino da cassa.html
4. Ricarica il link sul telefono
5. Dovrebbe apparire lo scontrino

---

## 🔗 URL Finali

Dopo il deploy, avrai:

- **Frontend (Scontrino Cliente)**: https://fiscal-9a0c8.web.app/?cassa=TV01
- **Frontend (Cassa)**: https://fiscal-9a0c8.web.app/cassa.html
- **Backend API**: https://tuousername.pythonanywhere.com/api/receipt
- **Database**: Firebase Realtime Database (gestito da Firebase)

---

## 🔐 Sicurezza

### Proteggere l'API
Se vuoi proteggere l'endpoint `/api/receipt` da accessi non autorizzati, aggiungi un token:

**In main.py:**
```python
from fastapi import Header, HTTPException

API_TOKEN = "tuo_token_segreto_qui"

@app.post("/api/receipt")
async def post_receipt(payload: dict, authorization: str = Header(None)):
    if authorization != f"Bearer {API_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    # ... resto del codice
```

**Quando chiami l'API:**
```bash
curl -X POST https://tuousername.pythonanywhere.com/api/receipt \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tuo_token_segreto_qui" \
  -d '{...}'
```

---

## 🐛 Troubleshooting

### Problema: "ModuleNotFoundError: No module named 'firebase_admin'"
**Soluzione**: Esegui `pip install firebase-admin` nella bash console di PythonAnywhere

### Problema: "Permission denied" quando accedi a serviceAccountKey.json
**Soluzione**: Assicurati che il file sia nella stessa cartella di main.py

### Problema: L'app non si ricarica
**Soluzione**: 
1. Vai a "Web"
2. Clicca "Reload" di nuovo
3. Attendi 30 secondi
4. Riprova

### Problema: Errore 500 quando chiamo l'API
**Soluzione**:
1. Vai a "Web" → "Log files"
2. Leggi il "Server log" per vedere l'errore
3. Correggi il problema in main.py
4. Ricarica l'app

---

## 📊 Monitoraggio

### Controllare i log
1. Vai a "Web" → "Log files"
2. Leggi:
   - **Server log**: Errori del server
   - **Error log**: Errori Python
   - **Access log**: Richieste HTTP

### Controllare l'utilizzo
1. Vai a "Account" → "Usage"
2. Vedi CPU, memoria, banda utilizzate

---

## 🎯 Prossimi Step

1. **Deploy completato**: Il backend è online 24/7
2. **Test con cassa.html**: Genera scontrini e verifica che appaiano
3. **Test raccolta contatti**: Compila il form Instagram/Telefono
4. **Programmazione NFC**: Quando tutto funziona, programma i chip NFC con l'URL

---

## 📞 Supporto

Se hai problemi:
1. Controlla i log di PythonAnywhere
2. Verifica che serviceAccountKey.json sia presente
3. Verifica che le Firebase Rules siano pubblicate
4. Prova a ricaricare l'app

---

**Deploy backend completato** ✅
