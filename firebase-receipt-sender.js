#!/usr/bin/env node

/**
 * Firebase Receipt Sender con Retry e Offline Queue
 * 
 * Invia gli scontrini normalizzati a Firebase Realtime Database
 * con gestione automatica di retry, backoff esponenziale e coda offline
 * 
 * Uso:
 *   const sender = require('./firebase-receipt-sender');
 *   await sender.sendReceipt(normalizedReceipt);
 */

const fs = require('fs');
const path = require('path');

// Carica firebase-admin solo se disponibile (API modulare v12+)
let admin = null;
let getDatabase = null;
let ServerValue = null;
try {
    admin = require('firebase-admin');
    const dbModule = require('firebase-admin/database');
    getDatabase = dbModule.getDatabase;
    ServerValue = dbModule.ServerValue;
} catch (err) {
    console.warn('⚠️  firebase-admin non installato. Modalità offline-only.');
}


// ============================================================================
// CONFIGURAZIONE
// ============================================================================

let CONFIG = {
    register_id: 'cassa-01-negozio-test',
    store_name: 'Negozio Test',
    firebase: {
        databaseURL: 'https://fiscal-9a0c8-default-rtdb.europe-west1.firebasedatabase.app'
    },
    retry: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000
    },
    offline: {
        queueFile: './offline_queue.json',
        maxQueueSize: 1000
    }
};

// Carica la configurazione da file se esiste
function loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        try {
            const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            CONFIG = { ...CONFIG, ...fileConfig };
            log(`Configurazione caricata da: ${configPath}`, 'CONFIG');
        } catch (err) {
            log(`Errore nel caricamento della configurazione: ${err.message}`, 'ERROR');
        }
    }
}

// ============================================================================
// LOGGING
// ============================================================================

const LOG_FILE = path.join(__dirname, 'firebase-sender.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB

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

// ============================================================================
// FIREBASE INITIALIZATION
// ============================================================================

let db = null;
let firebaseInitialized = false;

function initializeFirebase() {
    try {
        if (firebaseInitialized) return;
        
        if (!admin) {
            throw new Error('firebase-admin non disponibile');
        }
        
        const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`File non trovato: ${serviceAccountPath}`);
        }
        
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        
        // Evita di reinizializzare l'app se già esistente
        let app;
        if (admin.getApps().length === 0) {
            app = admin.initializeApp({
                credential: admin.cert(serviceAccount),
                databaseURL: CONFIG.firebase.databaseURL
            });
        } else {
            app = admin.getApp();
        }
        
        db = getDatabase(app);
        firebaseInitialized = true;

        
        log('Firebase Admin SDK inizializzato', 'FIREBASE');

        
    } catch (err) {
        log(`Errore nell'inizializzazione di Firebase: ${err.message}`, 'ERROR');
        throw err;
    }
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Calcola il delay con backoff esponenziale
 */
function calculateBackoffDelay(attempt) {
    const delay = Math.min(
        CONFIG.retry.initialDelayMs * Math.pow(2, attempt),
        CONFIG.retry.maxDelayMs
    );
    // Aggiungi jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() - 0.5);
    return Math.max(0, delay + jitter);
}

/**
 * Aspetta per un determinato numero di millisecondi
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Invia il ricevuta a Firebase con retry
 */
async function sendWithRetry(receiptData, attempt = 0) {
    try {
        if (!firebaseInitialized) {
            initializeFirebase();
        }
        
        // Sanitizza il timestamp per essere un path Firebase valido (niente ".", "#", "$", "[", "]", "/")
        const rawTimestamp = receiptData.timestamp !== undefined && receiptData.timestamp !== null
            ? receiptData.timestamp
            : Date.now();
        const safeTimestamp = String(rawTimestamp).replace(/[.#$\[\]\/]/g, '-');
        const receiptId = `${CONFIG.register_id}_${safeTimestamp}_${Math.random().toString(36).substr(2, 9)}`;

        
        const payload = {
            register_id: CONFIG.register_id,
            cassa_id: CONFIG.register_id,
            timestamp: ServerValue ? ServerValue.TIMESTAMP : Date.now(),
            status: 'UNCLAIMED',
            data: receiptData,
            receipt_id: receiptId
        };


        
        await db.ref(`scontrini/${receiptId}`).set(payload);
        
        log(`✅ Ricevuta inviata a Firebase: ${receiptId}`, 'SUCCESS');
        
        return {
            success: true,
            receipt_id: receiptId,
            timestamp: new Date().toISOString()
        };
        
    } catch (err) {
        if (attempt < CONFIG.retry.maxAttempts - 1) {
            const delay = calculateBackoffDelay(attempt);
            log(`⏳ Tentativo ${attempt + 1} fallito, retry tra ${Math.round(delay)}ms: ${err.message}`, 'RETRY');
            
            await sleep(delay);
            return sendWithRetry(receiptData, attempt + 1);
            
        } else {
            log(`❌ Invio fallito dopo ${CONFIG.retry.maxAttempts} tentativi: ${err.message}`, 'ERROR');
            throw err;
        }
    }
}

// ============================================================================
// OFFLINE QUEUE
// ============================================================================

/**
 * Carica la coda offline dal file
 */
function loadOfflineQueue() {
    try {
        if (fs.existsSync(CONFIG.offline.queueFile)) {
            const queue = JSON.parse(fs.readFileSync(CONFIG.offline.queueFile, 'utf8'));
            log(`Coda offline caricata: ${queue.length} ricevute in attesa`, 'QUEUE');
            return queue;
        }
    } catch (err) {
        log(`Errore nel caricamento della coda offline: ${err.message}`, 'ERROR');
    }
    return [];
}

/**
 * Salva la coda offline su file
 */
function saveOfflineQueue(queue) {
    try {
        fs.writeFileSync(CONFIG.offline.queueFile, JSON.stringify(queue, null, 2));
    } catch (err) {
        log(`Errore nel salvataggio della coda offline: ${err.message}`, 'ERROR');
    }
}

/**
 * Aggiunge una ricevuta alla coda offline
 */
function addToOfflineQueue(receiptData) {
    try {
        let queue = loadOfflineQueue();
        
        if (queue.length >= CONFIG.offline.maxQueueSize) {
            log(`⚠️  Coda offline piena (${CONFIG.offline.maxQueueSize}), scarto la ricevuta più vecchia`, 'WARN');
            queue.shift();
        }
        
        queue.push({
            receipt_data: receiptData,
            queued_at: new Date().toISOString(),
            attempts: 0
        });
        
        saveOfflineQueue(queue);
        log(`📦 Ricevuta aggiunta alla coda offline (${queue.length}/${CONFIG.offline.maxQueueSize})`, 'QUEUE');
        
        return true;
        
    } catch (err) {
        log(`Errore nell'aggiunta alla coda offline: ${err.message}`, 'ERROR');
        return false;
    }
}

/**
 * Elabora la coda offline
 */
async function processOfflineQueue() {
    try {
        let queue = loadOfflineQueue();
        
        if (queue.length === 0) {
            log('Coda offline vuota', 'QUEUE');
            return { processed: 0, failed: 0 };
        }
        
        log(`Elaborazione coda offline: ${queue.length} ricevute`, 'QUEUE');
        
        let processed = 0;
        let failed = 0;
        const newQueue = [];
        
        for (const item of queue) {
            try {
                item.attempts++;
                await sendWithRetry(item.receipt_data);
                processed++;
                log(`✅ Ricevuta dalla coda elaborata (tentativo ${item.attempts})`, 'QUEUE');
                
            } catch (err) {
                if (item.attempts < CONFIG.retry.maxAttempts) {
                    newQueue.push(item);
                    log(`⏳ Ricevuta rimane in coda (tentativo ${item.attempts}/${CONFIG.retry.maxAttempts})`, 'QUEUE');
                } else {
                    failed++;
                    log(`❌ Ricevuta scartata dopo ${item.attempts} tentativi`, 'QUEUE');
                }
            }
        }
        
        saveOfflineQueue(newQueue);
        
        return { processed, failed, remaining: newQueue.length };
        
    } catch (err) {
        log(`Errore nell'elaborazione della coda offline: ${err.message}`, 'ERROR');
        return { processed: 0, failed: 0 };
    }
}

// ============================================================================
// MAIN SEND FUNCTION
// ============================================================================

/**
 * Invia una ricevuta normalizzata a Firebase
 * Se la rete non è disponibile, la mette in coda offline
 */
async function sendReceipt(normalizedReceipt) {
    try {
        log(`Invio ricevuta: totale €${normalizedReceipt.total || 'N/A'}`, 'SEND');
        
        // Aggiungi il register_id se non presente
        if (!normalizedReceipt.register_id) {
            normalizedReceipt.register_id = CONFIG.register_id;
        }
        
        try {
            // Prova a inviare a Firebase
            const result = await sendWithRetry(normalizedReceipt);
            
            // Se l'invio ha successo, prova a elaborare la coda offline
            const queueResult = await processOfflineQueue();
            if (queueResult.processed > 0) {
                log(`Elaborate ${queueResult.processed} ricevute dalla coda offline`, 'QUEUE');
            }
            
            return result;
            
        } catch (err) {
            // Se l'invio fallisce, aggiungi alla coda offline
            log(`Invio fallito, aggiunta alla coda offline: ${err.message}`, 'OFFLINE');
            addToOfflineQueue(normalizedReceipt);
            
            return {
                success: false,
                queued: true,
                error: err.message
            };
        }
        
    } catch (err) {
        log(`Errore durante l'invio: ${err.message}`, 'ERROR');
        throw err;
    }
}

/**
 * Invia un file di ricevuta normalizzata
 */
async function sendReceiptFile(filePath) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return await sendReceipt(data);
    } catch (err) {
        log(`Errore nella lettura del file: ${err.message}`, 'ERROR');
        throw err;
    }
}

/**
 * Invia tutti i file normalizzati da una cartella
 */
async function sendReceiptDirectory(captureDir = './captured_receipts') {
    try {
        const files = fs.readdirSync(captureDir)
            .filter(file => file.endsWith('.json') && !file.includes('normalized'))
            .sort();
        
        log(`Invio ${files.length} ricevute da ${captureDir}`, 'BATCH');
        
        const results = [];
        for (const file of files) {
            const filePath = path.join(captureDir, file);
            try {
                const result = await sendReceiptFile(filePath);
                results.push(result);
            } catch (err) {
                log(`Errore nell'invio di ${file}: ${err.message}`, 'ERROR');
            }
        }
        
        return results;
        
    } catch (err) {
        log(`Errore nell'invio batch: ${err.message}`, 'ERROR');
        throw err;
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

loadConfig();

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    sendReceipt,
    sendReceiptFile,
    sendReceiptDirectory,
    processOfflineQueue,
    loadOfflineQueue,
    CONFIG
};
