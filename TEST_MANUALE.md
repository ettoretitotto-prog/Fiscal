# 🧪 Test Manuale - Raccolta Contatti Instagram + Telefono

## ✅ Stato: PRONTO PER IL TEST

Il sistema è completamente deployato e online. Segui questi step per testare tutto.

---

## 🎯 Test Rapido (5 minuti)

### Step 1️⃣: Genera uno Scontrino

1. Apri in una scheda: **https://fiscal-9a0c8.web.app/cassa.html**
2. Vedrai la pagina "Cassa Demo" con articoli predefiniti
3. Clicca su **"Espresso"** (€1.20)
4. Clicca su **"Cornetto"** (€1.50)
5. Vedrai il totale aggiornato a €2.70
6. Clicca il bottone **"Invia scontrino al cliente"** (in basso)
7. Dovrebbe apparire un messaggio di conferma

**Risultato atteso**: ✅ Scontrino creato su Firebase

---

### Step 2️⃣: Ricevi lo Scontrino (Simulazione NFC)

1. Apri in una **NUOVA scheda**: **https://fiscal-9a0c8.web.app/?cassa=demo01**
2. Vedrai uno spinner: "In attesa del tuo scontrino digitale..."
3. **Entro pochi secondi**, dovrebbe apparire lo scontrino con:
   - Nome negozio: "Cassa Demo"
   - Data e ora
   - Articoli: Espresso (1x €1.20), Cornetto (1x €1.50)
   - Totale: €2.70
   - IVA calcolata

**Risultato atteso**: ✅ Scontrino visualizzato automaticamente

---

### Step 3️⃣: Testa la Raccolta Contatti Instagram

1. Sulla pagina dello scontrino, **scorri verso il basso**
2. Dovrebbe apparire il form **"📱 Rimani in contatto"**
3. Il tab **"Instagram"** dovrebbe essere già selezionato
4. Nel campo di testo, inserisci: **@mario_rossi**
5. Clicca il bottone **"Seguimi per offerte"**
6. Dovrebbe apparire: **"✓ Grazie! Ti contatteremo presto"** (in verde)
7. Il messaggio dovrebbe scomparire dopo 4 secondi
8. Il campo di testo dovrebbe essere vuoto

**Risultato atteso**: ✅ Feedback visivo appare e scompare

---

### Step 4️⃣: Verifica su Firebase Console

1. Apri: **https://console.firebase.google.com**
2. Seleziona il progetto **"fiscal-9a0c8"**
3. Vai a **"Realtime Database"**
4. Espandi: `clienti` → `demo01` → `instagram`
5. Dovrebbe apparire un record **`mario_rossi`** con:
   - `instagram_handle`: "mario_rossi"
   - `primo_contatto`: numero grande (timestamp)
   - `ultimo_contatto`: numero grande (timestamp)
   - `numero_scontrini`: 1
   - `opt_in_marketing`: true

**Risultato atteso**: ✅ Dati salvati su Firebase

---

## 🎯 Test Avanzato (Telefono)

### Step 5️⃣: Testa la Raccolta Contatti Telefono

1. Genera un **nuovo scontrino** (ripeti Step 1)
2. Ricevilo (ripeti Step 2, apri nuovo link ?cassa=demo01)
3. Scorri verso il basso fino al form "📱 Rimani in contatto"
4. Clicca il tab **"Telefono"**
5. Il placeholder dovrebbe cambiare a "+39 123 456 7890"
6. Il bottone dovrebbe cambiare a "Contattami"
7. Nel campo di testo, inserisci: **+39 320 123 4567**
8. Clicca **"Contattami"**
9. Dovrebbe apparire: **"✓ Grazie! Ti contatteremo presto"**

**Risultato atteso**: ✅ Feedback visivo appare

---

### Step 6️⃣: Verifica Telefono su Firebase

1. Torna a Firebase Console
2. Espandi: `clienti` → `demo01` → `telefono`
3. Dovrebbe apparire un record **`3201234567`** (solo cifre) con:
   - `telefono`: "3201234567"
   - `primo_contatto`: timestamp
   - `ultimo_contatto`: timestamp
   - `numero_scontrini`: 1
   - `opt_in_marketing`: true

**Risultato atteso**: ✅ Numero normalizzato (solo cifre)

---

## 🎯 Test di Update (Stesso Cliente)

### Step 7️⃣: Testa l'Incremento del Contatore

1. Genera un **nuovo scontrino** (ripeti Step 1)
2. Ricevilo (ripeti Step 2)
3. Scorri verso il basso
4. Clicca tab "Instagram"
5. Inserisci: **@mario_rossi** (STESSO di prima)
6. Clicca "Seguimi per offerte"
7. Dovrebbe apparire il feedback

**Risultato atteso**: ✅ Nessun errore

---

### Step 8️⃣: Verifica Update su Firebase

1. Torna a Firebase Console
2. Espandi: `clienti` → `demo01` → `instagram` → `mario_rossi`
3. Verifica che:
   - `primo_contatto`: **rimane lo stesso** (timestamp non cambia)
   - `ultimo_contatto`: **è aggiornato** (nuovo timestamp)
   - `numero_scontrini`: **è incrementato a 2** (non 1)

**Risultato atteso**: ✅ Merge funziona (contatore incrementato)

---

## 🎯 Test di Validazione

### Step 9️⃣: Testa la Validazione Telefono

1. Genera un nuovo scontrino
2. Ricevilo
3. Clicca tab "Telefono"
4. Inserisci: **123** (solo 3 cifre, troppo poche)
5. Clicca "Contattami"
6. Dovrebbe apparire: **"⚠ Numero di telefono non valido"** (in rosso)
7. Il messaggio dovrebbe scomparire dopo 3 secondi
8. I dati NON dovrebbero essere salvati su Firebase

**Risultato atteso**: ✅ Validazione funziona

---

### Step 🔟: Testa la Normalizzazione Instagram

1. Genera un nuovo scontrino
2. Ricevilo
3. Clicca tab "Instagram"
4. Inserisci: **@MARIO_ROSSI** (con @, maiuscolo)
5. Clicca "Seguimi per offerte"
6. Torna a Firebase Console
7. Espandi: `clienti` → `demo01` → `instagram`
8. Dovrebbe apparire un record **`mario_rossi`** (minuscolo, senza @)
9. Non dovrebbe apparire `@MARIO_ROSSI` o `MARIO_ROSSI`

**Risultato atteso**: ✅ Normalizzazione funziona

---

## 📊 Checklist Finale

Dopo aver completato tutti i test, verifica:

- [ ] Step 1: Scontrino creato su Firebase
- [ ] Step 2: Scontrino ricevuto dal cliente
- [ ] Step 3: Form Instagram funziona
- [ ] Step 4: Dati Instagram salvati su Firebase
- [ ] Step 5: Form Telefono funziona
- [ ] Step 6: Dati Telefono salvati su Firebase
- [ ] Step 7: Update contatto funziona
- [ ] Step 8: Contatore incrementato
- [ ] Step 9: Validazione Telefono funziona
- [ ] Step 10: Normalizzazione Instagram funziona

---

## ✅ Se Tutti i Test Passano

Congratulazioni! Il sistema è **completamente funzionante**. 

**Prossimi step:**
1. Programma i chip NFC con l'URL: `https://fiscal-9a0c8.web.app/?cassa=demo01`
2. Opzionale: Deploy backend su PythonAnywhere (segui `BACKEND_DEPLOYMENT_GUIDE.md`)
3. Integra il sistema con la tua cassa POS

---

## ❌ Se Qualcosa Non Funziona

### Problema: Lo scontrino non appare
**Soluzione**:
1. Verifica che lo scontrino sia stato creato su Firebase Console
2. Verifica che il `cassa_id` sia lo stesso (demo01)
3. Apri la console del browser (F12) e cerca errori rossi

### Problema: Il form non appare
**Soluzione**:
1. Verifica che lo scontrino sia stato marcato CLAIMED
2. Apri la console del browser (F12) e cerca errori
3. Verifica che il CSS sia caricato (tema scuro con oro)

### Problema: I dati non vengono salvati
**Soluzione**:
1. Verifica che le Firebase Rules siano pubblicate
2. Apri la console del browser (F12) e cerca errori
3. Controlla i log di Firebase Console

---

## 📞 Supporto

Se hai problemi:
1. Leggi `TESTING_GUIDE.md` per test più dettagliati
2. Controlla i log di Firebase Console
3. Apri la console del browser (F12) per errori JavaScript

---

**Buon test!** 🚀
