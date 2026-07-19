# 📱 Guida Rapida per il Commerciante - Scontrino Digitale NFC

## 🚀 Avvio Rapido

### 1. Installazione Iniziale
```bash
# Sul server (Windows)
cd C:\path\to\Fiscal
npm install
node receipt-processor.js
```

### 2. Configurazione Stampante
- Collegare la stampante Epson al PC
- Installare RedMon (Print to File)
- Configurare la stampante virtuale "CAPTURE_PRINTER"

### 3. Configurazione Gestionale
- Impostare la stampante di default su "CAPTURE_PRINTER"
- Quando stampi uno scontrino, verrà catturato automaticamente

---

## 📊 Flusso Operativo

```
1. Commerciante stampa scontrino dal gestionale
   ↓
2. RedMon cattura il file
   ↓
3. Sistema normalizza i dati
   ↓
4. Scontrino inviato a Firebase (digitale)
   ↓
5. Pulsante "Stampa su carta" disponibile per 60 secondi
   ↓
6. Cliente legge QR code con NFC
   ↓
7. Riceve scontrino digitale su smartphone
```

---

## 🖨️ Stampa Cartacea (Opzionale)

**Entro 60 secondi dalla cattura:**
- Premere `p` nella console per stampare su carta
- La stampante fisica stamperà il ricevimento

---

## 📱 Per il Cliente

1. **Scansionare QR Code** dal display
2. **Ricevere scontrino digitale** su smartphone
3. **Consultare offline** quando necessario

---

## ⚙️ Configurazione Avanzata

### File di Configurazione: `config.json`
```json
{
  "firebase": {
    "projectId": "fiscal-nfc",
    "apiKey": "YOUR_API_KEY"
  },
  "printer": {
    "name": "CAPTURE_PRINTER",
    "timeout": 60000
  },
  "capture": {
    "directory": "./captured_receipts",
    "watchInterval": 2000
  }
}
```

---

## 🔧 Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| Scontrino non catturato | Verificare che RedMon sia installato e attivo |
| Stampa non funziona | Controllare il nome della stampante in config.json |
| Firebase offline | Il sistema mette in coda e sincronizza quando online |
| QR Code non legge | Verificare la connessione WiFi del cliente |

---

## 📞 Supporto

- **Log file**: `receipt-processor.log`
- **Cartella catture**: `./captured_receipts/`
- **Database**: Firebase Realtime Database

---

## ✅ Checklist Avvio

- [ ] Node.js installato
- [ ] Dipendenze npm installate
- [ ] RedMon configurato
- [ ] Stampante virtuale creata
- [ ] Firebase configurato
- [ ] receipt-processor.js in esecuzione
- [ ] Cliente può scansionare QR code

---

**Versione**: 1.0  
**Data**: 18/07/2026  
**Stato**: ✅ Pronto per produzione
