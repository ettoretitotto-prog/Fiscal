#!/usr/bin/env node

/**
 * Servizio di Cattura Scontrini da Stampante Virtuale RedMon
 * 
 * Riceve il testo grezzo dallo spooler di stampa Windows (via stdin)
 * Salva su file con timestamp nel nome
 * Logga tutte le operazioni per debug
 * 
 * Uso:
 *   echo "testo scontrino" | node capture-service.js
 *   
 * Configurazione RedMon:
 *   Output: Program
 *   Program: C:\path\to\capture-service.js
 *   Run in background: checked
 *   Wait for program to terminate: checked
 */

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// ============================================================================
// CONFIGURAZIONE
// ============================================================================

const CAPTURE_DIR = path.join(__dirname, 'captured_receipts');
const LOG_FILE = path.join(__dirname, 'capture.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const STDIN_TIMEOUT = 5000; // 5 secondi

// Codifica usata dalle stampanti/spooler Windows per il testo ANSI (RedMon)
// La maggior parte dei gestionali POS italiani (es. Scontrino Etico) e Blocco Note
// inviano testo in Windows-1252 (CP1252), non in UTF-8.
const SOURCE_ENCODING = 'win1252';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Funzione di logging centralizzata
 * Scrive sia su console che su file
 */
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    console.log(logMessage);
    
    try {
        // Controlla la dimensione del log e ruota se necessario
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

/**
 * Genera un ID univoco per lo scontrino
 * Formato: receipt_YYYYMMDD_HHMMSS_randomstring
 */
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

/**
 * Pulisce il testo grezzo da caratteri di controllo problematici
 * Mantiene i newline ma rimuove caratteri non stampabili
 */
function cleanText(text) {
    // Rimuovi caratteri di controllo (eccetto newline e tab)
    let cleaned = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    
    // Rimuovi spazi multipli alla fine delle righe
    cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');
    
    // Rimuovi righe vuote multiple (max 2 newline consecutivi)
    cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');
    
    // Trim generale
    cleaned = cleaned.trim();
    
    return cleaned;
}

/**
 * Crea la cartella di cattura se non esiste
 */
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

/**
 * Salva il testo dello scontrino su file
 */
function saveReceipt(receiptId, text) {
    try {
        const filePath = path.join(CAPTURE_DIR, `${receiptId}.txt`);
        fs.writeFileSync(filePath, text, 'utf8');
        return filePath;
    } catch (err) {
        log(`Errore nel salvataggio del file: ${err.message}`, 'ERROR');
        throw err;
    }
}

/**
 * Crea un file JSON con metadati dello scontrino
 */
function saveMetadata(receiptId, text, filePath) {
    try {
        const metadata = {
            receipt_id: receiptId,
            timestamp: new Date().toISOString(),
            file_path: filePath,
            text_length: text.length,
            line_count: text.split('\n').length,
            status: 'captured'
        };
        
        const metadataPath = path.join(CAPTURE_DIR, `${receiptId}.json`);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
        
        return metadataPath;
    } catch (err) {
        log(`Errore nel salvataggio dei metadati: ${err.message}`, 'ERROR');
        // Non è critico, continua comunque
    }
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

function main() {
    log('='.repeat(80), 'START');
    log(`Servizio di cattura scontrini avviato`, 'START');
    log(`PID: ${process.pid}`, 'START');
    
    // Assicurati che la cartella di cattura esista
    ensureCaptureDir();
    
    // Leggi stdin come dati BINARI grezzi (Buffer), NON come testo.
    // Questo è fondamentale: se leggessimo come stringa/utf8 direttamente,
    // i byte delle stampanti Windows (codificati in Windows-1252/CP437)
    // verrebbero interpretati erroneamente come UTF-8, corrompendo
    // caratteri accentati e simboli come €, è, à, ecc.
    const chunks = [];
    let timedOut = false;
    
    process.stdin.on('data', (chunk) => {
        chunks.push(chunk);
    });
    
    process.stdin.on('end', () => {
        clearTimeout(timeoutHandle);
        finalizeAndProcess(chunks, timedOut);
    });
    
    process.stdin.on('error', (err) => {
        log(`Errore durante la lettura da stdin: ${err.message}`, 'ERROR');
        process.exit(1);
    });
    
    // Timeout di sicurezza: se lo stream non si chiude, elabora comunque
    const timeoutHandle = setTimeout(() => {
        if (chunks.length > 0) {
            log(`Timeout raggiunto (${STDIN_TIMEOUT}ms), elaboro i dati ricevuti`, 'TIMEOUT');
            timedOut = true;
            finalizeAndProcess(chunks, timedOut);
        }
    }, STDIN_TIMEOUT);
}

/**
 * Concatena i chunk binari, decodifica dalla codifica sorgente (Windows-1252)
 * a UTF-8 e passa il testo risultante all'elaborazione dello scontrino.
 */
function finalizeAndProcess(chunks, timedOut) {
    const rawBuffer = Buffer.concat(chunks);
    const lineCount = rawBuffer.toString('binary').split('\n').length;
    
    let decodedText;
    try {
        decodedText = iconv.decode(rawBuffer, SOURCE_ENCODING);
    } catch (err) {
        log(`Errore nella decodifica (${SOURCE_ENCODING}), fallback a utf8: ${err.message}`, 'WARN');
        decodedText = rawBuffer.toString('utf8');
    }
    
    processReceipt(decodedText, lineCount, timedOut);
}


/**
 * Elabora il testo dello scontrino ricevuto
 */
function processReceipt(rawText, lineCount, timedOut) {
    try {
        // Controlla se abbiamo ricevuto del testo
        if (rawText.trim().length === 0) {
            log(`Nessun testo ricevuto dallo spooler`, 'WARN');
            process.exit(0);
        }
        
        // Pulisci il testo
        const cleanedText = cleanText(rawText);
        
        if (cleanedText.length === 0) {
            log(`Testo vuoto dopo la pulizia`, 'WARN');
            process.exit(0);
        }
        
        // Genera ID univoco
        const receiptId = generateReceiptId();
        
        // Salva il file
        const filePath = saveReceipt(receiptId, cleanedText);
        
        // Salva i metadati
        const metadataPath = saveMetadata(receiptId, cleanedText, filePath);
        
        // Log di successo
        log(`✅ Scontrino catturato con successo`, 'SUCCESS');
        log(`   Receipt ID: ${receiptId}`, 'SUCCESS');
        log(`   File: ${filePath}`, 'SUCCESS');
        log(`   Metadati: ${metadataPath}`, 'SUCCESS');
        log(`   Righe ricevute: ${lineCount}`, 'SUCCESS');
        log(`   Lunghezza testo: ${cleanedText.length} caratteri`, 'SUCCESS');
        log(`   Timeout: ${timedOut ? 'sì' : 'no'}`, 'SUCCESS');
        log('='.repeat(80), 'SUCCESS');
        
        process.exit(0);
        
    } catch (err) {
        log(`❌ Errore durante l'elaborazione: ${err.message}`, 'ERROR');
        log(`Stack trace: ${err.stack}`, 'ERROR');
        process.exit(1);
    }
}

// ============================================================================
// GESTIONE ERRORI GLOBALI
// ============================================================================

process.on('uncaughtException', (err) => {
    log(`Eccezione non gestita: ${err.message}`, 'FATAL');
    log(`Stack: ${err.stack}`, 'FATAL');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log(`Promise rejection non gestita: ${reason}`, 'FATAL');
    process.exit(1);
});

// ============================================================================
// AVVIA IL SERVIZIO
// ============================================================================

main();
