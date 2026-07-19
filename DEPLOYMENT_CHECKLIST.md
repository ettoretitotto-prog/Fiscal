# 🚀 Deployment Checklist - Raccolta Contatti Instagram + Telefono

## ✅ Status: READY FOR DEPLOYMENT

Data: 12/07/2026  
Versione: 1.0  
Stato Firebase Rules: ✅ AGGIORNATE (da te)  
Stato index.html: ✅ PRONTO  
Stato main.py: ✅ INVARIATO  

---

## 📋 Pre-Deployment Verification

### ✅ File Verificati

```
✅ index.html
   - CSS: 6 occorrenze di "contact-form" trovate
   - JavaScript: 2 occorrenze di "initContactForm" trovate
   - HTML: Form opzionale aggiunto dopo receipt footer
   - Logica claim scontrino: INVARIATA

✅ database.rules.json
   - Nodo "clienti": 3 occorrenze trovate
   - Nodo "instagram": 4 occorrenze trovate
   - Nodo "telefono": 4 occorrenze trovate
   - Nodo "scontrini": INVARIATO

✅ main.py
   - Funzione "post_receipt": INVARIATA
   - Nessuna modifica backend
```

---

## 🎯 Deployment Steps

### Step 1: Firebase Rules (✅ GIÀ COMPLETATO DA TE)
- [x] Accesso a Firebase Console → Realtime Database → Rules
- [x] Sostituzione del contenuto con il nuovo `database.rules.json`
- [x] Pubblicazione delle regole ("Publish")

**Verifica**: Le regole sono ora live su Firebase

---

### Step 2: Deploy index.html (PRONTO)

**Opzione A: Se usi FastAPI (main.py)**
```bash
# Il file index.html viene servito automaticamente da FastAPI
# Assicurati che main.py sia in esecuzione:
python main.py
# L'app sarà disponibile su http://localhost:8000
```

**Opzione B: Se usi un server web (nginx, Apache, etc.)**
```bash
# Copia index.html nella directory root del server
cp /Users/ettoretitotto/Desktop/PROGRAMMI/Fiscal/index.html /path/to/webroot/
```

**Opzione C: Se usi Firebase Hosting**
```bash
# Configura firebase.json e deploy
firebase deploy --only hosting
```

---

### Step 3: Verifica Post-Deployment

#### 3.1 Verifica locale (se usi FastAPI)
```bash
# Avvia il server
cd /Users/ettoretitotto/Desktop/PROGRAMMI/Fiscal
python main.py

# In un altro terminale, testa l'endpoint
curl http://localhost:8000/
# Dovrebbe restituire index.html con il form contatti
```

#### 3.2 Verifica su browser
1. Apri http://localhost:8000/?cassa=demo01 (o il tuo URL)
2. Attendi lo spinner "In attesa del tuo scontrino digitale..."
3. Verifica che il form non sia visibile (ancora nascosto)

#### 3.3 Verifica Firebase Console
1. Accedi a Firebase Console → Realtime Database
2. Verifica che il nodo `clienti` sia presente nella struttura
3. Verifica che le regole di sicurezza siano pubblicate

---

## 🧪 Test con NFC (Prossimo Step)

### Flusso di Test Completo

1. **Genera uno scontrino** (via cassa.html o API)
   ```bash
   curl -X POST http://localhost:8000/api/receipt \
     -H "Content-Type: application/json" \
     -d '{
       "cassa_id": "demo01",
       "store_name": "Negozio Test",
       "items": [
         {"name": "Prodotto 1", "qty": 1, "price": 10.00}
       ],
       "total": 12.20,
       "tax_id": "IT00000000000"
     }'
   ```

2. **Scansiona NFC** (o accedi manualmente a http://localhost:8000/?cassa=demo01)
   - Dovrebbe apparire lo scontrino
   - Subito dopo, dovrebbe apparire il form "📱 Rimani in contatto"

3. **Compila il form Instagram**
   - Clicca su tab "Instagram" (dovrebbe essere già selezionato)
   - Inserisci "@mario_rossi"
   - Clicca "Seguimi per offerte"
   - Dovrebbe apparire "✓ Grazie! Ti contatteremo presto"

4. **Verifica su Firebase Console**
   - Accedi a Realtime Database
   - Naviga a `clienti/demo01/instagram/mario_rossi`
   - Dovrebbe contenere:
     ```json
     {
       "instagram_handle": "mario_rossi",
       "primo_contatto": 1720777200000,
       "ultimo_contatto": 1720777200000,
       "numero_scontrini": 1,
       "opt_in_marketing": true
     }
     ```

5. **Compila il form Telefono**
   - Clicca su tab "Telefono"
   - Inserisci "+39 320 123 4567"
   - Clicca "Contattami"
   - Dovrebbe apparire "✓ Grazie! Ti contatteremo presto"

6. **Verifica su Firebase Console**
   - Naviga a `clienti/demo01/telefono/3201234567`
   - Dovrebbe contenere:
     ```json
     {
       "telefono": "3201234567",
       "primo_contatto": 1720777200000,
       "ultimo_contatto": 1720777200000,
       "numero_scontrini": 1,
       "opt_in_marketing": true
     }
     ```

7. **Test di update (stesso cliente)**
   - Genera un nuovo scontrino per la stessa cassa
   - Scansiona NFC di nuovo
   - Compila il form con lo stesso Instagram handle "@mario_rossi"
   - Verifica su Firebase Console che:
     - `primo_contatto` rimane invariato
     - `ultimo_contatto` è aggiornato
     - `numero_scontrini` è incrementato a 2

---

## 🔍 Troubleshooting

### Problema: Il form non appare dopo lo scontrino
**Soluzione**:
1. Apri la console del browser (F12)
2. Verifica che non ci siano errori JavaScript
3. Verifica che `initContactForm()` sia stata chiamata
4. Controlla che il CSS sia caricato correttamente

### Problema: Errore "Errore nel salvataggio. Riprova."
**Soluzione**:
1. Verifica che le Firebase Rules siano state pubblicate
2. Verifica che il nodo `clienti` sia accessibile
3. Controlla i log di Firebase Console per errori di validazione
4. Verifica che il valore sia normalizzato correttamente

### Problema: Il contatore non si incrementa
**Soluzione**:
1. Verifica che `firebase.database.ServerValue.increment(1)` sia supportato
2. Controlla che il merge sia avvenuto correttamente
3. Verifica che il campo `numero_scontrini` sia un numero

### Problema: Il timestamp non è server-side
**Soluzione**:
1. Verifica che `firebase.database.ServerValue.TIMESTAMP` sia usato
2. Controlla che il timestamp sia un numero (millisecondi)
3. Verifica che il server Firebase sia sincronizzato

---

## 📊 Metriche di Successo

Dopo il deployment, verifica che:

- ✅ Lo scontrino viene visualizzato correttamente
- ✅ Il form appare dopo il rendering dello scontrino
- ✅ Il tab switching funziona (Instagram ↔ Telefono)
- ✅ La normalizzazione funziona (@ rimosso, minuscolo, solo cifre)
- ✅ La validazione funziona (errore se < 10 cifre per telefono)
- ✅ I dati vengono salvati su Firebase
- ✅ Il feedback visivo appare (checkmark verde)
- ✅ Il form si resetta dopo il submit
- ✅ L'update funziona (stesso cliente, contatore incrementato)
- ✅ La logica di claim dello scontrino rimane invariata

---

## 📁 File di Riferimento

- **`DIFF_PROPOSED.md`**: Diff completo delle modifiche
- **`IMPLEMENTATION_SUMMARY.md`**: Documentazione tecnica dettagliata
- **`CHANGES_SUMMARY.md`**: Riepilogo delle modifiche
- **`index.html`**: File aggiornato con form contatti
- **`database.rules.json`**: Regole Firebase aggiornate

---

## 🎯 Prossimi Step Dopo il Test

1. **Se il test ha successo**:
   - Documentare i risultati
   - Fare il deploy in produzione
   - Monitorare i dati su Firebase Console

2. **Se il test fallisce**:
   - Controllare i log di browser e Firebase
   - Verificare le regole di sicurezza
   - Contattare il supporto Firebase se necessario

3. **Funzionalità future**:
   - Dashboard negoziante con autenticazione
   - Integrazione Instagram API (DM automatici)
   - Integrazione SMS (Twilio, AWS SNS)
   - Export dati clienti (CSV/Excel)
   - Funzionalità GDPR (cancellazione, export)

---

## 📞 Supporto

Per domande o problemi durante il deployment:

1. Verifica che le Firebase Rules siano state pubblicate correttamente
2. Controlla la console del browser per errori JavaScript
3. Verifica su Firebase Console che i dati siano salvati in `clienti/{cassa}/{tipo}/{handle}`
4. Controlla i log di Firebase per errori di validazione

---

**Deployment pronto** ✅  
**Prossimo step**: Test con NFC
