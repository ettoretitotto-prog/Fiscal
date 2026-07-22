#!/usr/bin/env node

/**
 * Servizio di Cattura Scontrini da Stampante Virtuale "Local Port" nativa Windows
 * 
 * Alternativa a capture-service.js (che usa RedMon + stdin).
 * Questo script NON sostituisce capture-service.js: gira in parallelo,
 * come processo permanente (non spawnato una volta per stampa).
 * 
 * Windows scrive il testo grezzo direttamente nel file usato come "nome porta"
 * ogni volta che qualcuno stampa sulla stampante collegata a quella Local Port.
 * Questo script tiene d'occhio quel file e, quando smette di essere scritto
 * (debounce), lo elabora esattamente come farebbe capture-service.js.
 * 
 * Uso:
 *   node localport-watcher.js
 * 
 * Configurazione Windows richiesta (fatta una volta, in PowerShell):
 *   Add-PrinterPort -Name "C:\FiscalPrintLocalPort\output.prn"
 *   Add-Printer -Name "Fiscal LocalPort Printer" -DriverName "Generic / Text Only" -PortName "C:\FiscalPrintLocalPort\output.prn"
 * 
 * Nessuna configurazione di "programma" è necessaria: Windows scrive da solo
 * nel file, non serve il campo "Redirect this port to the program" di RedMon.
 */

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// ============================================================================
// CONFIGURAZIONE
// ============================================================================

// Stessa cartella di output usata da capture-service.js, così il resto
// della pipeline (parser, QR code, sito web) non deve sapere da dove arriva
const CAPTURE_DIR = path.join(__dirname, 'captured_receipts');
const LOG_FILE = path.join(__dirname, 'localport-watcher.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB

// Il file che Windows scrive quando si stampa sulla "Fiscal LocalPort Printer"
const WATCHED_FILE = 'C:\\FiscalPrintLocalPort\\output.prn';

// Tempo di attesa senza modifiche al file prima di considerarlo "finito di scrivere"
const DEBOUNCE_MS = 500;

// Stessa codifica sorgente usata da capture-service.js
const SOURCE_ENCODING = 'win1252';

// ============================================================================
// UTILITY (identiche a capture-service.js, duplicate volutamente per non
// creare dipendenze tra i due file e non rischiare di rompere quello esistente)
// ============================================================================

function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;

    console.log(logMessage);

    try {
        if (fs.existsSync(LOG_FILE)) {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size > MAX_LOG_SIZE) {
                const backupFile = `${LOG_FILE}.${Date.now()}.bak`;
                fs.renameSync(LOG_FILE, backupFile);
                log(`Log rotato: ${backupFile}`, 'ROTATE');
            }
        }
        fs.appendFileSync(LOG_FILE, logMessage + '\n');
    } catch (err) {
        console.error(`Errore durante il logging: ${err.message}`);
    }
}

function generateReceiptId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 9);

    return `receipt_${year}${month}${day}_${hours}${minutes}${seconds}_${random}`;
}

function cleanText(text) {
    let cleaned = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');
    cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');
    cleaned = cleaned.trim();
    return cleaned;
}

function ensureCaptureDir() {
    try {
        if (!fs.existsSync(CAPTURE_DIR)) {
            fs.mkdirSync(CAPTURE_DIR, { recursive: true });
            log(`Cartella di cattura creata: ${CAPTURE_DIR}`, 'INIT');
        }
    } catch (err) {
        log(`Errore nella creazione della cartella: ${err.message}`, 'ERROR');
        process.exit(1);
    }
}

function saveReceipt(receiptId, text) {
    const filePath = path.join(CAPTURE_DIR, `${receiptId}.txt`);
    fs.writeFileSync(filePath, text, 'utf8');
    return filePath;
}

function saveMetadata(receiptId, text, filePath) {
    try {
        const metadata = {
            receipt_id: receiptId,
            timestamp: new Date().toISOString(),
            file_path: filePath,
            text_length: text.length,
            line_count: text.split('\n').length,
            status: 'captured',
            source: 'localport' // utile per distinguere in debug dai receipt di RedMon
        };
        const metadataPath = path.join(CAPTURE_DIR, `${receiptId}.json`);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
        return metadataPath;
    } catch (err) {
        log(`Errore nel salvataggio dei metadati: ${err.message}`, 'ERROR');
    }
}

// ============================================================================
// ELABORAZIONE DI UN RECEIPT (identica a capture-service.js)
// ============================================================================

function processReceipt(rawBuffer) {
    const lineCount = rawBuffer.toString('binary').split('\n').length;

    let decodedText;
    try {
        decodedText = iconv.decode(rawBuffer, SOURCE_ENCODING);
    } catch (err) {
        log(`Errore nella decodifica (${SOURCE_ENCODING}), fallback a utf8: ${err.message}`, 'WARN');
        decodedText = rawBuffer.toString('utf8');
    }

    if (decodedText.trim().length === 0) {
        log(`Nessun testo utile nel file (vuoto)`, 'WARN');
        return;
    }

    const cleanedText = cleanText(decodedText);
    if (cleanedText.length === 0) {
        log(`Testo vuoto dopo la pulizia`, 'WARN');
        return;
    }

    const receiptId = generateReceiptId();
    const filePath = saveReceipt(receiptId, cleanedText);
    const metadataPath = saveMetadata(receiptId, cleanedText, filePath);

    log(`✅ Scontrino catturato con successo (Local Port)`, 'SUCCESS');
    log(`   Receipt ID: ${receiptId}`, 'SUCCESS');
    log(`   File: ${filePath}`, 'SUCCESS');
    log(`   Metadati: ${metadataPath}`, 'SUCCESS');
    log(`   Righe ricevute: ${lineCount}`, 'SUCCESS');
    log(`   Lunghezza testo: ${cleanedText.length} caratteri`, 'SUCCESS');
    log('='.repeat(80), 'SUCCESS');
}

// ============================================================================
// WATCHER CON DEBOUNCE
// ============================================================================
// Windows sovrascrive lo stesso file ad ogni stampa. Usiamo il polling della
// dimensione file per capire quando la scrittura è "ferma" da un po' (debounce),
// invece di reagire al primo evento (che potrebbe cogliere il file a metà scrittura).

let debounceTimer = null;
let lastSize = -1;
let processingLock = false;

function checkFileStable() {
    if (processingLock) return;

    try {
        if (!fs.existsSync(WATCHED_FILE)) return;

        const stats = fs.statSync(WATCHED_FILE);
        if (stats.size === 0) return;

        if (stats.size === lastSize) {
            // dimensione stabile da un ciclo: consideriamo la scrittura finita
            processingLock = true;
            try {
                const rawBuffer = fs.readFileSync(WATCHED_FILE);
                processReceipt(rawBuffer);
            } catch (err) {
                log(`Errore nella lettura/elaborazione del file: ${err.message}`, 'ERROR');
            } finally {
                // Svuota il file per non rielaborare lo stesso contenuto al giro dopo
                try {
                    fs.writeFileSync(WATCHED_FILE, '');
                } catch (err) {
                    log(`Impossibile svuotare il file dopo l'elaborazione: ${err.message}`, 'WARN');
                }
                lastSize = -1;
                processingLock = false;
            }
        } else {
            lastSize = stats.size;
        }
    } catch (err) {
        log(`Errore nel controllo del file: ${err.message}`, 'ERROR');
    }
}

function main() {
    log('='.repeat(80), 'START');
    log(`Servizio watcher Local Port avviato`, 'START');
    log(`File monitorato: ${WATCHED_FILE}`, 'START');
    log(`PID: ${process.pid}`, 'START');

    ensureCaptureDir();

    if (!fs.existsSync(WATCHED_FILE)) {
        log(`ATTENZIONE: il file ${WATCHED_FILE} non esiste ancora.`, 'WARN');
        log(`Verrà creato automaticamente da Windows alla prima stampa.`, 'WARN');
    }

    // Polling ogni 300ms: più affidabile di fs.watch su file di rete/porte stampante,
    // che su Windows a volte non emette eventi in modo consistente
    setInterval(checkFileStable, 300);
}

process.on('uncaughtException', (err) => {
    log(`Eccezione non gestita: ${err.message}`, 'FATAL');
    log(`Stack: ${err.stack}`, 'FATAL');
});

process.on('unhandledRejection', (reason) => {
    log(`Promise rejection non gestita: ${reason}`, 'FATAL');
});

main();
