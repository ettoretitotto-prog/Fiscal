#!/usr/bin/env node

/**
 * Test Interattivo - Nuove Funzionalità Fiscal
 * 
 * Questo script permette di testare interattivamente:
 * 1. Receipt Processor
 * 2. Normalizzazione
 * 3. Invio a Firebase
 * 4. Finestra di stampa
 * 5. System Tray
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const normalizer = require('./receipt-normalizer');
const sender = require('./firebase-receipt-sender');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// ============================================================================
// UTILITY
// ============================================================================

function clearScreen() {
    console.clear();
}

function printHeader(title) {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log(`║  ${title.padEnd(56)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');
}

function printMenu(options) {
    options.forEach((opt, idx) => {
        console.log(`  ${idx + 1}. ${opt}`);
    });
    console.log('  0. Esci\n');
}

function question(prompt) {
    return new Promise(resolve => {
        rl.question(prompt, resolve);
    });
}

// ============================================================================
// TEST SAMPLES
// ============================================================================

const SAMPLE_RECEIPTS = {
    simple: `CASSA DEMO
Via Roma 123, Milano
Tel: 02-1234567

Data: 18/07/2026 14:30:00
Scontrino: #12345

ARTICOLI:
Espresso                    1x €1.20
Cornetto                    1x €1.50
Acqua Minerale              1x €0.80

SUBTOTALE:                      €3.50
IVA (10%):                      €0.35
TOTALE:                         €3.85

Grazie per l'acquisto!`,

    pizza: `PIZZERIA "DA MARIO"
Piazza Duomo, 1 - Milano

RICEVUTA FISCALE
Data: 18-07-2026 ore 15:45:30

PRODOTTI:
Pizza Margherita                €8,50
Birra Media                     €3,00
Coperto                         €1,50

TOTALE LORDO:                   €13,00
IVA 10%:                        €1,30
TOTALE NETTO:                   €11,70

Grazie!`,

    coffee: `CAFFETTERIA CENTRALE
Via Torino 45

18/07/2026 - 09:15

Caffè Espresso x2              €2.40
Cappuccino x1                  €1.80
Cornetto Vuoto x1              €1.20
Brioche x2                     €3.00

TOTALE                         €8.40

Grazie della visita!`
};

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

async function testNormalization() {
    clearScreen();
    printHeader('TEST: NORMALIZZAZIONE SCONTRINO');
    
    console.log('Scegli uno scontrino di test:\n');
    const options = [
        'Scontrino Semplice (Cassa Demo)',
        'Scontrino Pizzeria (Formati diversi)',
        'Scontrino Caffetteria (Prezzi con virgola)',
        'Inserisci manualmente'
    ];
    printMenu(options);
    
    const choice = await question('Scelta: ');
    
    let receiptText = '';
    
    if (choice === '1') {
        receiptText = SAMPLE_RECEIPTS.simple;
    } else if (choice === '2') {
        receiptText = SAMPLE_RECEIPTS.pizza;
    } else if (choice === '3') {
        receiptText = SAMPLE_RECEIPTS.coffee;
    } else if (choice === '4') {
        console.log('\nInserisci il testo dello scontrino (termina con una riga vuota):');
        let lines = [];
        let line = await question('> ');
        while (line !== '') {
            lines.push(line);
            line = await question('> ');
        }
        receiptText = lines.join('\n');
    } else {
        return;
    }
    
    console.log('\n🔄 Normalizzazione in corso...\n');
    
    try {
        const normalized = normalizer.normalize(receiptText);
        
        console.log('✅ Scontrino normalizzato:\n');
        console.log(JSON.stringify(normalized, null, 2));
        
        await question('\nPremi INVIO per continuare...');
        
    } catch (err) {
        console.log(`❌ Errore: ${err.message}`);
        await question('\nPremi INVIO per continuare...');
    }
}

async function testSendToFirebase() {
    clearScreen();
    printHeader('TEST: INVIO A FIREBASE');
    
    console.log('⚠️  NOTA: Questo test richiede:\n');
    console.log('  1. firebase-admin installato: npm install firebase-admin');
    console.log('  2. serviceAccountKey.json nella cartella del progetto');
    console.log('  3. Connessione internet attiva\n');
    
    const proceed = await question('Vuoi procedere? (s/n): ');
    if (proceed.toLowerCase() !== 's') {
        return;
    }
    
    console.log('\nScegli uno scontrino di test:\n');
    const options = [
        'Scontrino Semplice (Cassa Demo)',
        'Scontrino Pizzeria (Formati diversi)',
        'Scontrino Caffetteria (Prezzi con virgola)'
    ];
    printMenu(options);
    
    const choice = await question('Scelta: ');
    
    let receiptText = '';
    
    if (choice === '1') {
        receiptText = SAMPLE_RECEIPTS.simple;
    } else if (choice === '2') {
        receiptText = SAMPLE_RECEIPTS.pizza;
    } else if (choice === '3') {
        receiptText = SAMPLE_RECEIPTS.coffee;
    } else {
        return;
    }
    
    console.log('\n🔄 Normalizzazione in corso...');
    const normalized = normalizer.normalize(receiptText);
    
    console.log('📤 Invio a Firebase...\n');
    
    try {
        const result = await sender.sendReceipt(normalized);
        
        if (result.success) {
            console.log('✅ Scontrino inviato con successo!');
            console.log(`   Receipt ID: ${result.receipt_id}`);
            console.log(`   Timestamp: ${result.timestamp}`);
        } else if (result.queued) {
            console.log('📦 Scontrino messo in coda offline');
            console.log(`   Errore: ${result.error}`);
            console.log('\n💡 Suggerimento: Verifica che firebase-admin sia installato');
            console.log('   npm install firebase-admin');
        }
        
        await question('\nPremi INVIO per continuare...');
        
    } catch (err) {
        console.log(`❌ Errore: ${err.message}`);
        console.log('\n🔧 Troubleshooting:');
        console.log('  1. Verifica firebase-admin: npm list firebase-admin');
        console.log('  2. Verifica serviceAccountKey.json esiste');
        console.log('  3. Verifica connessione internet');
        console.log('  4. Leggi firebase-sender.log per dettagli');
        await question('\nPremi INVIO per continuare...');
    }
}

async function testOfflineQueue() {
    clearScreen();
    printHeader('TEST: CODA OFFLINE');
    
    console.log('Opzioni disponibili:\n');
    const options = [
        'Visualizza coda offline',
        'Elabora coda offline',
        'Pulisci coda offline'
    ];
    printMenu(options);
    
    const choice = await question('Scelta: ');
    
    if (choice === '1') {
        const queue = sender.loadOfflineQueue();
        console.log(`\n📦 Ricevute in coda: ${queue.length}\n`);
        
        if (queue.length > 0) {
            queue.forEach((item, idx) => {
                console.log(`${idx + 1}. Queued at: ${item.queued_at}`);
                console.log(`   Attempts: ${item.attempts}`);
                console.log(`   Total: €${item.receipt_data.total || 'N/A'}\n`);
            });
        }
        
    } else if (choice === '2') {
        console.log('\n⏳ Elaborazione coda offline...\n');
        try {
            const result = await sender.processOfflineQueue();
            console.log(`✅ Elaborate: ${result.processed}`);
            console.log(`❌ Fallite: ${result.failed}`);
            console.log(`📦 Rimaste in coda: ${result.remaining}`);
        } catch (err) {
            console.log(`❌ Errore: ${err.message}`);
        }
        
    } else if (choice === '3') {
        const configPath = path.join(__dirname, sender.CONFIG.offline.queueFile);
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
            console.log('\n✅ Coda offline pulita');
        } else {
            console.log('\n⚠️  Coda offline già vuota');
        }
    }
    
    await question('\nPremi INVIO per continuare...');
}

async function testFileWatcher() {
    clearScreen();
    printHeader('TEST: FILE WATCHER');
    
    console.log('Questo test simula la creazione di file di scontrini.\n');
    console.log('Opzioni disponibili:\n');
    const options = [
        'Crea un file di scontrino di test',
        'Crea 5 file di scontrini',
        'Visualizza file nella cartella'
    ];
    printMenu(options);
    
    const choice = await question('Scelta: ');
    
    const captureDir = './captured_receipts';
    if (!fs.existsSync(captureDir)) {
        fs.mkdirSync(captureDir, { recursive: true });
    }
    
    if (choice === '1') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `receipt_${timestamp}.txt`;
        const filepath = path.join(captureDir, filename);
        
        fs.writeFileSync(filepath, SAMPLE_RECEIPTS.simple);
        console.log(`\n✅ File creato: ${filename}`);
        console.log(`   Percorso: ${filepath}`);
        
    } else if (choice === '2') {
        for (let i = 1; i <= 5; i++) {
            const timestamp = new Date(Date.now() + i * 1000).toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `receipt_${timestamp}.txt`;
            const filepath = path.join(captureDir, filename);
            
            const samples = [SAMPLE_RECEIPTS.simple, SAMPLE_RECEIPTS.pizza, SAMPLE_RECEIPTS.coffee];
            fs.writeFileSync(filepath, samples[i % 3]);
            console.log(`✅ File ${i} creato: ${filename}`);
        }
        
    } else if (choice === '3') {
        const files = fs.readdirSync(captureDir).filter(f => f.endsWith('.txt'));
        console.log(`\n📁 File nella cartella (${files.length} totali):\n`);
        
        if (files.length === 0) {
            console.log('   (nessun file)');
        } else {
            files.forEach((file, idx) => {
                const filepath = path.join(captureDir, file);
                const stats = fs.statSync(filepath);
                console.log(`${idx + 1}. ${file} (${stats.size} bytes)`);
            });
        }
    }
    
    await question('\nPremi INVIO per continuare...');
}

async function testConfiguration() {
    clearScreen();
    printHeader('TEST: CONFIGURAZIONE');
    
    console.log('Configurazione attuale:\n');
    console.log(`Register ID: ${sender.CONFIG.register_id}`);
    console.log(`Store Name: ${sender.CONFIG.store_name}`);
    console.log(`Database URL: ${sender.CONFIG.firebase.databaseURL}`);
    console.log(`Max Retry Attempts: ${sender.CONFIG.retry.maxAttempts}`);
    console.log(`Initial Delay: ${sender.CONFIG.retry.initialDelayMs}ms`);
    console.log(`Max Delay: ${sender.CONFIG.retry.maxDelayMs}ms`);
    console.log(`Offline Queue File: ${sender.CONFIG.offline.queueFile}`);
    console.log(`Max Queue Size: ${sender.CONFIG.offline.maxQueueSize}`);
    
    console.log('\n📝 File di configurazione: config.json');
    
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        console.log('✅ File trovato');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('\nContenuto:\n');
        console.log(JSON.stringify(config, null, 2));
    } else {
        console.log('⚠️  File non trovato (usando configurazione di default)');
    }
    
    await question('\nPremi INVIO per continuare...');
}

async function viewLogs() {
    clearScreen();
    printHeader('TEST: VISUALIZZA LOG');
    
    console.log('File di log disponibili:\n');
    const logFiles = [
        { name: 'receipt-processor.log', desc: 'Log del Receipt Processor' },
        { name: 'firebase-sender.log', desc: 'Log del Firebase Sender' }
    ];
    
    logFiles.forEach((log, idx) => {
        console.log(`${idx + 1}. ${log.desc}`);
        console.log(`   File: ${log.name}`);
    });
    console.log('0. Esci\n');
    
    const choice = await question('Scelta: ');
    
    if (choice === '1' || choice === '2') {
        const logFile = logFiles[parseInt(choice) - 1].name;
        const logPath = path.join(__dirname, logFile);
        
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.split('\n');
            const lastLines = lines.slice(-50).join('\n');
            
            console.log(`\n📄 Ultimi 50 log da ${logFile}:\n`);
            console.log(lastLines);
        } else {
            console.log(`\n⚠️  File non trovato: ${logFile}`);
        }
        
        await question('\nPremi INVIO per continuare...');
    }
}

// ============================================================================
// MAIN MENU
// ============================================================================

async function mainMenu() {
    clearScreen();
    printHeader('TEST INTERATTIVO - FISCAL');
    
    console.log('Seleziona un test:\n');
    const options = [
        'Test Normalizzazione Scontrino',
        'Test Invio a Firebase',
        'Test Coda Offline',
        'Test File Watcher',
        'Test Configurazione',
        'Visualizza Log'
    ];
    printMenu(options);
    
    const choice = await question('Scelta: ');
    
    switch (choice) {
        case '1':
            await testNormalization();
            break;
        case '2':
            await testSendToFirebase();
            break;
        case '3':
            await testOfflineQueue();
            break;
        case '4':
            await testFileWatcher();
            break;
        case '5':
            await testConfiguration();
            break;
        case '6':
            await viewLogs();
            break;
        case '0':
            console.log('\n👋 Arrivederci!\n');
            rl.close();
            process.exit(0);
            break;
        default:
            console.log('\n⚠️  Scelta non valida');
            await question('Premi INVIO per continuare...');
    }
    
    await mainMenu();
}

// ============================================================================
// START
// ============================================================================

console.log('\n🚀 Avvio Test Interattivo...\n');
mainMenu().catch(err => {
    console.error('Errore:', err);
    rl.close();
    process.exit(1);
});
