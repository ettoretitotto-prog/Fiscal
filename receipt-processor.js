#!/usr/bin/env node

/**
 * Receipt Processor - Servizio Integrato
 * Coordina: Cattura → Normalizza → Firebase + System Tray con stampa cartacea
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const normalizer = require('./receipt-normalizer');
const sender = require('./firebase-receipt-sender');

const CONFIG = {
    captureDir: path.join(__dirname, 'captured_receipts'),
    printerName: 'CAPTURE_PRINTER',
    printWindowDuration: 60000,
    watchInterval: 2000,
    minReceiptLength: 20,
    logFile: path.join(__dirname, 'receipt-processor.log'),
    processedDir: path.join(__dirname, 'captured_receipts', 'processed'),
    tcpPort: 9100,
    // Mantiene la compatibilità con POS sulla LAN; impostare 127.0.0.1 se Tilby gira sullo stesso PC.
    tcpHost: process.env.FISCAL_TCP_HOST || '0.0.0.0',
    tcpMaxPayloadBytes: 1024 * 1024,
    tcpSocketTimeoutMs: 30000,
    tcpWatchedFile: 'C:\\FiscalPrintLocalPort\\output.prn',
    tcpLogPreviewLength: 200
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
// PROCESSED FILES MANAGEMENT
// ============================================================================

/**
 * Sposta un file elaborato con successo nella sottocartella "processed/",
 * così non resta nella cartella principale e non può essere riletto/rinviato
 * in futuro dal watcher, anche se il Set in memoria venisse perso (riavvio).
 */
function moveToProcessed(filePath) {
    try {
        if (!fs.existsSync(CONFIG.processedDir)) {
            fs.mkdirSync(CONFIG.processedDir, { recursive: true });
        }
        const destPath = path.join(CONFIG.processedDir, path.basename(filePath));
        fs.renameSync(filePath, destPath);
        log(`📁 File spostato in processed/: ${path.basename(filePath)}`, 'PROCESS');
        return true;
    } catch (err) {
        log(`Errore spostamento file in processed/: ${err.message}`, 'ERROR');
        return false;
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
            
            // Un file viene marcato come processato solo dopo invio/accodamento e spostamento riusciti.
            const newFiles = files.filter(f => !processedFiles.has(f));
            
            if (newFiles.length > 0) {
                newFiles.forEach(async (f) => {
                    const filePath = path.join(CONFIG.captureDir, f);
                    log(`File da elaborare: ${f}`, 'WATCH');
                    try {
                        const completed = await processReceiptFile(filePath);
                        if (completed) {
                            processedFiles.add(f);
                        }
                    } catch (err) {
                        log(`Errore elaborazione ${f}: ${err.message}`, 'ERROR');
                    }
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
        // lavori  moveToProcessed(filePath)di stampa separati: testo troppo corto per essere uno scontrino,
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
        
        // Sposta il file solo dopo un invio confermato o una persistenza offline verificata.
        const completed = (sendResult.success || sendResult.queued) && moveToProcessed(filePath);
        if (!completed) {
            log(`File mantenuto per nuovo tentativo: ${path.basename(filePath)}`, 'RETRY');
            return false;
        }
        
        lastReceiptData = {
            rawText,
            normalizedReceipt,
            timestamp: new Date().toISOString()
        };
        openPrintWindow();
        return true;
        
    } catch (err) {
        log(`Errore elaborazione: ${err.message}`, 'ERROR');
        return false;
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
        
        // Usa un file temporaneo e execFile: il testo della ricevuta non viene mai interpretato dalla shell.
        const { execFile } = require('child_process');
        const tempFile = path.join(
            __dirname,
            `receipt-print-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
        );
        fs.writeFileSync(tempFile, lastReceiptData.rawText, 'utf8');
        
        execFile('print', [`/d:${CONFIG.printerName}`, tempFile], (err) => {
            try {
                fs.unlinkSync(tempFile);
            } catch (_) {
                // Il file temporaneo verrà ignorato se già rimosso dal sistema.
            }
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
// TCP SERVER (Tilby → output.prn)
// ============================================================================

function ensureTcpWatchedPathExists() {
    try {
        const parentDir = path.dirname(CONFIG.tcpWatchedFile);
        if (!fs.existsSync(parentDir)) {
            // Tentativo di creare la cartella (può essere una path Windows come C:\\..., 
            // su sistemi POSIX creerà una directory con quel nome nel CWD)
            fs.mkdirSync(parentDir, { recursive: true });
            log(`Cartella creata per porta locale: ${parentDir}`, 'INIT');
        }
    } catch (err) {
        log(`Impossibile creare la cartella per ${CONFIG.tcpWatchedFile}: ${err.message}`, 'WARN');
    }
}

function startTcpServer() {
    try {
        ensureTcpWatchedPathExists();

        const server = net.createServer((socket) => {
            const remote = `${socket.remoteAddress}:${socket.remotePort}`;
            let receivedBytes = 0;
            socket.setTimeout(CONFIG.tcpSocketTimeoutMs);
            log(`Nuova connessione TCP da ${remote}`, 'TCP');

            socket.on('data', (data) => {
                try {
                    receivedBytes += data.length;
                    if (receivedBytes > CONFIG.tcpMaxPayloadBytes) {
                        log(`Connessione TCP chiusa: superato limite ${CONFIG.tcpMaxPayloadBytes} byte da ${remote}`, 'WARN');
                        socket.destroy();
                        return;
                    }

                    fs.appendFileSync(CONFIG.tcpWatchedFile, data);
                    socket.write(Buffer.from([0x06]));

                    let preview;
                    try {
                        preview = data.toString('utf8').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
                    } catch (_) {
                        preview = '[dati binari non visualizzabili]';
                    }
                    if (preview.length > CONFIG.tcpLogPreviewLength) {
                        preview = preview.substring(0, CONFIG.tcpLogPreviewLength) + '...';
                    }

                    log(`TCP ${remote} → scritto ${data.length} byte (totale connessione: ${receivedBytes})`, 'TCP');
                    log(`TCP ${remote} → preview: ${preview}`, 'TCP');
                } catch (err) {
                    log(`Errore scrittura su ${CONFIG.tcpWatchedFile}: ${err.message}`, 'ERROR');
                    socket.destroy();
                }
            });

            // Invia un ACK al client appena si connette per indicare che il
            // device è pronto (Tilby si aspetta un byte di conferma all'apertura)
            try {
                socket.write(Buffer.from([0x06])); // ACK al connect
                log(`ACK iniziale inviato a ${remote}`, 'TCP');
            } catch (err) {
                log(`Errore invio ACK iniziale a ${remote}: ${err.message}`, 'WARN');
            }

            socket.on('timeout', () => {
                log(`Timeout connessione TCP da ${remote}`, 'WARN');
                socket.destroy();
            });

            socket.on('end', () => {
                log(`Connessione chiusa: ${remote}`, 'TCP');
            });

            socket.on('error', (err) => {
                log(`Errore socket ${remote}: ${err.message}`, 'ERROR');
            });
        });

        server.on('error', (err) => {
            log(`Errore server TCP: ${err.message}`, 'ERROR');
        });

        server.maxConnections = 20;
        server.listen(CONFIG.tcpPort, CONFIG.tcpHost, () => {
            log(`Server TCP avviato su ${CONFIG.tcpHost}:${CONFIG.tcpPort} - scrive in ${CONFIG.tcpWatchedFile}`, 'TCP');
        });

        // Non restituiamo il server: deve restare attivo insieme al processor.
    } catch (err) {
        log(`Impossibile avviare il server TCP: ${err.message}`, 'ERROR');
    }
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
    
    // I file rimasti dopo un riavvio sono lavori non conclusi: vengono elaborati
    // dal watcher e rimossi solo dopo invio o persistenza offline confermati.
    try {
        const existingFiles = fs.readdirSync(CONFIG.captureDir)
            .filter(file => file.endsWith('.txt'));
        if (existingFiles.length > 0) {
            log(`Recupero di ${existingFiles.length} file rimasti da una sessione precedente`, 'INIT');
        }
    } catch (err) {
        log(`Errore durante la lettura dei file esistenti: ${err.message}`, 'ERROR');
    }
    
    // Avvia il monitoraggio
    watchCaptureDirectory();

    // Avvia il server TCP che riceve ESC/POS da Tilby e scrive in output.prn
    startTcpServer();
    
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
