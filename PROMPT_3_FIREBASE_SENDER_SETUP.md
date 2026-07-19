# 🚀 PROMPT 3: Invio a Firebase con Retry e Offline Queue

**Obiettivo:** Inviare gli scontrini normalizzati a Firebase Realtime Database con gestione automatica di retry, backoff esponenziale e coda offline locale.

---

## 📋 Prerequisiti

- Node.js 16+ installato
- Firebase Admin SDK installato: `npm install firebase-admin`
- File `receipt-normalizer.js` funzionante (Prompt 2)
- File `serviceAccountKey.json` nella cartella del progetto
- Firebase Realtime Database configurato

---

## 🎯 Obiettivi del Sender

1. **Invio a Firebase**: Scrivere scontrini normalizzati su Realtime DB
2. **Retry automatico**: Max 3 tentativi con backoff esponenziale
3. **Coda offline**: Se la rete non è disponibile, mettere in coda localmente
4. **Logging**: Registrare tutte le operazioni per debug
5. **Configurazione locale**: Leggere `register_id` da file di configurazione

---

## 📊 Struttura Dati Firebase

```
scontrini/
  {receipt_id}/
    register_id: "cassa-01-negozio-x"
    timestamp: 1720777200000
    status: "UNCLAIMED"
    data: {
      raw_text: "...",
      total: 24.50,
      items: [...]
    }
```

---

## 💻 Step 1: Installare Firebase Admin SDK

```powershell
cd C:\path\to\Fiscal
npm install firebase-admin
```

---

## 💻 Step 2: Creare il File di Configurazione

Crea il file `config.json`:

```json
{
  "register_id": "cassa-01-negozio-test",
  "store_name": "Negozio Test",
  "firebase": {
    "databaseURL": "https://fiscal-9a0c8-default-rtdb.europe-west1.firebasedatabase.app"
  },
  "retry": {
    "maxAttempts": 3,
    "initialDelayMs": 1000,
    "maxDelayMs": 10000
  },
  "offline": {
    "queueFile": "./offline_queue.json",
    "maxQueueSize": 1000
  }
}
```

---

## 💻 Step 3: Creare il Sender con Retry e Offline Queue

Crea il file `firebase-receipt-sender.js`:

```javascript
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
const admin = require('firebase-admin');

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
        
        const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`File non trovato: ${serviceAccountPath}`);
        }
        
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: CONFIG.firebase.databaseURL
        });
        
        db = admin.database();
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
        
        const receiptId = `${CONFIG.register_id}_${receiptData.timestamp}_${Math.random().toString(36).substr(2, 9)}`;
        
        const payload = {
            register_id: CONFIG.register_id,
            timestamp: admin.database.ServerValue.TIMESTAMP,
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
```

---

## 🧪 Step 4: Creare i Test

Crea il file `firebase-receipt-sender.test.js`:

```javascript
#!/usr/bin/env node

/**
 * Test per Firebase Receipt Sender
 */

const sender = require('./firebase-receipt-sender');
const fs = require('fs');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     TEST: FIREBASE RECEIPT SENDER                         ║');
console.log('╚════════════════════════════════════════════════════════════╝');

// Test 1: Verifica configurazione
console.log('\n📝 Test 1: Verifica Configurazione');
console.log('─'.repeat(60));
console.log(`Register ID: ${sender.CONFIG.register_id}`);
console.log(`Store Name: ${sender.CONFIG.store_name}`);
console.log(`Database URL: ${sender.CONFIG.firebase.databaseURL}`);
console.log(`Max Retry Attempts: ${sender.CONFIG.retry.maxAttempts}`);
console.log(`Offline Queue File: ${sender.CONFIG.offline.queueFile}`);
console.log('✅ Configurazione caricata correttamente');

// Test 2: Verifica coda offline
console.log('\n📝 Test 2: Verifica Coda Offline');
console.log('─'.repeat(60));
const queue = sender.loadOfflineQueue();
console.log(`Ricevute in coda: ${queue.length}`);
if (queue.length > 0) {
    console.log('Ricevute in attesa:');
    queue.forEach((item, idx) => {
        console.log(`  ${idx + 1}. Queued at: ${item.queued_at}, Attempts: ${item.attempts}`);
    });
}
console.log('✅ Coda offline verificata');

// Test 3: Ricevuta di test
console.log('\n📝 Test 3: Ricevuta di Test');
console.log('─'.repeat(60));
const testReceipt = {
    register_id: sender.CONFIG.register_id,
    timestamp: new Date().toISOString(),
    raw_text: 'NEGOZIO TEST\nCaffè x1 €2.50\nTOTALE €2.50',
    total: 2.50,
    items: [
        {
            name: 'Caffè',
            quantity: 1,
            price: 2.50,
            line_raw: 'Caffè x1 €2.50'
        }
    ]
};
console.log('Ricevuta di test:');
console.log(JSON.stringify(testReceipt, null, 2));
console.log('✅ Ricevuta di test creata');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║                    TEST COMPLETATI                         ║');
console.log('╚════════════════════════════════════════════════════════════╝');

console.log('\n📝 Note:');
console.log('   - Per inviare effettivamente a Firebase, esegui:');
console.log('     node test-send-receipt.js');
console.log('   - Assicurati che serviceAccountKey.json sia presente');
console.log('   - Assicurati che Firebase sia configurato correttamente');
```

---

## 🧪 Step 5: Testare l'Invio

Crea il file `test-send-receipt.js`:

```javascript
#!/usr/bin/env node

/**
 * Test di Invio Effettivo a Firebase
 */

const sender = require('./firebase-receipt-sender');
const normalizer = require('./receipt-normalizer');

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     TEST: INVIO A FIREBASE                                ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // Ricevuta di test
    const testReceipt = normalizer.normalize(`NEGOZIO TEST
Via Roma 123

Caffè x1          €2.50
Cornetto x1       €1.50

TOTALE            €4.00`);
    
    console.log('\n📤 Invio ricevuta a Firebase...');
    console.log('─'.repeat(60));
    
    try {
        const result = await sender.sendReceipt(testReceipt);
        
        if (result.success) {
            console.log(`✅ Ricevuta inviata con successo!`);
            console.log(`   Receipt ID: ${result.receipt_id}`);
            console.log(`   Timestamp: ${result.timestamp}`);
        } else if (result.queued) {
            console.log(`📦 Ricevuta messa in coda offline`);
            console.log(`   Errore: ${result.error}`);
        }
        
    } catch (err) {
        console.log(`❌ Errore durante l'invio: ${err.message}`);
    }
    
    // Elabora la coda offline
    console.log('\n📦 Elaborazione coda offline...');
    console.log('─'.repeat(60));
    
    try {
        const queueResult = await sender.processOfflineQueue();
        console.log(`Elaborate: ${queueResult.processed}`);
        console.log(`Fallite: ${queueResult.failed}`);
        console.log(`Rimaste in coda: ${queueResult.remaining}`);
    } catch (err) {
        console.log(`Errore: ${err.message}`);
    }
}

main().catch(console.error);
```

---

## ✅ Checklist di Completamento

- [ ] Firebase Admin SDK installato
- [ ] File `config.json` creato
- [ ] File `firebase-receipt-sender.js` creato
- [ ] File `firebase-receipt-sender.test.js` creato
- [ ] File `test-send-receipt.js` creato
- [ ] Test di configurazione eseguito
- [ ] Test di invio eseguito
- [ ] Ricevuta visibile su Firebase Console

---

## 📝 Note Importanti

1. **Retry automatico**: Max 3 tentativi con backoff esponenziale
2. **Coda offline**: Se la rete non è disponibile, le ricevute vengono messe in coda
3. **Logging**: Tutte le operazioni vengono loggat per debug
4. **Configurazione**: Leggere da `config.json` per personalizzare il `register_id`

---

## 🚀 Prossimo Step

Una volta che l'invio a Firebase funziona:
1. Procedi con **Prompt 4: Logica Digitale/Cartaceo**
2. Implementa il system tray icon con pulsante "Stampa su carta"

Fammi sapere quando i test sono completati! 🎉
