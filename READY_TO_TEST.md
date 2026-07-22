# ✅ SISTEMA PRONTO PER IL TEST

## 🎉 Configurazione Completata!

Tutti i prerequisiti sono stati installati e configurati:

- ✅ **firebase-admin v14.2.0** - Installato
- ✅ **serviceAccountKey.json** - Configurato
- ✅ **config.json** - Presente
- ✅ **Tutti i servizi** - Pronti

---

## 🚀 Come Iniziare il Test

### Opzione 1: Test Interattivo (CONSIGLIATO)

```bash
cd /Users/ettoretitotto/Desktop/PROGRAMMI/Fiscal
node test-interactive.js
```

Questo ti darà un menu interattivo con 6 opzioni di test:
1. Test Normalizzazione Scontrino
2. Test Invio a Firebase
3. Test Coda Offline
4. Test File Watcher
5. Test Configurazione
6. Visualizza Log

### Opzione 2: Avvia il Receipt Processor

```bash
cd /Users/ettoretitotto/Desktop/PROGRAMMI/Fiscal
node receipt-processor.js
```

Questo avvierà il servizio integrato che:
- Monitora la cartella `./captured_receipts/`
- Normalizza gli scontrini
- Li invia a Firebase
- Gestisce la finestra di stampa (60 secondi)
- Fornisce un'interfaccia System Tray

---

## 📋 Checklist Pre-Test

Prima di iniziare, verifica:

- [ ] Sei nella cartella corretta: `/Users/ettoretitotto/Desktop/PROGRAMMI/Fiscal`
- [ ] Hai una connessione internet attiva
- [ ] Il file `serviceAccountKey.json` è presente
- [ ] Node.js è installato: `node --version`
- [ ] firebase-admin è installato: `npm list firebase-admin`

---

## 🧪 Test Rapido (2 minuti)

1. Avvia il test interattivo:
   ```bash
   node test-interactive.js
   ```

2. Scegli l'opzione **1** (Test Normalizzazione)

3. Scegli l'opzione **1** (Scontrino Semplice)

4. Dovresti vedere il scontrino normalizzato in JSON

**Risultato atteso:**
```json
{
  "store_name": "CASSA DEMO",
  "timestamp": "2026-07-18T14:30:00Z",
  "items": [...],
  "total": 3.85,
  "vat": 0.35
}
```

---

## 🔧 Comandi Utili

```bash
# Avvia il test interattivo
node test-interactive.js

# Avvia il Receipt Processor
node receipt-processor.js

# Visualizza i log in tempo reale
tail -f receipt-processor.log
tail -f firebase-sender.log

# Verifica firebase-admin
npm list firebase-admin

# Verifica serviceAccountKey.json
ls -la serviceAccountKey.json

# Pulisci la cartella di test
rm -rf ./captured_receipts/*

# Pulisci la coda offline
rm offline_queue.json
```

---

## 📞 Supporto

Se hai problemi:

1. Leggi `QUICK_TEST_GUIDE.md` per una guida rapida
2. Leggi `TEST_NUOVE_FUNZIONALITA.md` per test dettagliati
3. Controlla i log: `receipt-processor.log` e `firebase-sender.log`
4. Verifica `SETUP_FIREBASE_CREDENTIALS.md` per la configurazione Firebase

---

## 🎯 Prossimi Step

Una volta completati i test:

1. **Integra RedMon** con la tua stampante virtuale
2. **Configura il monitoraggio** della cartella `./captured_receipts/`
3. **Testa con scontrini reali** dalla tua cassa POS
4. **Deploy in produzione** seguendo `DEPLOYMENT_GUIDE.md`

---

**Buon test!** 🚀
