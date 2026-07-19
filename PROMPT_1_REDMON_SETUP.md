# 🖨️ PROMPT 1: Stampante Virtuale con RedMon

**Obiettivo:** Installare e configurare RedMon su Windows per intercettare i lavori di stampa e inviarli a un programma Node.js invece che a una stampante fisica.

---

## 📋 Prerequisiti

- **Windows 7+** (testato su Windows 10/11)
- **Node.js 16+** installato
- **Accesso amministratore** al PC Windows
- **Stampante Epson** collegata (per test finale, opzionale)

---

## 🔧 Step 1: Installare RedMon

### Opzione A: Download Diretto (Consigliato)

1. Scarica il fork compatibile di RedMon:
   ```
   https://github.com/jonasoberschweiber/redmon/releases
   ```
   Scarica il file `.exe` più recente (es. `redmon-1.9.0.exe`)

2. Esegui l'installer con **diritti amministratore**
   - Accetta i termini di licenza
   - Scegli la cartella di installazione (default: `C:\Program Files\RedMon`)
   - Completa l'installazione

3. Verifica l'installazione:
   ```
   C:\Program Files\RedMon\redmon.exe --version
   ```
   Dovrebbe stampare la versione.

### Opzione B: Installazione Manuale (Se l'installer non funziona)

1. Scarica il file ZIP da GitHub
2. Estrai in `C:\Program Files\RedMon`
3. Apri PowerShell come amministratore e esegui:
   ```powershell
   cd "C:\Program Files\RedMon"
   .\redmon.exe --install
   ```

---

## 🖨️ Step 2: Creare una Porta Virtuale RedMon

### Via Pannello di Controllo (Metodo Grafico)

1. Apri **Pannello di Controllo** → **Dispositivi e stampanti**
2. Clicca **Aggiungi stampante**
3. Scegli **Aggiungi una stampante locale**
4. Seleziona **Crea una nuova porta** → Tipo: **RedMon Port Monitor**
5. Assegna un nome alla porta (es. `REDMON_CAPTURE`)
6. Clicca **Avanti**

### Via PowerShell (Metodo Automatico - Consigliato)

Esegui come amministratore:

```powershell
# Aggiungi la porta RedMon
Add-PrinterPort -Name "REDMON_CAPTURE" -PrinterHostAddress "127.0.0.1" -PortNumber 9100

# Verifica
Get-PrinterPort -Name "REDMON_CAPTURE"
```

Se il comando non funziona, usa questo script alternativo:

```powershell
# Registra il port monitor di RedMon nel registro di Windows
$regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors\RedMon Port Monitor"
if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
    New-ItemProperty -Path $regPath -Name "Driver" -Value "redmon.dll" -Force | Out-Null
}

Write-Host "RedMon Port Monitor registrato"
```

---

## 🖨️ Step 3: Installare il Driver "Generic / Text Only"

1. Apri **Pannello di Controllo** → **Dispositivi e stampanti**
2. Clicca **Aggiungi stampante**
3. Scegli **Aggiungi una stampante locale**
4. Seleziona la porta **REDMON_CAPTURE** creata al Step 2
5. Scegli il driver: **Generic / Text Only**
   - Se non lo trovi, clicca "Sfoglia" e cerca nella lista dei driver Windows
   - Alternativa: Scarica da Microsoft: https://support.microsoft.com/en-us/help/4015402
6. Assegna un nome alla stampante (es. `CAPTURE_PRINTER`)
7. Completa l'installazione

### Verifica

```powershell
Get-Printer -Name "CAPTURE_PRINTER"
```

Dovrebbe mostrare i dettagli della stampante.

---

## 🔌 Step 4: Configurare RedMon per Passare il Lavoro a Node.js

### Configurazione della Porta RedMon

1. Apri **Pannello di Controllo** → **Dispositivi e stampanti**
2. Clicca con tasto destro su **CAPTURE_PRINTER** → **Proprietà stampante**
3. Vai alla scheda **Porte**
4. Seleziona **REDMON_CAPTURE** e clicca **Configura porta**
5. Nella finestra RedMon, configura:
   - **Output**: `Program` (non "File")
   - **Program**: `C:\path\to\capture-service.js` (il nostro programma Node.js)
   - **Arguments**: (lascia vuoto per ora)
   - **Run in background**: ✓ (spunta)
   - **Wait for program to terminate**: ✓ (spunta)

6. Clicca **OK** e **Applica**

---

## 💻 Step 5: Creare il Servizio Node.js di Cattura

Crea il file `capture-service.js` nella cartella del progetto:

```javascript
/**
 * Servizio di Cattura Scontrini da Stampante Virtuale RedMon
 * Riceve il testo grezzo dallo spooler di stampa Windows
 * Salva su file con timestamp nel nome
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configurazione
const CAPTURE_DIR = path.join(__dirname, 'captured_receipts');
const LOG_FILE = path.join(__dirname, 'capture.log');

// Crea la cartella di cattura se non esiste
if (!fs.existsSync(CAPTURE_DIR)) {
    fs.mkdirSync(CAPTURE_DIR, { recursive: true });
}

// Funzione di logging
function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(logMessage);
    fs.appendFileSync(LOG_FILE, logMessage);
}

// Leggi da stdin (il testo della stampa)
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

let receiptText = '';

rl.on('line', (line) => {
    receiptText += line + '\n';
});

rl.on('close', () => {
    if (receiptText.trim().length === 0) {
        log('⚠️  Nessun testo ricevuto dallo spooler');
        process.exit(0);
    }

    // Genera un ID univoco per lo scontrino
    const timestamp = new Date();
    const receiptId = `receipt_${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, '0')}${String(timestamp.getDate()).padStart(2, '0')}_${String(timestamp.getHours()).padStart(2, '0')}${String(timestamp.getMinutes()).padStart(2, '0')}${String(timestamp.getSeconds()).padStart(2, '0')}_${Math.random().toString(36).substr(2, 9)}`;

    // Salva il file
    const filePath = path.join(CAPTURE_DIR, `${receiptId}.txt`);
    fs.writeFileSync(filePath, receiptText);

    log(`✅ Scontrino catturato: ${receiptId}`);
    log(`📄 File salvato: ${filePath}`);
    log(`📊 Lunghezza: ${receiptText.length} caratteri`);
    log(`---`);

    process.exit(0);
});

// Gestisci errori
process.on('error', (err) => {
    log(`❌ Errore: ${err.message}`);
    process.exit(1);
});

// Timeout di sicurezza (5 secondi)
setTimeout(() => {
    if (receiptText.trim().length > 0) {
        log(`⏱️  Timeout raggiunto, elaboro il testo ricevuto`);
        rl.close();
    }
}, 5000);
```

### Salva il file

Salva questo codice come `/Users/ettoretitotto/Desktop/PROGRAMMI/Fiscal/capture-service.js`

---

## 🧪 Step 6: Test con Blocco Note

### Test 1: Verifica che la stampante sia disponibile

```powershell
# Stampa un documento di prova
notepad.exe
```

1. Apri Blocco Note
2. Scrivi un testo di prova:
   ```
   NEGOZIO TEST
   Via Roma 123
   
   ARTICOLI:
   Caffè x1          €2.50
   Cornetto x1       €1.50
   
   TOTALE            €4.00
   
   Grazie!
   ```

3. Vai a **File** → **Stampa**
4. Seleziona la stampante **CAPTURE_PRINTER**
5. Clicca **Stampa**

### Test 2: Verifica il file catturato

Apri PowerShell e controlla:

```powershell
# Vai alla cartella del progetto
cd C:\path\to\Fiscal

# Elenca i file catturati
ls captured_receipts\

# Leggi il contenuto dell'ultimo file
Get-Content (ls captured_receipts\ | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
```

Dovrebbe mostrare il testo che hai stampato da Blocco Note.

### Test 3: Verifica il log

```powershell
# Leggi il log di cattura
Get-Content capture.log -Tail 20
```

Dovrebbe mostrare qualcosa come:
```
[2026-07-18T10:32:00.000Z] ✅ Scontrino catturato: receipt_20260718_103200_abc123def
[2026-07-18T10:32:00.100Z] 📄 File salvato: C:\path\to\Fiscal\captured_receipts\receipt_20260718_103200_abc123def.txt
[2026-07-18T10:32:00.100Z] 📊 Lunghezza: 156 caratteri
```

---

## 🐛 Troubleshooting

### Problema: "RedMon Port Monitor non trovato"

**Soluzione:**
1. Verifica che RedMon sia installato correttamente:
   ```powershell
   ls "C:\Program Files\RedMon"
   ```
2. Se la cartella non esiste, reinstalla RedMon
3. Riavvia il PC dopo l'installazione

### Problema: "Stampante non stampa, nessun file creato"

**Soluzione:**
1. Verifica che il percorso di `capture-service.js` sia corretto nella configurazione RedMon
2. Controlla che Node.js sia nel PATH:
   ```powershell
   node --version
   ```
3. Prova a eseguire manualmente il servizio:
   ```powershell
   echo "TEST" | node capture-service.js
   ```

### Problema: "Errore di permessi nella cartella captured_receipts"

**Soluzione:**
1. Crea manualmente la cartella:
   ```powershell
   mkdir captured_receipts
   ```
2. Assegna permessi di scrittura:
   ```powershell
   icacls captured_receipts /grant:r "$env:USERNAME`:F"
   ```

### Problema: "Il file capture.log non viene creato"

**Soluzione:**
1. Verifica che il percorso sia scrivibile:
   ```powershell
   Test-Path "C:\path\to\Fiscal"
   ```
2. Crea il file manualmente:
   ```powershell
   "" | Out-File capture.log
   ```

---

## ✅ Checklist di Completamento

- [ ] RedMon installato e verificato
- [ ] Porta REDMON_CAPTURE creata
- [ ] Stampante CAPTURE_PRINTER installata con driver "Generic / Text Only"
- [ ] File `capture-service.js` creato e salvato
- [ ] Test con Blocco Note completato
- [ ] File catturato trovato in `captured_receipts/`
- [ ] Log di cattura visibile in `capture.log`

---

## 📝 Note Importanti

1. **Il servizio gira in background**: Ogni volta che stampi su CAPTURE_PRINTER, il testo viene catturato automaticamente
2. **Nessuna stampa fisica**: Con il driver "Generic / Text Only", il testo non va alla stampante fisica (è il comportamento desiderato)
3. **File di log**: Utile per debug quando sei in negozio
4. **Timestamp nel nome file**: Permette di tracciare l'ordine di cattura

---

## 🚀 Prossimo Step

Una volta che il test con Blocco Note funziona:
1. Testa con un vero gestionale di cassa (se disponibile)
2. Procedi con **Prompt 2: Normalizzatore dello Scontrino**

Fammi sapere quando il test è completato! 🎉
