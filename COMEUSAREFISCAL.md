# 🧾 Come usare Fiscal

## Cosa serve

- Un PC Windows
- Un gestionale di cassa (es. https://scontrinoetico.it/) o anche solo il Blocco Note per testare

---

## ⚙️ Installazione (prima volta)

### 1. Scarica l'app

Scarica la cartella **Fiscal** da GitHub e mettila in `C:\`:
```
C:\Fiscal\
```

### 2. Copia il file serviceAccountKey.json

Il file `serviceAccountKey.json` **non viene scaricato da GitHub** per sicurezza. Chiedimelo e lo riceverai via email/messaggio.

Mettilo nella cartella:
```
C:\Fiscal\serviceAccountKey.json
```

### 3. Esegui il setup iniziale

**Click destro su `firstsetup.ps1`** → **"Esegui con PowerShell"**

Questo script fa tutto da solo:
- Installa Node.js (se manca)
- Crea la stampante virtuale "Fiscal LocalPort Printer"
- Installa le dipendenze necessarie

> ⚠️ **La prima volta ti chiederà i permessi di amministratore: clicca "Sì"**

---

## ▶️ Ogni volta che vuoi usare Fiscal

### 4. Avvia il servizio

**Doppio clic su `run.bat`**

Si aprono due finestre:
- **Fiscal Watcher** — cattura gli scontrini
- **Fiscal Processor** — normalizza e invia al telefono

> Tienile aperte finché usi la cassa.

### 5. Configura il gestionale

Nel tuo gestionale di cassa, imposta la stampante su:
```
Fiscal LocalPort Printer
```

### 6. Stampa uno scontrino di prova

Fai una stampa di prova dal gestionale (o dal Blocco Note).
Lo scontrino apparirà sul telefono collegato.

---

## ❓ Problemi?

- **"Non si apre firstsetup.ps1"** → Click destro → "Esegui con PowerShell"
- **"Node.js non trovato"** → firstsetup.ps1 lo installa da solo (riprova dopo il setup)
- **"Non arriva nulla al telefono"** → Controlla che `serviceAccountKey.json` sia nella cartella `C:\Fiscal`
- **"Errore stampante"** → Verifica di aver eseguito `firstsetup.ps1` come amministratore