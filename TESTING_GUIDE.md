# 🧪 Guida Test Completo - Senza NFC

## ✅ Obiettivo
Testare il sistema completo (frontend + backend + Firebase) senza chip NFC fisici, usando solo il browser.

---

## 📋 Prerequisiti

- ✅ Frontend deployato su Firebase Hosting: https://fiscal-9a0c8.web.app
- ✅ Firebase Rules aggiornate con nodo `clienti`
- ✅ Backend deployato su PythonAnywhere (o in esecuzione locale)
- ✅ Browser moderno (Chrome, Firefox, Safari)

---

## 🎯 Test 1: Verifica Frontend Online

### Step 1: Accedi al sito
1. Apri https://fiscal-9a0c8.web.app/?cassa=demo01
2. Dovrebbe apparire uno spinner: "In attesa del tuo scontrino digitale..."
3. Verifica che il CSS sia caricato (tema scuro con oro)

### Step 2: Apri la console del browser
1. Premi F12 (o Cmd+Option+I su Mac)
2. Vai al tab "Console"
3. Verifica che non ci siano errori rossi
4. Dovresti vedere: `[FIREBASE] Realtime Database client initialized` (o simile)

### Risultato atteso
✅ Pagina carica senza errori  
✅ Console mostra connessione a Firebase  
✅ Spinner visibile  

---

## 🎯 Test 2: Genera uno Scontrino (Metodo 1: cassa.html)

### Step 1: Apri la pagina della cassa
1. Apri https://fiscal-9a0c8.web.app/cassa.html
2. Dovrebbe apparire un form per inserire i dati dello scontrino

### Step 2: Compila il form
1. **Cassa ID**: `demo01`
2. **Nome Negozio**: `Negozio Test`
3. **Articoli**: Clicca "Aggiungi Articolo"
   - Nome: `Caffè`
   - Quantità: `1`
   - Prezzo: `2.50`
4. Clicca "Aggiungi Articolo" di nuovo
   - Nome: `Cornetto`
   - Quantità: `1`
   - Prezzo: `1.50`
5. Clicca "Invia Scontrino"

### Step 3: Verifica su Firebase Console
1. Accedi a https://console.firebase.google.com
2. Seleziona il progetto `fiscal-9a0c8`
3. Vai a "Realtime Database"
4. Espandi `scontrini`
5. Dovrebbe apparire un nuovo record con:
   - `cassa_id`: "demo01"
   - `status`: "UNCLAIMED"
   - `timestamp`: numero grande (millisecondi)
   - `data`: {...} (i dati dello scontrino)

### Risultato atteso
✅ Scontrino creato su Firebase  
✅ Status è "UNCLAIMED"  
✅ Timestamp è recente  

---

## 🎯 Test 3: Ricevi lo Scontrino (Simulazione NFC)

### Step 1: Apri il link del cliente
1. In una **nuova scheda**, apri https://fiscal-9a0c8.web.app/?cassa=demo01
2. Dovrebbe ancora mostrare lo spinner (sta cercando uno scontrino UNCLAIMED)

### Step 2: Attendi il match
1. Entro pochi secondi, dovrebbe apparire lo scontrino che hai creato
2. Lo scontrino mostrerà:
   - Nome negozio: "Negozio Test"
   - Data e ora
   - Articoli: Caffè (1x €2.50), Cornetto (1x €1.50)
   - Totale: €4.90
   - IVA calcolata

### Step 3: Verifica su Firebase Console
1. Torna a Firebase Console
2. Espandi lo scontrino che hai creato
3. Il `status` dovrebbe essere cambiato a "CLAIMED"

### Risultato atteso
✅ Scontrino appare automaticamente  
✅ Status cambia da UNCLAIMED a CLAIMED  
✅ Nessun altro cliente vede lo scontrino  

---

## 🎯 Test 4: Raccolta Contatti Instagram

### Step 1: Compila il form Instagram
1. Sulla pagina dello scontrino, scorri verso il basso
2. Dovrebbe apparire il form "📱 Rimani in contatto"
3. Il tab "Instagram" dovrebbe essere già selezionato
4. Nel campo di testo, inserisci: `@mario_rossi`
5. Clicca "Seguimi per offerte"

### Step 2: Verifica il feedback
1. Dovrebbe apparire: "✓ Grazie! Ti contatteremo presto"
2. Il messaggio dovrebbe scomparire dopo 4 secondi
3. Il campo di testo dovrebbe essere vuoto

### Step 3: Verifica su Firebase Console
1. Torna a Firebase Console
2. Vai a "Realtime Database"
3. Espandi `clienti` → `demo01` → `instagram`
4. Dovrebbe apparire un record `mario_rossi` con:
   - `instagram_handle`: "mario_rossi"
   - `primo_contatto`: timestamp
   - `ultimo_contatto`: timestamp
   - `numero_scontrini`: 1
   - `opt_in_marketing`: true

### Risultato atteso
✅ Dati salvati su Firebase  
✅ Feedback visivo appare  
✅ Contatore inizia a 1  

---

## 🎯 Test 5: Raccolta Contatti Telefono

### Step 1: Cambia tab a Telefono
1. Sulla stessa pagina dello scontrino, clicca il tab "Telefono"
2. Il placeholder dovrebbe cambiare a "+39 123 456 7890"
3. Il bottone dovrebbe cambiare a "Contattami"

### Step 2: Compila il form Telefono
1. Nel campo di testo, inserisci: `+39 320 123 4567`
2. Clicca "Contattami"

### Step 3: Verifica il feedback
1. Dovrebbe apparire: "✓ Grazie! Ti contatteremo presto"
2. Il campo di testo dovrebbe essere vuoto

### Step 4: Verifica su Firebase Console
1. Vai a `clienti` → `demo01` → `telefono`
2. Dovrebbe apparire un record `3201234567` con:
   - `telefono`: "3201234567" (solo cifre)
   - `primo_contatto`: timestamp
   - `ultimo_contatto`: timestamp
   - `numero_scontrini`: 1
   - `opt_in_marketing`: true

### Risultato atteso
✅ Normalizzazione funziona (@ rimosso, solo cifre)  
✅ Dati salvati su Firebase  
✅ Contatore inizia a 1  

---

## 🎯 Test 6: Update Contatto (Stesso Cliente)

### Step 1: Genera un nuovo scontrino
1. Torna a https://fiscal-9a0c8.web.app/cassa.html
2. Compila il form di nuovo (stessa cassa demo01, articoli diversi)
3. Clicca "Invia Scontrino"

### Step 2: Ricevi il nuovo scontrino
1. Apri una nuova scheda: https://fiscal-9a0c8.web.app/?cassa=demo01
2. Dovrebbe apparire il nuovo scontrino

### Step 3: Compila il form con lo stesso Instagram handle
1. Scorri verso il basso
2. Clicca tab "Instagram"
3. Inserisci: `@mario_rossi` (stesso di prima)
4. Clicca "Seguimi per offerte"

### Step 4: Verifica su Firebase Console
1. Vai a `clienti` → `demo01` → `instagram` → `mario_rossi`
2. Verifica che:
   - `primo_contatto`: **rimane invariato** (stesso timestamp di prima)
   - `ultimo_contatto`: **è aggiornato** (nuovo timestamp)
   - `numero_scontrini`: **è incrementato a 2** (non 1)

### Risultato atteso
✅ Merge funziona (non overwrite)  
✅ Contatore incrementato  
✅ Timestamp primo_contatto invariato  
✅ Timestamp ultimo_contatto aggiornato  

---

## 🎯 Test 7: Validazione Telefono

### Step 1: Tenta di inserire un numero troppo corto
1. Genera un nuovo scontrino
2. Ricevilo (apri il link ?cassa=demo01)
3. Clicca tab "Telefono"
4. Inserisci: `123` (solo 3 cifre)
5. Clicca "Contattami"

### Step 2: Verifica l'errore
1. Dovrebbe apparire: "⚠ Numero di telefono non valido"
2. Il messaggio dovrebbe essere rosso
3. Il messaggio dovrebbe scomparire dopo 3 secondi
4. I dati NON dovrebbero essere salvati su Firebase

### Risultato atteso
✅ Validazione funziona  
✅ Errore visibile  
✅ Dati non salvati  

---

## 🎯 Test 8: Normalizzazione Instagram

### Step 1: Tenta di inserire un handle con @
1. Genera un nuovo scontrino
2. Ricevilo
3. Clicca tab "Instagram"
4. Inserisci: `@MARIO_ROSSI` (con @, maiuscolo)
5. Clicca "Seguimi per offerte"

### Step 2: Verifica su Firebase Console
1. Vai a `clienti` → `demo01` → `instagram`
2. Dovrebbe apparire un record `mario_rossi` (minuscolo, senza @)
3. Non dovrebbe apparire `@MARIO_ROSSI` o `MARIO_ROSSI`

### Risultato atteso
✅ Normalizzazione funziona  
✅ @ rimosso automaticamente  
✅ Minuscolo applicato  

---

## 🎯 Test 9: TTL Scontrini (45 secondi)

### Step 1: Genera uno scontrino
1. Apri https://fiscal-9a0c8.web.app/cassa.html
2. Compila il form e clicca "Invia Scontrino"
3. Nota l'ora esatta

### Step 2: Attendi 45 secondi
1. Apri https://fiscal-9a0c8.web.app/?cassa=demo01
2. Dovrebbe apparire lo scontrino (entro 45 secondi)

### Step 3: Attendi altri 10 secondi (totale 55 secondi)
1. Apri una nuova scheda: https://fiscal-9a0c8.web.app/?cassa=demo01
2. Dovrebbe mostrare lo spinner (scontrino scaduto)
3. Non dovrebbe apparire lo scontrino

### Risultato atteso
✅ TTL di 45 secondi funziona  
✅ Scontrino scade automaticamente  
✅ Nessun cliente vede scontrini scaduti  

---

## 🎯 Test 10: Logica di Claim (Sticker Riutilizzabile)

### Step 1: Genera uno scontrino
1. Apri https://fiscal-9a0c8.web.app/cassa.html
2. Compila il form e clicca "Invia Scontrino"

### Step 2: Primo cliente riceve lo scontrino
1. Apri https://fiscal-9a0c8.web.app/?cassa=demo01
2. Dovrebbe apparire lo scontrino
3. Compila il form Instagram: `@cliente1`

### Step 3: Secondo cliente NON vede lo scontrino
1. In una nuova scheda, apri https://fiscal-9a0c8.web.app/?cassa=demo01
2. Dovrebbe mostrare lo spinner (scontrino già CLAIMED)
3. Non dovrebbe apparire lo scontrino del primo cliente

### Step 4: Genera un nuovo scontrino
1. Torna a https://fiscal-9a0c8.web.app/cassa.html
2. Compila il form e clicca "Invia Scontrino"

### Step 5: Secondo cliente riceve il nuovo scontrino
1. Ricarica la scheda del secondo cliente
2. Dovrebbe apparire il nuovo scontrino
3. Compila il form Instagram: `@cliente2`

### Risultato atteso
✅ Sticker NFC riutilizzabile  
✅ Ogni cliente vede solo il suo scontrino  
✅ Nessun cliente vede scontrini di altri  

---

## 📊 Checklist Finale

Dopo aver completato tutti i test, verifica:

- [ ] Frontend carica senza errori
- [ ] Scontrini creati su Firebase
- [ ] Scontrini ricevuti dal cliente
- [ ] Status cambia da UNCLAIMED a CLAIMED
- [ ] Form Instagram funziona
- [ ] Form Telefono funziona
- [ ] Normalizzazione Instagram funziona
- [ ] Validazione Telefono funziona
- [ ] Update contatto funziona (contatore incrementato)
- [ ] TTL di 45 secondi funziona
- [ ] Sticker riutilizzabile funziona
- [ ] Dati salvati su Firebase Console

---

## 🎯 Prossimi Step

Se tutti i test passano:

1. **Programmazione NFC**: Programma i chip NFC con l'URL
   - Usa l'app "NFC Tools" (iOS/Android)
   - Scrivi: `https://fiscal-9a0c8.web.app/?cassa=demo01`

2. **Deploy Backend**: Se non l'hai già fatto, segui `BACKEND_DEPLOYMENT_GUIDE.md`

3. **Integrazione Cassa**: Integra il sistema con la tua cassa POS

4. **Monitoraggio**: Monitora i dati su Firebase Console

---

## 📞 Troubleshooting

### Problema: Lo scontrino non appare
**Soluzione**:
1. Verifica che lo scontrino sia stato creato su Firebase Console
2. Verifica che il `cassa_id` sia lo stesso (demo01)
3. Verifica che il timestamp sia recente (meno di 45 secondi fa)
4. Apri la console del browser (F12) e cerca errori

### Problema: Il form non appare
**Soluzione**:
1. Verifica che lo scontrino sia stato marcato CLAIMED
2. Apri la console del browser e cerca errori JavaScript
3. Verifica che il CSS sia caricato (tema scuro)

### Problema: I dati non vengono salvati su Firebase
**Soluzione**:
1. Verifica che le Firebase Rules siano pubblicate
2. Verifica che il nodo `clienti` sia presente
3. Apri la console del browser e cerca errori
4. Controlla i log di Firebase Console

### Problema: Errore "Permission denied"
**Soluzione**:
1. Verifica che le Firebase Rules siano corrette
2. Verifica che il nodo `clienti` sia accessibile
3. Prova a ricaricare la pagina

---

**Test completato** ✅
