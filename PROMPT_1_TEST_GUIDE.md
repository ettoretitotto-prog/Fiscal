# 🧪 PROMPT 1: Guida di Test Pratica

Questo documento ti guida passo-passo nel testare il setup di RedMon + capture-service.js

---

## ✅ Pre-Test Checklist

Prima di iniziare, verifica che:

- [ ] RedMon è installato in `C:\Program Files\RedMon`
- [ ] La porta `REDMON_CAPTURE` è stata creata
- [ ] La stampante `CAPTURE_PRINTER` è installata con driver "Generic / Text Only"
- [ ] Il file `capture-service.js` è nella cartella del progetto
- [ ] Node.js è installato e nel PATH

### Verifica Node.js

Apri PowerShell e esegui:

```powershell
node --version
npm --version
```

Dovrebbe mostrare le versioni (es. `v18.0.0`).

---

## 🧪 Test 1: Verifica Manuale del Servizio

### Obiettivo
Testare che `capture-service.js` funziona correttamente quando riceve testo da stdin.

### Procedura

1. Apri PowerShell nella cartella del progetto:
   ```powershell
   cd C:\path\to\Fiscal
   ```

2. Esegui il servizio con un testo di prova:
   ```powershell
   echo "NEGOZIO TEST
   Via Roma 123
   
   Caffè x1          €2.50
   Cornetto x1       €1.50
   
   TOTALE            €4.00" | node capture-service.js
   ```

3. Verifica l'output:
   ```
   [2026-07-18T10:32:00.000Z] [START] ================================================================================
   [2026-07-18T10:32:00.000Z] [START] Servizio di cattura scontrini avviato
   [2026-07-18T10:32:00.000Z] [START] PID: 12345
   [2026-07-18T10:32:00.100Z] [SUCCESS] ✅ Scontrino catturato con successo
   [2026-07-18T10:32:00.100Z] [SUCCESS]    Receipt ID: receipt_20260718_103200_abc123def
   [2026-07-18T10:32:00.100Z] [SUCCESS]    File: C:\path\to\Fiscal\captured_receipts\receipt_20260718_103200_abc123def.txt
   ...
   ```

4. Verifica che il file sia stato creato:
   ```powershell
   ls captured_receipts\
   ```

   Dovrebbe mostrare un file `.txt` e un file `.json` con lo stesso nome.

5. Leggi il contenuto del file:
   ```powershell
   Get-Content captured_receipts\receipt_*.txt | Select-Object -First 20
   ```

### ✅ Successo
Se vedi il file creato e il log di successo, il servizio funziona correttamente.

### ❌ Troubleshooting

**Errore: "node: command not found"**
- Node.js non è nel PATH
- Soluzione: Reinstalla Node.js e assicurati di spuntare "Add to PATH" durante l'installazione

**Errore: "Nessun file creato"**
- Verifica che la cartella `captured_receipts` esista:
  ```powershell
  mkdir captured_receipts
  ```

**Errore: "Permesso negato"**
- La cartella non è scrivibile
- Soluzione:
  ```powershell
  icacls captured_receipts /grant:r "$env:USERNAME`:F"
  ```

---

## 🖨️ Test 2: Stampa da Blocco Note

### Obiettivo
Testare che RedMon intercetta correttamente il lavoro di stampa da Blocco Note.

### Procedura

1. **Apri Blocco Note:**
   ```powershell
   notepad.exe
   ```

2. **Scrivi un testo di prova:**
   ```
   NEGOZIO TEST
   Via Roma 123
   
   ARTICOLI:
   Caffè x1          €2.50
   Cornetto x1       €1.50
   Acqua x2          €1.00
   
   SUBTOTALE         €5.00
   IVA (10%)         €0.50
   
   TOTALE            €5.50
   
   Grazie per l'acquisto!
   ```

3. **Stampa il documento:**
   - Vai a **File** → **Stampa** (o premi `Ctrl+P`)
   - Seleziona la stampante **CAPTURE_PRINTER**
   - Clicca **Stampa**

4. **Verifica il file catturato:**
   ```powershell
   # Elenca i file catturati
   ls captured_receipts\ | Sort-Object LastWriteTime -Descending | Select-Object -First 1
   
   # Leggi il contenuto
   Get-Content (ls captured_receipts\ | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
   ```

5. **Verifica il log:**
   ```powershell
   Get-Content capture.log -Tail 10
   ```

### ✅ Successo
Se vedi il testo che hai stampato nel file catturato, RedMon funziona correttamente.

### ❌ Troubleshooting

**Problema: "Stampante non trovata"**
- Verifica che CAPTURE_PRINTER sia installata:
  ```powershell
  Get-Printer -Name "CAPTURE_PRINTER"
  ```
- Se non esiste, reinstallala seguendo il Step 3 di PROMPT_1_REDMON_SETUP.md

**Problema: "Nessun file creato dopo la stampa"**
- Verifica la configurazione di RedMon:
  1. Apri **Pannello di Controllo** → **Dispositivi e stampanti**
  2. Clicca destro su **CAPTURE_PRINTER** → **Proprietà stampante**
  3. Vai a **Porte** → Seleziona **REDMON_CAPTURE** → **Configura porta**
  4. Verifica che:
     - **Output**: `Program`
     - **Program**: `C:\path\to\capture-service.js` (percorso corretto)
     - **Run in background**: ✓
     - **Wait for program to terminate**: ✓

**Problema: "Il file è vuoto"**
- Il driver "Generic / Text Only" potrebbe non funzionare correttamente
- Soluzione: Prova a reinstallare il driver
  1. Apri **Pannello di Controllo** → **Dispositivi e stampanti**
  2. Clicca destro su **CAPTURE_PRINTER** → **Rimuovi dispositivo**
  3. Reinstalla seguendo il Step 3 di PROMPT_1_REDMON_SETUP.md

---

## 📊 Test 3: Verifica dei Metadati

### Obiettivo
Verificare che i metadati JSON vengono creati correttamente.

### Procedura

1. Stampa un documento (vedi Test 2)

2. Verifica che il file JSON sia stato creato:
   ```powershell
   ls captured_receipts\*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1
   ```

3. Leggi il contenuto del JSON:
   ```powershell
   Get-Content (ls captured_receipts\*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName | ConvertFrom-Json | Format-List
   ```

   Dovrebbe mostrare qualcosa come:
   ```
   receipt_id  : receipt_20260718_103200_abc123def
   timestamp   : 2026-07-18T10:32:00.000Z
   file_path   : C:\path\to\Fiscal\captured_receipts\receipt_20260718_103200_abc123def.txt
   text_length : 156
   line_count  : 12
   status      : captured
   ```

### ✅ Successo
Se il JSON contiene i metadati corretti, il servizio funziona perfettamente.

---

## 🔄 Test 4: Test di Stress (Multipli Scontrini)

### Obiettivo
Verificare che il servizio gestisce correttamente più scontrini consecutivi.

### Procedura

1. Stampa 5 documenti di prova da Blocco Note (vedi Test 2)

2. Verifica che tutti i file siano stati creati:
   ```powershell
   (ls captured_receipts\*.txt).Count
   ```

   Dovrebbe mostrare almeno 5.

3. Verifica che i file abbiano nomi univoci:
   ```powershell
   ls captured_receipts\*.txt | Select-Object Name
   ```

   Ogni file dovrebbe avere un nome diverso (con timestamp e random string diversi).

4. Verifica il log:
   ```powershell
   Get-Content capture.log | Select-String "SUCCESS" | Measure-Object
   ```

   Dovrebbe mostrare almeno 5 righe di successo.

### ✅ Successo
Se tutti i file sono stati creati con nomi univoci, il servizio gestisce correttamente i multipli scontrini.

---

## 📈 Test 5: Verifica delle Dimensioni del Log

### Obiettivo
Verificare che il log non cresce indefinitamente (rotazione automatica).

### Procedura

1. Stampa 100 documenti di prova (o esegui il servizio 100 volte)

2. Verifica la dimensione del log:
   ```powershell
   (Get-Item capture.log).Length / 1MB
   ```

   Dovrebbe essere < 10 MB (il limite di rotazione).

3. Verifica che il log sia stato ruotato:
   ```powershell
   ls capture.log*
   ```

   Se il log è stato ruotato, dovrebbe mostrare file `.bak` con timestamp.

### ✅ Successo
Se il log non supera 10 MB e viene ruotato automaticamente, il servizio gestisce correttamente la crescita del log.

---

## 🎯 Checklist di Completamento

Completa tutti i test prima di procedere con Prompt 2:

- [ ] Test 1: Verifica Manuale del Servizio ✅
- [ ] Test 2: Stampa da Blocco Note ✅
- [ ] Test 3: Verifica dei Metadati ✅
- [ ] Test 4: Test di Stress ✅
- [ ] Test 5: Verifica delle Dimensioni del Log ✅

---

## 📝 Note Importanti

1. **Percorsi Windows**: Usa sempre `C:\path\to\Fiscal` (non `/path/to/Fiscal`)
2. **PowerShell**: Esegui sempre come amministratore per operazioni di stampa
3. **Timestamp**: I file hanno timestamp nel nome per tracciare l'ordine di cattura
4. **Log**: Utile per debug quando sei in negozio (controlla `capture.log`)

---

## 🚀 Prossimo Step

Una volta che tutti i test passano:
1. Procedi con **Prompt 2: Normalizzatore dello Scontrino**
2. Il normalizzatore leggerà i file `.txt` creati da questo servizio

Fammi sapere quando i test sono completati! 🎉
