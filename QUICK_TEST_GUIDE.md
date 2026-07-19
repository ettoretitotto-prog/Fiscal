# 🚀 Guida Rapida di Test - Fiscal

## ✅ Stato: PRONTO PER IL TEST

Hai tre opzioni per testare le nuove funzionalità:

---

## 📋 Opzione 1: Test Interattivo (CONSIGLIATO)

La forma più semplice e intuitiva per testare tutto.

### Avvio

```bash
node test-interactive.js
```

### Cosa puoi fare

1. **Test Normalizzazione**: Normalizza scontrini con formati diversi
2. **Test Firebase**: Invia scontrini a Firebase
3. **Test Coda Offline**: Gestisci la coda offline
4. **Test File Watcher**: Simula la creazione di file
5. **Test Configurazione**: Visualizza la configurazione
6. **Visualizza Log**: Leggi i log dei servizi

### Esempio di utilizzo

```
🚀 Avvio Test Interattivo...

╔════════════════════════════════════════════════════════════╗
║  TEST INTERATTIVO - FISCAL                                ║
╚════════════════════════════════════════════════════════════╝

Seleziona un test:

  1. Test Normalizzazione Scontrino
  2. Test Invio a Firebase
  3. Test Coda Offline
  4. Test File Watcher
  5. Test Configurazione
  6. Visualizza Log
  0. Esci

Scelta: 1
```

---

## 📋 Opzione 2: Test Manuale Passo-Passo

Segui la guida dettagliata nel file `TEST_NUOVE_FUNZIONALITA.md`.

### Avvio del Receipt Processor

```bash
# Terminal 1
node receipt-processor.js
```

### Creazione di uno scontrino di test

```bash
# Terminal 2
mkdir -p ./captured_receipts

cat > ./captured_receipts/receipt_test.txt << 'EOF'
CASSA DEMO
Via Roma 123, Milano

Data: 18/07/2026 14:30:00
Scontrino: #12345

ARTICOLI:
Espresso                    1x €1.20
Cornetto                    1x €1.50

TOTALE:                         €2.70

Grazie!
EOF
```

### Verifica nel Terminal 1

Dovresti vedere:
```
📄 Nuovo file rilevato: receipt_test.txt
🔄 Normalizzazione in corso...
✓ Scontrino normalizzato: totale €2.70
📤 Invio a Firebase...
✓ Scontrino inviato a Firebase
⏱️  Finestra di stampa aperta (60 secondi)
🖨️  Premi 'p' per stampare, 'q' per chiudere
```

---

## 📋 Opzione 3: Test Automatico

Esegui tutti i test in sequenza.

```bash
# Crea 10 scontrini di test
for i in {1..10}; do
  cat > ./captured_receipts/receipt_auto_$i.txt << EOF
CASSA AUTO TEST
Via Test $i

Data: 18/07/2026 16:00:00
Scontrino: #$i

ARTICOLI:
Articolo $i                 1x €$((i)).00

TOTALE:                         €$((i)).00

Grazie!
EOF
  sleep 1
done
```

---

## 🔧 Prerequisiti

Prima di iniziare, verifica di avere:

```bash
# Verifica Node.js
node --version
# Dovrebbe essere v16 o superiore

# Verifica npm
npm --version

# Verifica le dipendenze
npm list firebase-admin
npm list fs
npm list path
```

Se manca `firebase-admin`:

```bash
npm install firebase-admin
```

---

## 📁 Struttura dei File

```
Fiscal/
├── receipt-processor.js          # Servizio integrato
├── firebase-receipt-sender.js    # Invio a Firebase
├── receipt-normalizer.js         # Normalizzazione
├── test-interactive.js           # Test interattivo
├── config.json                   # Configurazione
├── serviceAccountKey.json        # Credenziali Firebase
├── captured_receipts/            # Cartella di cattura
├── offline_queue.json            # Coda offline
├── receipt-processor.log         # Log del processor
├── firebase-sender.log           # Log del sender
└── TEST_NUOVE_FUNZIONALITA.md   # Guida dettagliata
```

---

## 🎯 Checklist di Test Rapido

- [ ] Avvia `test-interactive.js`
- [ ] Testa normalizzazione con scontrino semplice
- [ ] Testa normalizzazione con scontrino pizzeria
- [ ] Testa invio a Firebase (se disponibile)
- [ ] Testa coda offline
- [ ] Visualizza log
- [ ] Verifica file nella cartella `captured_receipts/`

---

## ✅ Risultati Attesi

### Test Normalizzazione
```json
{
  "store_name": "CASSA DEMO",
  "timestamp": "2026-07-18T14:30:00Z",
  "items": [
    {
      "name": "Espresso",
      "quantity": 1,
      "price": 1.20
    },
    {
      "name": "Cornetto",
      "quantity": 1,
      "price": 1.50
    }
  ],
  "total": 2.70,
  "vat": 0.27
}
```

### Test Firebase
```
✅ Scontrino inviato con successo!
   Receipt ID: demo01_2026-07-18T14:30:00Z_abc123
   Timestamp: 2026-07-18T14:30:00.000Z
```

### Test Coda Offline
```
📦 Ricevute in coda: 0
(nessuna ricevuta in attesa)
```

---

## ❌ Troubleshooting

### Problema: "firebase-admin non installato"
**Soluzione**:
```bash
npm install firebase-admin
```

### Problema: "serviceAccountKey.json non trovato"
**Soluzione**:
1. Scarica il file da Firebase Console
2. Posizionalo nella cartella del progetto
3. Riavvia il test

### Problema: "Errore di connessione a Firebase"
**Soluzione**:
1. Verifica la connessione internet
2. Verifica le credenziali in `serviceAccountKey.json`
3. Verifica le Firebase Rules in `database.rules.json`
4. Controlla i log: `firebase-sender.log`

### Problema: "File non viene rilevato"
**Soluzione**:
1. Verifica che il file sia in `./captured_receipts/`
2. Verifica il formato del nome: `receipt_*.txt`
3. Controlla i permessi: `chmod 644 receipt_*.txt`
4. Verifica il log: `receipt-processor.log`

---

## 📊 Comandi Utili

```bash
# Avvia il test interattivo
node test-interactive.js

# Avvia il Receipt Processor
node receipt-processor.js

# Visualizza i log in tempo reale
tail -f receipt-processor.log
tail -f firebase-sender.log

# Pulisci la cartella di test
rm -rf ./captured_receipts/*

# Pulisci la coda offline
rm offline_queue.json

# Conta i file di scontrini
ls -1 ./captured_receipts/*.txt | wc -l

# Visualizza la configurazione
cat config.json | jq .

# Testa la normalizzazione
node -e "const n = require('./receipt-normalizer'); console.log(JSON.stringify(n.normalize('NEGOZIO\nCaffè €2.50\nTOTALE €2.50'), null, 2))"
```

---

## 🚀 Prossimi Step

Una volta completati i test:

1. **Integra RedMon** con la tua stampante virtuale
2. **Configura il monitoraggio** della cartella `./captured_receipts/`
3. **Testa con scontrini reali** dalla tua cassa POS
4. **Deploy in produzione** seguendo `DEPLOYMENT_GUIDE.md`

---

## 📞 Supporto

Se hai problemi:

1. Leggi `TEST_NUOVE_FUNZIONALITA.md` per test più dettagliati
2. Controlla i log: `receipt-processor.log` e `firebase-sender.log`
3. Verifica `IMPLEMENTATION_SUMMARY.md` per l'architettura
4. Consulta `GUIDA_COMMERCIANTE.md` per l'uso operativo

---

## 🎉 Buon Test!

Inizia con:
```bash
node test-interactive.js
```

Scegli l'opzione 1 per testare la normalizzazione! 🚀
