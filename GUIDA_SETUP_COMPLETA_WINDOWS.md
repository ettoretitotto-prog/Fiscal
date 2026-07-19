# 🖨️ Guida Completa: Setup su PC Windows con RedMon + Test Firebase

Questa guida spiega **tutto** quello che devi fare sul PC Windows di test per verificare la catena completa:

```
Blocco Note → Stampa su "CAPTURE_PRINTER" → RedMon intercetta →
capture-service.js salva il testo → receipt-processor.js lo rileva →
normalizzazione → scrittura diretta su Firebase Realtime Database
```

**Importante — chiarimento architetturale:**
`receipt-processor.js` è un **programma locale** che gira sul PC Windows del cassiere. Usa il Firebase Admin SDK con `serviceAccountKey.json` per scrivere **direttamente** sul Realtime Database via rete. Non è un servizio "hosted": non serve alcun deploy di Firebase Hosting per farlo funzionare. In questa guida non toccheremo `firebase.json` né le regole del database.

La macchina di test ha una stampante **Epson A4 normale (non termica)**, usata solo come stampante di sistema esistente: NON verrà usata per il test, perché la stampante coinvolta è una **stampante virtuale** (`CAPTURE_PRINTER`) che intercetta il testo invece di stamparlo davvero.

---

## 📋 Prerequisiti

- Windows 10/11
- **Accesso amministratore** al PC (necessario per installare RedMon, creare porte, installare driver stampante)
- **Node.js 16+** installato e nel PATH (verifica con `node --version` e `npm --version` da PowerShell)
- Il progetto Fiscal copiato sul PC Windows, es. in `C:\Fiscal` (puoi copiarlo via chiavetta USB, rete, o `git clone`/zip)
- File `serviceAccountKey.json` presente nella cartella del progetto (contiene le credenziali Firebase Admin — **non condividerlo, non committarlo su git pubblici**)
- File `config.json` presente e configurato (contiene `register_id`, `databaseURL`, ecc.)

### Verifica Node.js

Apri **PowerShell** (non serve amministratore per questo) ed esegui:

```powershell
node --version
npm --version
```

Se non sono installati, scarica Node.js LTS da https://nodejs.org e installa con le opzioni di default (spunta "Add to PATH").

### Installa le dipendenze del progetto

Dalla cartella del progetto:

```powershell
cd C:\Fiscal
npm install
```

Questo installa `firebase-admin` e le altre dipendenze necessarie a `receipt-processor.js`.

---

## 🔧 STEP 1 — Installare RedMon

RedMon è un "port monitor" che permette a una stampante virtuale di Windows di inviare il flusso di stampa a un programma esterno (nel nostro caso `capture-service.js`) invece che a una stampante fisica.

**⚠️ Richiede diritti amministratore.**

1. Scarica il fork compatibile di RedMon:
   ```
   https://github.com/jonasoberschweiber/redmon/releases
   ```
   Prendi il file `.exe` più recente (es. `redmon-1.9.0.exe`)

2. **Click destro → "Esegui come amministratore"** sull'installer
   - Accetta la licenza
   - Lascia la cartella di default: `C:\Program Files\RedMon`
   - Completa l'installazione

3. Verifica che l'installazione sia andata a buon fine:
   ```powershell
   Test-Path "C:\Program Files\RedMon\redmon.exe"
   ```
   Deve restituire `True`.

Se l'installer grafico fallisce, usa l'installazione manuale via PowerShell **come amministratore**:
```powershell
cd "C:\Program Files\RedMon"
.\redmon.exe --install
```

---

## 🔌 STEP 2 — Creare la porta virtuale RedMon

**Nome esatto da usare: `REDMON_CAPTURE`**

Perché questo nome specifico? Perché tutta la documentazione di progetto e le istruzioni di troubleshooting fanno riferimento a `REDMON_CAPTURE` come identificatore della porta. Usare un nome diverso non romperà nulla tecnicamente, ma **dovrai ricordarti di sostituirlo ovunque** nei passi successivi — per evitare confusione, usa esattamente questo nome.

**⚠️ Richiede diritti amministratore** (apri il Pannello di Controllo/le finestre seguenti con un utente amministratore).

**⚠️ Nota importante:** la porta `REDMON_CAPTURE` deve essere creata esplicitamente come **"Redmon Port Monitor"**. Comandi PowerShell come `Add-PrinterPort` creano solo porte TCP/IP standard, che NON vengono intercettate da RedMon e quindi non eseguiranno `capture-service.js`. L'unico modo corretto per creare la porta è il metodo grafico seguente.

### Metodo grafico (unico metodo corretto)

1. **Pannello di Controllo → Dispositivi e stampanti**

2. Clicca **Aggiungi stampante** (in alto)
3. Se Windows non trova stampanti automaticamente, scegli **"La stampante desiderata non è nell'elenco"**
4. Scegli **"Aggiungi una stampante locale con impostazioni manuali"**
5. Scegli **"Crea una nuova porta"** → nel menu a tendina scegli **"Redmon Port Monitor"** (deve apparire ora che RedMon è installato — se non appare, riavvia il PC dopo l'installazione di RedMon e riprova)
6. Assegna alla porta il nome **`REDMON_CAPTURE`**
7. Clicca **Avanti**

A questo punto Windows ti chiederà anche il driver: vai allo Step 3 prima di completare la procedura (puoi continuare dalla stessa finestra).

---

## 🖨️ STEP 3 — Installare la stampante virtuale con driver "Generic / Text Only"

**Nome driver esatto: `Generic / Text Only`**

Questo driver è fondamentale: NON stampa in un formato grafico/PDF, ma invia il testo **in chiaro** (ASCII/testo semplice) al programma collegato alla porta. È l'unico driver che garantisce che `capture-service.js` riceva testo leggibile via stdin, esattamente come farebbe una stampante termica da scontrini.

1. Se stai continuando dalla finestra dello Step 2, ti verrà chiesto il produttore/modello: scegli **Produttore: "Generic"** → **Modello: "Generic / Text Only"**
   - Se non lo trovi nella lista, clicca **"Windows Update"** nella finestra di selezione driver per scaricare driver aggiuntivi, oppure scaricalo da Microsoft: https://support.microsoft.com/en-us/help/4015402
2. Assegna alla stampante il nome esatto: **`CAPTURE_PRINTER`**
   - Questo nome è usato sia in `receipt-processor.js` (variabile `CONFIG.printerName`) sia in tutti i test — mantienilo identico.
3. Alla domanda "Condividi stampante": scegli **"Non condividere questa stampante"**
4. Completa l'installazione (puoi saltare la stampa di pagina di prova, oppure stamparla per verificare che la stampante esista — verrà catturata da RedMon una volta configurato lo Step 4)

### Verifica

```powershell
Get-Printer -Name "CAPTURE_PRINTER"
```

Deve mostrare i dettagli della stampante appena creata.

---

## ⚙️ STEP 4 — Collegare la porta RedMon al programma Node.js

Questo è il passaggio **più critico e più fragile**: qui diciamo a RedMon di lanciare `capture-service.js` ogni volta che qualcosa viene stampato su `CAPTURE_PRINTER`.

**⚠️ Richiede diritti amministratore** per modificare le proprietà della stampante.

1. **Pannello di Controllo → Dispositivi e stampanti**
2. Click destro su **CAPTURE_PRINTER** → **Proprietà stampante**
3. Vai alla scheda **Porte**
4. Seleziona la riga **REDMON_CAPTURE** → clicca **Configura porta**
5. Si apre la finestra di configurazione RedMon. Compila esattamente così:

   | Campo | Valore |
   |---|---|
   | **Output** | `Program` (NON "File" — se selezioni "File" RedMon salverà un file grezzo invece di eseguire lo script, e il nostro sistema non lo vedrà) |
   | **Program** | Path **completo** dell'eseguibile Node.js seguito dal path completo dello script. Esempio: `C:\Program Files\nodejs\node.exe` |
   | **Arguments** | `C:\Fiscal\capture-service.js` (path assoluto, adatta `C:\Fiscal` alla cartella reale dove hai copiato il progetto) |
   | **Run in background** | ✅ Spuntato |
   | **Wait for program to terminate** | ✅ Spuntato (fondamentale: se non spuntato, lo spooler considera il lavoro di stampa "completato" prima che lo script finisca di leggere e salvare il testo, e in alcuni casi il testo arriva troncato o non arriva) |

   > **Nota tecnica sul campo Program/Arguments:** alcune versioni di RedMon hanno un solo campo "Program" dove va scritto l'intero comando (`"C:\Program Files\nodejs\node.exe" "C:\Fiscal\capture-service.js"`), altre lo separano in due campi come nella tabella sopra. Se vedi un solo campo, scrivi l'intero comando tra virgolette come mostrato.

   Per trovare il path esatto di `node.exe`:
   ```powershell
   (Get-Command node).Source
   ```

6. Clicca **OK**, poi **Applica**, poi chiudi le proprietà della stampante.

### Perché "Wait for program to terminate" è così importante

Lo script `capture-service.js` legge da `stdin` riga per riga e ha un **timeout di sicurezza di 5 secondi**: se lo spooler chiude la connessione prima che lo script abbia finito di leggere e scrivere il file, rischi di perdere lo scontrino o di catturarlo incompleto. Con "Wait for program to terminate" spuntato, Windows aspetta che `capture-service.js` chiami `process.exit()` prima di considerare il lavoro di stampa concluso.

---

## 🚧 Troubleshooting dei problemi più comuni

### ❌ "Redmon Port Monitor" non appare nella lista dei port monitor

- RedMon non è installato correttamente, oppure Windows non ha ancora registrato il monitor nel registro.
- **Soluzione**: riavvia il PC dopo aver installato RedMon (necessario perché lo spooler di stampa di Windows carica i port monitor all'avvio del servizio `Print Spooler`, non a runtime).
- In alternativa, riavvia solo il servizio Spooler senza riavviare tutto il PC (**come amministratore**):
  ```powershell
  Restart-Service -Name Spooler -Force
  ```

### ❌ Lo spooler blocca l'esecuzione di `node.exe` (nessun file creato, nessun errore visibile)

Questo capita quando:
1. **Il servizio Spooler non ha i permessi per eseguire lo script.** Verifica manualmente che lo script funzioni fuori da RedMon:
   ```powershell
   cd C:\Fiscal
   echo "TEST STAMPA" | node capture-service.js
   ls captured_receipts\
   ```
   Se questo funziona ma la stampa reale no, il problema è nella configurazione RedMon (Step 4), non nello script.

2. **Path con spazi non gestiti correttamente.** Se il path del progetto contiene spazi (es. `C:\Users\Nome Utente\Fiscal`), assicurati che sia tutto tra virgolette nel campo "Program"/"Arguments" di RedMon.

3. **Antivirus o Windows Defender blocca l'esecuzione automatica di `node.exe` lanciato dal servizio Spooler.** Controlla i log di Windows Defender o aggiungi un'eccezione temporanea per `node.exe` durante il test.

4. **Il servizio Spooler gira con un utente/permessi diversi da quello con cui hai testato manualmente.** Il servizio Spooler di Windows normalmente gira come `SYSTEM` o `LocalSystem`, che potrebbe non avere lo stesso PATH configurato per il tuo utente. Se `node` non è nel PATH di sistema (solo nel PATH utente), usa sempre il **path assoluto completo** di `node.exe` nel campo Program (mai solo `node`).

### ❌ La porta non appare disponibile / "Access is denied" durante la creazione della porta

- Devi eseguire PowerShell **come amministratore** (click destro sull'icona → "Esegui come amministratore"). Questo è quasi sempre la causa.
- Verifica di essere amministratore con:
  ```powershell
  ([Security.Principal.WindowsIdentity]::GetCurrent()).Groups -match "S-1-5-32-544"
  ```
  Se non stampa nulla, non sei amministratore nella sessione corrente.

### ❌ Il file viene creato ma è vuoto o troncato

- Controlla che "Wait for program to terminate" sia spuntato (vedi Step 4).
- Verifica che il driver installato sia davvero "Generic / Text Only" e non un driver PostScript/PCL (che invierebbe dati binari, non testo).

### ❌ "node: command not found" quando RedMon tenta di eseguire lo script

- Non usare `node` da solo nel campo Program: usa sempre il path assoluto, es. `C:\Program Files\nodejs\node.exe`.

---

## ▶️ STEP 5 — Avviare il Receipt Processor

Con RedMon configurato, ora devi avviare il servizio che monitora la cartella `captured_receipts/`, normalizza il testo e lo invia a Firebase.

Apri PowerShell (non serve amministratore per questo passo) nella cartella del progetto:

```powershell
cd C:\Fiscal
node receipt-processor.js
```

Dovresti vedere in console:

```
[2026-...] [START] === RECEIPT PROCESSOR AVVIATO ===
[2026-...] [WATCH] Inizio monitoraggio cartella di cattura

🧾 SCONTRINO DIGITALE - SYSTEM TRAY
=====================================
Comandi disponibili:
  p - Stampa ultimo scontrino
  s - Stato
  q - Esci
=====================================
```

**Lascia questa finestra di PowerShell aperta**: è il processo che deve rimanere attivo per catturare e inviare gli scontrini. Se la chiudi, il monitoraggio si interrompe.

---

## ✅ STEP 6 — Test di verifica end-to-end (passo-passo)

Ora che tutto è configurato e `receipt-processor.js` è in esecuzione, verifica la catena completa.

### 1. Stampa un documento di prova da Blocco Note

```powershell
notepad.exe
```

Scrivi un testo tipo:
```
NEGOZIO TEST
Via Roma 123

ARTICOLI:
Caffè x1          €2.50
Cornetto x1       €1.50

TOTALE            €4.00

Grazie!
```

**File → Stampa** (o `Ctrl+P`) → seleziona la stampante **CAPTURE_PRINTER** → **Stampa**.

### 2. Controlla che il file sia stato catturato

Apri una **nuova** finestra PowerShell (lascia l'altra con `receipt-processor.js` in esecuzione) e verifica:

```powershell
cd C:\Fiscal
ls captured_receipts\ | Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

Dovresti vedere un file `.txt` e un file `.json` appena creati.

Leggi il contenuto:
```powershell
Get-Content (ls captured_receipts\*.txt | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
```

### 3. Controlla il log di cattura (`capture.log`)

```powershell
Get-Content C:\Fiscal\capture.log -Tail 10
```

Dovresti vedere righe come:
```
[2026-...] [SUCCESS] ✅ Scontrino catturato con successo
[2026-...] [SUCCESS]    Receipt ID: receipt_20260719_...
```

### 4. Torna alla finestra dove gira `receipt-processor.js`

Entro ~2 secondi (intervallo di polling `watchInterval`), dovresti vedere apparire nella console:

```
[...] [WATCH] Nuovo file rilevato: receipt_20260719_....txt
[...] [PROCESS] Elaborazione file: receipt_20260719_....txt
[...] [PROCESS] Ricevuta normalizzata: totale €4.00
[...] [SUCCESS] ✅ Ricevuta inviata a Firebase: cassa-01-negozio-test_...
[...] [PRINT] 🖨️  Finestra di stampa aperta (60 secondi)
```

Se invece vedi `[QUEUE] 📦 Ricevuta messa in coda offline`, significa che l'invio a Firebase è fallito (verifica connessione internet e `serviceAccountKey.json`) ma il dato è salvato in locale in `offline_queue.json` e verrà ritentato.

### 5. Controlla il log dedicato a Firebase

```powershell
Get-Content C:\Fiscal\firebase-sender.log -Tail 10
```

Dovresti trovare una riga con `success: true` e il `receipt_id` generato.

### 6. Verifica su Firebase Console (verifica finale)

1. Vai su https://console.firebase.google.com
2. Seleziona il progetto **`fiscal-9a0c8`**
3. Vai su **Realtime Database** nel menu laterale
4. Naviga nell'albero dei dati: dovresti trovare un nodo con il `register_id` configurato (`cassa-01-negozio-test` di default in `config.json`) e sotto una entry con il receipt appena inviato, con i campi normalizzati (`store_name`, `items`, `total`, `timestamp`, ecc.)

Se vedi il tuo scontrino di test lì, **il test end-to-end è riuscito**: stampa virtuale → cattura → normalizzazione → scrittura su Firebase funziona correttamente sul PC Windows.

---

## 📝 Riepilogo nomi e valori esatti da usare (da tenere a portata di mano)

| Elemento | Valore esatto |
|---|---|
| Nome porta RedMon | `REDMON_CAPTURE` |
| Nome stampante virtuale | `CAPTURE_PRINTER` |
| Driver stampante | `Generic / Text Only` |
| Program (in configurazione porta) | path completo di `node.exe`, es. `C:\Program Files\nodejs\node.exe` |
| Arguments (in configurazione porta) | path completo di `capture-service.js`, es. `C:\Fiscal\capture-service.js` |
| Cartella cattura scontrini | `C:\Fiscal\captured_receipts\` |
| Log cattura | `C:\Fiscal\capture.log` |
| Log processor | `C:\Fiscal\receipt-processor.log` |
| Log invio Firebase | `C:\Fiscal\firebase-sender.log` |
| Progetto Firebase | `fiscal-9a0c8` |

---

## 🚀 Prossimi passi (fuori scope per oggi)

- Non è richiesto alcun deploy di Firebase Hosting per questo test: `receipt-processor.js` scrive direttamente sul Realtime Database via Admin SDK.
- Il deploy di Firebase Hosting (pagine `index.html`/`cassa.html`) riguarda un'altra parte del progetto e non è necessario per validare questa catena di cattura/normalizzazione/invio.
- Una volta validato il test con Blocco Note, si potrà passare a testare con un vero gestionale di cassa.
