#!/usr/bin/env node

/**
 * Receipt Processor - Servizio Integrato
 * Coordina: Cattura → Normalizza → Firebase + System Tray con stampa cartacea
 */

const fs = require('fs');
const path = require('path');
const normalizer = require('./receipt-normalizer');
const sender = require('./firebase-receipt-sender');

const CONFIG = {
    captureDir: './captured_receipts',
    printerName: 'CAPTURE_PRINTER',
    printWindowDuration: 60000,
    watchInterval: 2000,
    // Finestra di debounce: se arrivano più file .txt entro questo intervallo
    // vengono considerati parte dello stesso ordine/scontrino e aggregati
    // in un unico invio, invece di essere trattati come scontrini separati.
    batchDebounceMs: 3000,
    logFile: './receipt-processor.log'
};

const processedFiles = new Set();
let pendingBatchFiles = [];
let batchDebounceTimer = null;
let lastReceiptData = null;
let printWindowOpen = false;
let printWindowTimeout = null;


// ============================================================================
// LOGGING
// ============================================================================

function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
    try {
        fs.appendFileSync(CONFIG.logFile, logMessage + '\n');
    } catch (err) {
        console.error(`Errore logging: ${err.message}`);
    }
}

// ============================================================================
// FILE WATCHER
// ============================================================================

function watchCaptureDirectory() {
    log('Inizio monitoraggio cartella di cattura', 'WATCH');
    
    setInterval(() => {
        try {
            if (!fs.existsSync(CONFIG.captureDir)) {
                return;
            }
            
            const files = fs.readdirSync(CONFIG.captureDir)
                .filter(file => file.endsWith('.txt'))
                .sort();
            
            if (files.length === 0) {
                return;
            }
            
            // Individua eventuali file nuovi non ancora visti né già in coda
            const newFiles = files.filter(
                f => !processedFiles.has(f) && !pendingBatchFiles.includes(f)
            );
            
            if (newFiles.length > 0) {
                newFiles.forEach(f => {
                    log(`Nuovo file rilevato: ${f}`, 'WATCH');
                    pendingBatchFiles.push(f);
                });
                
                // Ogni volta che arriva un nuovo file, rinnoviamo il timer di debounce.
                // Il batch viene elaborato solo quando non arrivano nuovi file
                // per "batchDebounceMs" millisecondi: in questo modo tutti i file
                // generati da un singolo ordine (job di stampa spezzati da RedMon/
                // dal gestionale) vengono aggregati e trattati come un unico scontrino.
                if (batchDebounceTimer) {
                    clearTimeout(batchDebounceTimer);
                }
                batchDebounceTimer = setTimeout(() => {
                    processPendingBatch();
                }, CONFIG.batchDebounceMs);
            }
            
        } catch (err) {
            log(`Errore monitoraggio: ${err.message}`, 'ERROR');
        }
    }, CONFIG.watchInterval);
}

// ============================================================================
// RECEIPT PROCESSING
// ============================================================================

/**
 * Elabora il batch di file .txt accumulati nella finestra di debounce.
 * Sceglie il file "migliore" (testo non vuoto e totale valido) tra quelli
 * del batch e lo invia a Firebase; tutti gli altri vengono scartati ma
 * marcati come processati per evitare che vengano ritentati o rinviati.
 */
async function processPendingBatch() {
    const filesInBatch = pendingBatchFiles;
    pendingBatchFiles = [];
    batchDebounceTimer = null;
    
    if (filesInBatch.length === 0) {
        return;
    }
    
    if (filesInBatch.length > 1) {
        log(`Batch di ${filesInBatch.length} file rilevati nella stessa finestra temporale: ${filesInBatch.join(', ')}`, 'WATCH');
    }
    
    // Analizza ogni file del batch, marcandolo comunque come "processato"
    // in modo da non riconsiderarlo nei tick successivi.
    const candidates = [];
    for (const fileName of filesInBatch) {
        processedFiles.add(fileName);
        const filePath = path.join(CONFIG.captureDir, fileName);
        
        try {
            const rawText = fs.readFileSync(filePath, 'utf8');
            const normalizedReceipt = normalizer.normalize(rawText);
            
            const hasValidTotal = normalizedReceipt.total !== undefined
                && normalizedReceipt.total !== null
                && normalizedReceipt.total !== 'N/A'
                && !Number.isNaN(Number(normalizedReceipt.total));
            
            candidates.push({
                fileName,
                filePath,
                rawText,
                normalizedReceipt,
                hasValidTotal,
                textLength: rawText.trim().length
            });
        } catch (err) {
            log(`Errore lettura/normalizzazione file ${fileName}: ${err.message}`, 'ERROR');
        }
    }
    
    // Tra i candidati, preferiamo quelli con totale valido e testo non vuoto,
    // scegliendo il testo più "completo" (più lungo) in caso di più validi.
    const valid = candidates.filter(c => c.hasValidTotal && c.textLength > 0);
    
    let chosen = null;
    if (valid.length > 0) {
        chosen = valid.reduce((best, cur) => (cur.textLength > best.textLength ? cur : best));
    }
    
    if (candidates.length > 1) {
        const discarded = candidates.filter(c => c !== chosen);
        discarded.forEach(c => {
            log(`⚠️  File scartato (frammento incompleto/totale non valido): ${c.fileName}`, 'DISCARD');
        });
    }
    
    if (!chosen) {
        log(`⚠️  Nessun file valido nel batch (totale N/A o testo vuoto), nessun invio a Firebase`, 'DISCARD');
        return;
    }
    
    await processReceiptFile(chosen.filePath, chosen.rawText, chosen.normalizedReceipt);
}

async function processReceiptFile(filePath, rawTextArg, normalizedReceiptArg) {
    try {
        log(`Elaborazione file: ${path.basename(filePath)}`, 'PROCESS');
        
        const rawText = rawTextArg !== undefined ? rawTextArg : fs.readFileSync(filePath, 'utf8');
        const normalizedReceipt = normalizedReceiptArg !== undefined ? normalizedReceiptArg : normalizer.normalize(rawText);
        
        log(`Ricevuta normalizzata: totale €${normalizedReceipt.total || 'N/A'}`, 'PROCESS');
        
        const sendResult = await sender.sendReceipt(normalizedReceipt);
        
        if (sendResult.success) {
            // Nota: il log di successo con l'ID definitivo viene già emesso da
            // firebase-receipt-sender.js (sendWithRetry). Non lo ripetiamo qui
            // per evitare la doppia riga di log per lo stesso invio.
            log(`Elaborazione completata con successo`, 'PROCESS');
        } else if (sendResult.queued) {
            log(`📦 Ricevuta messa in coda offline`, 'QUEUE');
        } else if (sendResult.discarded) {
            log(`⚠️  Ricevuta scartata dal guardiano finale: ${sendResult.reason || ''}`, 'DISCARD');
        }
        
        lastReceiptData = {
            rawText,
            normalizedReceipt,
            timestamp: new Date().toISOString()
        };
        
        openPrintWindow();
        
    } catch (err) {
        log(`Errore elaborazione: ${err.message}`, 'ERROR');
    }
}


// ============================================================================
// PRINT WINDOW
// ============================================================================

function openPrintWindow() {
    if (printWindowOpen) {
        clearTimeout(printWindowTimeout);
    } else {
        printWindowOpen = true;
        log('🖨️  Finestra di stampa aperta (60 secondi)', 'PRINT');
    }
    
    printWindowTimeout = setTimeout(() => {
        closePrintWindow();
    }, CONFIG.printWindowDuration);
}

function closePrintWindow() {
    if (printWindowOpen) {
        printWindowOpen = false;
        log('🖨️  Finestra di stampa chiusa', 'PRINT');
    }
}

function printLastReceipt() {
    if (!lastReceiptData) {
        log('⚠️  Nessuna ricevuta da stampare', 'PRINT');
        return false;
    }
    
    if (!printWindowOpen) {
        log('⚠️  Finestra di stampa chiusa', 'PRINT');
        return false;
    }
    
    try {
        log(`Stampa ricevuta: ${lastReceiptData.timestamp}`, 'PRINT');
        
        // Stampa il testo grezzo
        const printData = lastReceiptData.rawText;
        const printCommand = `echo "${printData.replace(/"/g, '\\"')}" | print /d:"${CONFIG.printerName}"`;
        
        require('child_process').exec(printCommand, (err) => {
            if (err) {
                log(`Errore stampa: ${err.message}`, 'ERROR');
            } else {
                log(`✅ Ricevuta stampata su ${CONFIG.printerName}`, 'SUCCESS');
            }
        });
        
        closePrintWindow();
        return true;
        
    } catch (err) {
        log(`Errore stampa: ${err.message}`, 'ERROR');
        return false;
    }
}

// ============================================================================
// SYSTEM TRAY (Fallback senza librerie esterne)
// ============================================================================

function createSystemTrayIcon() {
    log('System Tray Icon creato (modalità console)', 'TRAY');
    
    // Modalità console per testing
    console.log('\n🧾 SCONTRINO DIGITALE - SYSTEM TRAY');
    console.log('=====================================');
    console.log('Comandi disponibili:');
    console.log('  p - Stampa ultimo scontrino');
    console.log('  s - Stato');
    console.log('  q - Esci');
    console.log('=====================================\n');
    
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const promptUser = () => {
        rl.question('> ', (input) => {
            switch (input.toLowerCase()) {
                case 'p':
                    printLastReceipt();
                    break;
                case 's':
                    console.log(`Stato: ${printWindowOpen ? '✅ Pronto' : '⏸️  Inattivo'}`);
                    break;
                case 'q':
                    log('Chiusura servizio', 'EXIT');
                    rl.close();
                    process.exit(0);
                    break;
                default:
                    console.log('Comando non riconosciuto');
            }
            promptUser();
        });
    };
    
    promptUser();
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
    log('=== RECEIPT PROCESSOR AVVIATO ===', 'START');
    
    // Crea cartella di cattura se non esiste
    if (!fs.existsSync(CONFIG.captureDir)) {
        fs.mkdirSync(CONFIG.captureDir, { recursive: true });
        log(`Cartella creata: ${CONFIG.captureDir}`, 'INIT');
    }
    
    // Avvia il monitoraggio
    watchCaptureDirectory();
    
    // Avvia il system tray
    createSystemTrayIcon();
}

// Gestisci errori non catturati
process.on('uncaughtException', (err) => {
    log(`Errore non catturato: ${err.message}`, 'FATAL');
    process.exit(1);
});

// Avvia il servizio
main();
