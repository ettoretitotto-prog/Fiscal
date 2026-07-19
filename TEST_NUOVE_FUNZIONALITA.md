# 🧪 Test Nuove Funzionalità - Prompt 1-4

## ✅ Stato: PRONTO PER IL TEST

Questo documento guida il test completo del sistema integrato di cattura, normalizzazione, invio a Firebase e stampa digitale/cartacea.

---

## 📋 Prerequisiti

Prima di iniziare, assicurati di avere:

- ✅ Node.js installato (`node --version`)
- ✅ npm installato (`npm --version`)
- ✅ Python 3.x installato (`python3 --version`)
- ✅ RedMon installato (Windows) o equivalente (macOS/Linux)
- ✅ Firebase CLI configurato (`firebase --version`)
- ✅ Credenziali Firebase in `serviceAccountKey.json`
- ✅ Dipendenze installate: `npm install`

---

## 🎯 Test Rapido (10 minuti)

### Step 1️⃣: Avvia il Receipt Processor

```bash
# Terminal 1: Avvia il servizio integrato
node receipt-processor.js
```

**Output atteso:**
```
✓ Receipt Processor avviato
✓ File watcher attivo su ./captured_receipts/
✓ System Tray disponibile
✓ In attesa di scontrini...
```

---

### Step 2️⃣: Simula la Cattura di uno Scontrino

```bash
# Terminal 2: Crea una cartella di test
mkdir -p ./captured_receipts

# Crea un file di scontrino simulato
cat > ./captured_receipts/receipt_2026_07_18_143000.txt << 'EOF'
CASSA DEMO
Via Roma 123, Milano
Tel: 02-1234567

Data: 18/07/2026 14:30:00
Scontrino: #12345

ARTICOLI:
Espresso                    1x €1.20
Cornetto                    1x €1.50
Acqua Minerale              1x €0.80

SUBTOTALE:                      €3.50
IVA (10%):                      €0.35
TOTALE:                         €3.85

Grazie per l'acquisto!
EOF
```

**Risultato atteso**: ✅ File creato in `./captured_receipts/`

---

### Step 3️⃣: Verifica l'Elaborazione

Nel Terminal 1 (Receipt Processor), dovresti vedere:

```
📄 Nuovo scontrino rilevato: receipt_2026_07_18_143000.txt
🔄 Normalizzazione in corso...
✓ Scontrino normalizzato:
  - Negozio: CASSA DEMO
  - Data: 2026-07-18T14:30:00Z
  - Articoli: 3
  - Totale: €3.85
📤 Invio a Firebase...
✓ Scontrino inviato a Firebase (ID: receipt_abc123)
⏱️  FINESTRA DI STAMPA APERTA (60 secondi)
🖨️  Premi 'p' per stampare, 'q' per chiudere
```

**Risultato atteso**: ✅ Scontrino elaborato e inviato a Firebase

---

### Step 4️⃣: Testa la Finestra di Stampa (60 secondi)

Nel Terminal 1, premi **`p`** per simulare la stampa:

```
🖨️  Stampa in corso...
✓ Scontrino stampato (carta)
✓ Log salvato in receipt-processor.log
```

**Risultato atteso**: ✅ Stampa simulata con successo

---

### Step 5️⃣: Verifica su Firebase Console

1. Apri: **https://console.firebase.google.com**
2. Seleziona il progetto **"fiscal-9a0c8"**
3. Vai a **"Realtime Database"**
4. Espandi: `receipts` → `2026-07-18`
5. Dovrebbe apparire il record con:
   - `id`: "receipt_abc123"
   - `store_name`: "CASSA DEMO"
   - `timestamp`: numero grande
   - `items`: array con articoli
   - `total`: 3.85
   - `status`: "SENT" o "PRINTED"

**Risultato atteso**: ✅ Dati salvati su Firebase

---

## 🎯 Test Avanzato (20 minuti)

### Step 6️⃣: Testa la Normalizzazione Avanzata

Crea uno scontrino con formati diversi:

```bash
cat > ./captured_receipts/receipt_test_normalization.txt << 'EOF'
PIZZERIA "DA MARIO"
Piazza Duomo, 1 - Milano

RICEVUTA FISCALE
Data: 18-07-2026 ore 15:45:30

PRODOTTI:
Pizza Margherita                    €8,50
Birra Media                         €3,00
Coperto                             €1,50

TOTALE LORDO:                       €13,00
IVA 10%:                            €1,30
TOTALE NETTO:                       €11,70

Grazie!
EOF
```

**Risultato atteso**: ✅ Normalizzazione corretta di:
- Nomi negozio con caratteri speciali
- Formati data diversi (DD-MM-YYYY vs DD/MM/YYYY)
- Prezzi con virgola (€8,50 vs €8.50)
- Calcolo IVA automatico

---

### Step 7️⃣: Testa la Coda Offline

Simula una disconnessione da Firebase:

```bash
# Terminal 1: Interrompi il Receipt Processor (Ctrl+C)
# Modifica config.json per disabilitare Firebase temporaneamente

# Crea un nuovo scontrino
cat > ./captured_receipts/receipt_offline.txt << 'EOF'
CASSA OFFLINE
Via Test 1

Data: 18/07/2026 16:00:00
Scontrino: #99999

ARTICOLI:
Caffè                       1x €1.00

TOTALE:                         €1.00

Grazie!
EOF

# Riavvia il Receipt Processor
node receipt-processor.js
```

**Risultato atteso**: ✅ Scontrino messo in coda offline e inviato quando la connessione ritorna

---

### Step 8️⃣: Testa il Retry Logic

Simula un errore di Firebase:

```bash
# Modifica firebase-config.js per usare un database non valido
# Crea un nuovo scontrino
# Verifica che il sistema riprovi automaticamente
```

**Risultato atteso**: ✅ Sistema riprova 3 volte con backoff esponenziale

---

## 🎯 Test di Stress (30 minuti)

### Step 9️⃣: Testa Multipli Scontrini Simultanei

```bash
# Crea 10 scontrini in rapida successione
for i in {1..10}; do
  cat > ./captured_receipts/receipt_stress_$i.txt << EOF
CASSA STRESS TEST
Via Test $i

Data: 18/07/2026 16:30:00
Scontrino: #$i

ARTICOLI:
Articolo $i                 1x €$((i)).00

TOTALE:                         €$((i)).00

Grazie!
EOF
  sleep 1
done
```

**Risultato atteso**: ✅ Tutti gli scontrini elaborati senza errori

---

### Step 🔟: Testa il Logging

Verifica il file di log:

```bash
# Visualizza gli ultimi 50 log
tail -50 receipt-processor.log

# Cerca errori
grep "ERROR" receipt-processor.log

# Conta scontrini elaborati
grep "Nuovo scontrino rilevato" receipt-processor.log | wc -l
```

**Risultato atteso**: ✅ Log completo e tracciabile

---

## 📊 Checklist Finale

Dopo aver completato tutti i test, verifica:

- [ ] Step 1: Receipt Processor avviato correttamente
- [ ] Step 2: File di scontrino creato
- [ ] Step 3: Scontrino elaborato e normalizzato
- [ ] Step 4: Finestra di stampa funziona (60 secondi)
- [ ] Step 5: Dati salvati su Firebase
- [ ] Step 6: Normalizzazione avanzata funziona
- [ ] Step 7: Coda offline funziona
- [ ] Step 8: Retry logic funziona
- [ ] Step 9: Stress test superato
- [ ] Step 10: Logging completo

---

## ✅ Se Tutti i Test Passano

Congratulazioni! Il sistema è **completamente funzionante**. 

**Prossimi step:**
1. Integra RedMon con la tua stampante virtuale
2. Configura il monitoraggio della cartella `./captured_receipts/`
3. Testa con scontrini reali dalla cassa POS
4. Deploy in produzione

---

## ❌ Se Qualcosa Non Funziona

### Problema: Receipt Processor non si avvia
**Soluzione**:
1. Verifica che Node.js sia installato: `node --version`
2. Verifica le dipendenze: `npm install`
3. Controlla i permessi della cartella: `chmod 755 ./captured_receipts/`
4. Apri la console e cerca errori rossi

### Problema: Scontrino non viene rilevato
**Soluzione**:
1. Verifica che il file sia in `./captured_receipts/`
2. Verifica il formato del nome file: `receipt_*.txt`
3. Controlla i permessi del file: `chmod 644 receipt_*.txt`
4. Verifica il file watcher nei log

### Problema: Normalizzazione non funziona
**Soluzione**:
1. Verifica il formato dello scontrino (vedi Step 2)
2. Controlla i regex in `receipt-normalizer.js`
3. Apri la console del browser (F12) e cerca errori
4. Verifica il file di log: `receipt-processor.log`

### Problema: Firebase non riceve i dati
**Soluzione**:
1. Verifica le credenziali in `serviceAccountKey.json`
2. Verifica le Firebase Rules in `database.rules.json`
3. Controlla la connessione internet
4. Verifica i log di Firebase Console

### Problema: Finestra di stampa non appare
**Soluzione**:
1. Verifica che il sistema operativo sia supportato
2. Controlla i permessi di sistema
3. Verifica il file di log per errori di stampa
4. Testa manualmente con `lp` (macOS/Linux) o `print` (Windows)

---

## 📞 Supporto

Se hai problemi:
1. Leggi `TESTING_GUIDE.md` per test più dettagliati
2. Controlla i log: `receipt-processor.log`
3. Apri la console del browser (F12) per errori JavaScript
4. Verifica `IMPLEMENTATION_SUMMARY.md` per l'architettura

---

## 🔧 Comandi Utili

```bash
# Avvia il Receipt Processor
node receipt-processor.js

# Pulisci la cartella di test
rm -rf ./captured_receipts/*

# Visualizza i log in tempo reale
tail -f receipt-processor.log

# Testa la normalizzazione
node -e "const n = require('./receipt-normalizer.js'); console.log(n.normalizeReceipt('...'))"

# Testa l'invio a Firebase
node -e "const f = require('./firebase-config.js'); f.sendReceipt({...})"

# Verifica la connessione Firebase
firebase database:get / --project fiscal-9a0c8
```

---

**Buon test!** 🚀
