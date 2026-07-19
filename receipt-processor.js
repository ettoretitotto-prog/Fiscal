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
    // Sotto questa lunghezza (caratteri, dopo trim) un file viene considerato
    // un comando di stampa (es. apertura cassetto) e non uno scontrino vero,
    // quindi viene ignorato senza normalizzazione/invio a Firebase.
    minReceiptLength: 20,
    logFile: './receipt-processor.log'
};

const processedFiles = new Set();
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
            
            // Individua eventuali file nuovi non ancora visti
            const newFiles = files.filter(f => !processedFiles.has(f));
            
            if (newFiles.length > 0) {
                newFiles.forEach(f => {
                    log(`Nuovo file rilevato: ${f}`, 'WATCH');
                    processedFiles.add(f);
                    const filePath = path.join(CONFIG.captureDir, f);
                    processReceiptFile(filePath).catch(err => {
                        log(`Errore elaborazione ${f}: ${err.message}`, 'ERROR');
                    });
                });
            }
            
        } catch (err) {
            log(`Errore monitoraggio: ${err.message}`, 'ERROR');
        }
    }, CONFIG.watchInterval);
}

// ============================================================================
// RECEIPT PROCESSING
// ============================================================================

async function processReceiptFile(filePath, rawTextArg, normalizedReceiptArg) {
    try {
        const rawText = rawTextArg !== undefined ? rawTextArg : fs.readFileSync(filePath, 'utf8');
        
        // File di comando (es. apertura cassetto) generati dal gestionale come
        // lavori di stampa separati: testo troppo corto per essere uno scontrino,
        // vengono ignorati silenziosamente senza normalizzazione/invio.
        if (rawText.trim().length < CONFIG.minReceiptLength) {
            log(`Ignorato file di comando/non scontrino (${rawText.trim().length} caratteri): ${path.basename(filePath)}`, 'SKIP');
            return;
        }
        
        log(`Elaborazione file: ${path.basename(filePath)}`, 'PROCESS');
        
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
