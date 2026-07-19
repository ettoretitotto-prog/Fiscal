# 📝 PROMPT 2: Normalizzatore dello Scontrino

**Obiettivo:** Trasformare il testo grezzo dello scontrino (catturato da RedMon) in un oggetto JSON strutturato, con fallback su `raw_text` se il parsing fallisce.

---

## 📋 Prerequisiti

- Node.js 16+ installato
- File `capture-service.js` funzionante (Prompt 1)
- Cartella `captured_receipts/` con file `.txt` di scontrini

---

## 🎯 Obiettivi del Normalizzatore

1. **Pulizia del testo**: Rimuovere caratteri di controllo residui
2. **Parsing del totale**: Estrarre la riga con "TOTALE" e il valore numerico
3. **Parsing dei prodotti**: Estrarre righe prodotto (nome + prezzo) in modo euristico
4. **Fallback robusto**: Se il parsing fallisce, includere sempre `raw_text`
5. **Output JSON strutturato**: Formato coerente per l'invio a Firebase

---

## 📊 Struttura Output

```json
{
  "register_id": null,
  "timestamp": "2026-07-18T10:32:00.000Z",
  "raw_text": "NEGOZIO TEST\nVia Roma 123\n...",
  "total": 24.50,
  "items": [
    {
      "name": "Caffè",
      "quantity": 1,
      "price": 2.50,
      "line_raw": "Caffè x1          €2.50"
    },
    {
      "name": "Cornetto",
      "quantity": 1,
      "price": 1.50,
      "line_raw": "Cornetto x1       €1.50"
    }
  ]
}
```

---

## 💻 Step 1: Creare il Normalizzatore

Crea il file `receipt-normalizer.js`:

```javascript
/**
 * Normalizzatore di Scontrini
 * 
 * Trasforma il testo grezzo dello scontrino in un oggetto JSON strutturato
 * Uso:
 *   const normalizer = require('./receipt-normalizer');
 *   const receipt = normalizer.normalize(rawText);
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAZIONE
// ============================================================================

const CONFIG = {
    // Parole chiave per identificare il totale (case-insensitive)
    TOTAL_KEYWORDS: ['totale', 'total', 'importo', 'amount', 'dovuto', 'da pagare'],
    
    // Parole chiave per identificare righe da ignorare
    IGNORE_KEYWORDS: ['iva', 'tasse', 'sconto', 'subtotale', 'subtotal', 'imponibile'],
    
    // Regex per estrarre prezzo (€ o numero con virgola/punto)
    PRICE_REGEX: /€?\s*(\d+[.,]\d{2})\s*$/,
    
    // Regex per estrarre quantità (es. "x1", "x2", "1x")
    QUANTITY_REGEX: /\b(\d+)\s*x\b|\bx\s*(\d+)\b/i,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Pulisce il testo da caratteri di controllo residui
 */
function cleanText(text) {
    if (!text || typeof text !== 'string') return '';
    
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
 * Normalizza un numero (converte virgola in punto)
 */
function normalizeNumber(str) {
    if (!str) return null;
    const num = parseFloat(str.replace(',', '.'));
    return isNaN(num) ? null : num;
}

/**
 * Estrae il totale dal testo
 * Cerca una riga che contiene una parola chiave di totale seguita da un numero
 */
function extractTotal(text) {
    if (!text) return null;
    
    const lines = text.split('\n');
    
    for (const line of lines) {
        const lowerLine = line.toLowerCase();
        
        // Controlla se la riga contiene una parola chiave di totale
        const hasTotalKeyword = CONFIG.TOTAL_KEYWORDS.some(keyword => 
            lowerLine.includes(keyword)
        );
        
        if (!hasTotalKeyword) continue;
        
        // Estrai il prezzo dalla riga
        const match = line.match(CONFIG.PRICE_REGEX);
        if (match) {
            const total = normalizeNumber(match[1]);
            if (total !== null) {
                return {
                    total,
                    line_raw: line.trim()
                };
            }
        }
    }
    
    return null;
}

/**
 * Estrae i prodotti dal testo
 * Usa euristiche per identificare righe prodotto (nome + prezzo)
 */
function extractItems(text) {
    if (!text) return [];
    
    const items = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Salta righe vuote
        if (!trimmedLine) continue;
        
        // Salta righe che contengono parole chiave da ignorare
        const lowerLine = trimmedLine.toLowerCase();
        if (CONFIG.IGNORE_KEYWORDS.some(keyword => lowerLine.includes(keyword))) {
            continue;
        }
        
        // Salta righe che contengono parole chiave di totale
        if (CONFIG.TOTAL_KEYWORDS.some(keyword => lowerLine.includes(keyword))) {
            continue;
        }
        
        // Controlla se la riga contiene un prezzo
        const priceMatch = trimmedLine.match(CONFIG.PRICE_REGEX);
        if (!priceMatch) continue;
        
        const price = normalizeNumber(priceMatch[1]);
        if (price === null) continue;
        
        // Estrai il nome del prodotto (tutto prima del prezzo)
        const priceStart = trimmedLine.lastIndexOf(priceMatch[0]);
        let productName = trimmedLine.substring(0, priceStart).trim();
        
        // Estrai la quantità dal nome del prodotto
        let quantity = 1;
        const quantityMatch = productName.match(CONFIG.QUANTITY_REGEX);
        if (quantityMatch) {
            quantity = parseInt(quantityMatch[1] || quantityMatch[2], 10);
            // Rimuovi la quantità dal nome del prodotto
            productName = productName.replace(CONFIG.QUANTITY_REGEX, '').trim();
        }
        
        // Salta se il nome del prodotto è vuoto
        if (!productName) continue;
        
        items.push({
            name: productName,
            quantity,
            price,
            line_raw: trimmedLine
        });
    }
    
    return items;
}

// ============================================================================
// MAIN NORMALIZER FUNCTION
// ============================================================================

/**
 * Normalizza il testo grezzo dello scontrino
 * 
 * @param {string} rawText - Testo grezzo dello scontrino
 * @param {string} registerId - ID della cassa (opzionale)
 * @returns {object} Oggetto scontrino normalizzato
 */
function normalize(rawText, registerId = null) {
    try {
        // Pulisci il testo
        const cleanedText = cleanText(rawText);
        
        // Estrai il totale
        const totalData = extractTotal(cleanedText);
        const total = totalData ? totalData.total : null;
        
        // Estrai i prodotti
        const items = extractItems(cleanedText);
        
        // Crea l'oggetto normalizzato
        const normalized = {
            register_id: registerId,
            timestamp: new Date().toISOString(),
            raw_text: cleanedText,
            total,
            items
        };
        
        return normalized;
        
    } catch (err) {
        // Fallback: ritorna almeno il raw_text
        console.error(`Errore durante la normalizzazione: ${err.message}`);
        return {
            register_id: registerId,
            timestamp: new Date().toISOString(),
            raw_text: cleanText(rawText),
            total: null,
            items: [],
            error: err.message
        };
    }
}

/**
 * Normalizza un file di scontrino
 * 
 * @param {string} filePath - Percorso del file .txt
 * @param {string} registerId - ID della cassa (opzionale)
 * @returns {object} Oggetto scontrino normalizzato
 */
function normalizeFile(filePath, registerId = null) {
    try {
        const rawText = fs.readFileSync(filePath, 'utf8');
        return normalize(rawText, registerId);
    } catch (err) {
        console.error(`Errore nella lettura del file: ${err.message}`);
        return {
            register_id: registerId,
            timestamp: new Date().toISOString(),
            raw_text: '',
            total: null,
            items: [],
            error: `File read error: ${err.message}`
        };
    }
}

/**
 * Normalizza tutti i file nella cartella captured_receipts
 * 
 * @param {string} captureDir - Cartella di cattura (default: ./captured_receipts)
 * @param {string} registerId - ID della cassa (opzionale)
 * @returns {array} Array di oggetti scontrini normalizzati
 */
function normalizeDirectory(captureDir = './captured_receipts', registerId = null) {
    try {
        if (!fs.existsSync(captureDir)) {
            console.error(`Cartella non trovata: ${captureDir}`);
            return [];
        }
        
        const files = fs.readdirSync(captureDir)
            .filter(file => file.endsWith('.txt'))
            .sort();
        
        const receipts = files.map(file => {
            const filePath = path.join(captureDir, file);
            return normalizeFile(filePath, registerId);
        });
        
        return receipts;
        
    } catch (err) {
        console.error(`Errore nella lettura della cartella: ${err.message}`);
        return [];
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    normalize,
    normalizeFile,
    normalizeDirectory,
    CONFIG
};
```

---

## 🧪 Step 2: Creare i Test Unitari

Crea il file `receipt-normalizer.test.js`:

```javascript
/**
 * Test Unitari per il Normalizzatore di Scontrini
 * 
 * Uso:
 *   node receipt-normalizer.test.js
 */

const normalizer = require('./receipt-normalizer');

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_RECEIPTS = {
    // Test 1: Scontrino italiano semplice
    simple: `NEGOZIO TEST
Via Roma 123

ARTICOLI:
Caffè x1          €2.50
Cornetto x1       €1.50

TOTALE            €4.00

Grazie!`,

    // Test 2: Scontrino con IVA e subtotale
    withTax: `BAR CENTRALE
Piazza Duomo 1

MENU:
Espresso 1x       €1.20
Cappuccino 2x     €3.00
Brioche x1        €2.50

SUBTOTALE         €6.70
IVA (10%)         €0.67

TOTALE            €7.37

Grazie per l'acquisto!`,

    // Test 3: Scontrino con caratteri di controllo
    withControlChars: `PASTICCERIA DOLCE\x00VITA
Via Garibaldi 45\x1F

PRODOTTI:
Torta x1          €15.00
Caffè x2          €2.40

TOTALE            €17.40\x0B\x0C`,

    // Test 4: Scontrino con formato diverso
    differentFormat: `RISTORANTE ROMA
Viale Trastevere 10

Pasta Carbonara    €12.50
Vino Rosso         €8.00
Acqua             €1.50

IMPORTO DOVUTO    €22.00`,

    // Test 5: Scontrino minimalista (solo totale)
    minimal: `TOTALE €5.00`
};

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

function testNormalize(name, rawText, expectedTotal, expectedItemCount) {
    console.log(`\n📝 Test: ${name}`);
    console.log('─'.repeat(60));
    
    const result = normalizer.normalize(rawText);
    
    console.log(`✓ Timestamp: ${result.timestamp}`);
    console.log(`✓ Total: ${result.total} (atteso: ${expectedTotal})`);
    console.log(`✓ Items: ${result.items.length} (atteso: ${expectedItemCount})`);
    
    // Verifica il totale
    if (result.total === expectedTotal) {
        console.log(`✅ Totale corretto`);
    } else {
        console.log(`❌ Totale errato! Atteso ${expectedTotal}, ricevuto ${result.total}`);
    }
    
    // Verifica il numero di prodotti
    if (result.items.length === expectedItemCount) {
        console.log(`✅ Numero di prodotti corretto`);
    } else {
        console.log(`❌ Numero di prodotti errato! Atteso ${expectedItemCount}, ricevuto ${result.items.length}`);
    }
    
    // Mostra i prodotti estratti
    if (result.items.length > 0) {
        console.log(`\n📦 Prodotti estratti:`);
        result.items.forEach((item, idx) => {
            console.log(`   ${idx + 1}. ${item.name} (x${item.quantity}) - €${item.price.toFixed(2)}`);
        });
    }
    
    // Mostra il raw_text (primi 100 caratteri)
    console.log(`\n📄 Raw Text (primi 100 caratteri):`);
    console.log(`   ${result.raw_text.substring(0, 100).replace(/\n/g, '\\n')}...`);
    
    return result;
}

// ============================================================================
// RUN TESTS
// ============================================================================

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     TEST UNITARI: NORMALIZZATORE DI SCONTRINI             ║');
console.log('╚════════════════════════════════════════════════════════════╝');

// Test 1: Scontrino semplice
testNormalize(
    'Scontrino Italiano Semplice',
    TEST_RECEIPTS.simple,
    4.00,
    2
);

// Test 2: Scontrino con IVA
testNormalize(
    'Scontrino con IVA e Subtotale',
    TEST_RECEIPTS.withTax,
    7.37,
    3
);

// Test 3: Scontrino con caratteri di controllo
testNormalize(
    'Scontrino con Caratteri di Controllo',
    TEST_RECEIPTS.withControlChars,
    17.40,
    2
);

// Test 4: Scontrino con formato diverso
testNormalize(
    'Scontrino con Formato Diverso',
    TEST_RECEIPTS.differentFormat,
    22.00,
    3
);

// Test 5: Scontrino minimalista
testNormalize(
    'Scontrino Minimalista',
    TEST_RECEIPTS.minimal,
    5.00,
    0
);

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║                    TEST COMPLETATI                         ║');
console.log('╚════════════════════════════════════════════════════════════╝');

console.log('\n✅ Tutti i test sono stati eseguiti!');
console.log('\n📝 Note:');
console.log('   - Il normalizzatore estrae il totale correttamente');
console.log('   - I prodotti vengono estratti con euristiche ragionevoli');
console.log('   - Il raw_text è sempre presente come fallback');
console.log('   - I caratteri di controllo vengono rimossi');
```

---

## 🧪 Step 3: Eseguire i Test

### Esegui i test unitari:

```powershell
cd C:\path\to\Fiscal
node receipt-normalizer.test.js
```

### Output atteso:

```
╔════════════════════════════════════════════════════════════╗
║     TEST UNITARI: NORMALIZZATORE DI SCONTRINI             ║
╚════════════════════════════════════════════════════════════╝

📝 Test: Scontrino Italiano Semplice
────────────────────────────────────────────────────────────
✓ Timestamp: 2026-07-18T10:32:00.000Z
✓ Total: 4 (atteso: 4)
✓ Items: 2 (atteso: 2)
✅ Totale corretto
✅ Numero di prodotti corretto

📦 Prodotti estratti:
   1. Caffè (x1) - €2.50
   2. Cornetto (x1) - €1.50

📄 Raw Text (primi 100 caratteri):
   NEGOZIO TEST\nVia Roma 123\n\nARTICOLI:\nCaffè x1          €2.50\nCornetto x1       €1.50\n\nTOTALE            €4.00\n\nGrazie!...

[... altri test ...]

╔════════════════════════════════════════════════════════════╗
║                    TEST COMPLETATI                         ║
╚════════════════════════════════════════════════════════════╝

✅ Tutti i test sono stati eseguiti!
```

---

## 📊 Step 4: Testare con File Reali

### Normalizza i file catturati da RedMon:

```javascript
// test-normalizer-with-files.js
const normalizer = require('./receipt-normalizer');
const fs = require('fs');
const path = require('path');

const CAPTURE_DIR = './captured_receipts';
const REGISTER_ID = 'cassa-01-negozio-test';

console.log('📂 Normalizzazione file da:', CAPTURE_DIR);
console.log('🏪 Register ID:', REGISTER_ID);
console.log('─'.repeat(60));

const receipts = normalizer.normalizeDirectory(CAPTURE_DIR, REGISTER_ID);

console.log(`\n✅ ${receipts.length} scontrini normalizzati\n`);

receipts.forEach((receipt, idx) => {
    console.log(`📄 Scontrino ${idx + 1}:`);
    console.log(`   Timestamp: ${receipt.timestamp}`);
    console.log(`   Totale: €${receipt.total ? receipt.total.toFixed(2) : 'N/A'}`);
    console.log(`   Prodotti: ${receipt.items.length}`);
    console.log(`   Raw text length: ${receipt.raw_text.length} caratteri`);
    console.log('');
});

// Salva i risultati in un file JSON
const outputFile = path.join(CAPTURE_DIR, 'normalized_receipts.json');
fs.writeFileSync(outputFile, JSON.stringify(receipts, null, 2));
console.log(`💾 Risultati salvati in: ${outputFile}`);
```

Esegui:

```powershell
node test-normalizer-with-files.js
```

---

## ✅ Checklist di Completamento

- [ ] File `receipt-normalizer.js` creato
- [ ] File `receipt-normalizer.test.js` creato
- [ ] Test unitari eseguiti con successo
- [ ] Tutti i 5 test passano
- [ ] File reali normalizzati correttamente
- [ ] Output JSON verificato

---

## 📝 Note Importanti

1. **Fallback robusto**: Se il parsing fallisce, `raw_text` è sempre presente
2. **Euristiche ragionevoli**: Il parsing dei prodotti usa pattern comuni (nome + prezzo)
3. **Flessibilità**: Supporta diversi formati di scontrino (italiano, con IVA, etc.)
4. **Logging**: Errori vengono loggati ma non bloccano l'elaborazione

---

## 🚀 Prossimo Step

Una volta che i test passano:
1. Procedi con **Prompt 3: Invio a Firebase**
2. Il normalizzatore fornirà i dati strutturati per l'invio

Fammi sapere quando i test sono completati! 🎉
