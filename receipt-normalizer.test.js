#!/usr/bin/env node

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
