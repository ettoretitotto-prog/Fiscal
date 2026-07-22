#!/usr/bin/env node

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
    TOTAL_KEYWORDS: ['totale', 'total', 'importo', 'amount', 'dovuto', 'da pagare', 'tot', 'documento'],
    
    // Parole chiave per identificare righe da ignorare (riepiloghi/tasse/pagamenti)
    IGNORE_KEYWORDS: [
        'iva', 'tasse', 'sconto', 'subtotale', 'subtotal', 'imponibile',
        'contanti', 'contante', 'carta', 'bancomat', 'credito', 'debito',
        'pagamento', 'resto', 'cambio', 'euro', 'valuta',
        'documento non fiscale', 'sc.nr', 'scontrino n'
    ],
    
    // Regex per estrarre prezzo (€ o numero con virgola/punto, anche a fine riga con spazi)
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
 * Rimuove residui di comandi ESC/POS non filtrati completamente dal capture-service.
 * Alcuni gestionali di cassa (es. "Scontrino Etico") inviano sequenze di comando
 * come ESC @ (reset), ESC t (codepage), ESC ! (stile stampa) il cui byte ESC (0x1B)
 * viene rimosso a monte, ma il carattere immediatamente successivo (es. "@", "t", "!")
 * resta incollato al testo reale, producendo righe come "@ta!Test 1" o "a1 x Caffe".
 */
function stripEscPosResiduals(text) {
    if (!text) return '';
    
    const lines = text.split('\n').map(line => {
        let cleaned = line;
        
        // Rimuovi sequenze di residui tipici a inizio riga: combinazioni di
        // lettere singole/punteggiatura di comando (@, t, !, a) seguite da testo,
        // ripetute più volte consecutivamente (es. "@ta!Test" -> "Test").
        cleaned = cleaned.replace(/^([@!]|(?<![a-zA-Z])[a-z](?=[A-Z!@]))+/g, '');
        
        // Rimuovi un singolo "!" isolato a inizio riga (separatore/comando), 
        // ma NON se la riga è tutta di separatori tipo "!----" (gestito da riga vuota dopo trim)
        cleaned = cleaned.replace(/^!+/, '');
        
        // Rimuovi prefisso residuo "a" attaccato subito prima di un pattern quantità
        // es. "a1 x Caffe" -> "1 x Caffe"
        cleaned = cleaned.replace(/^a(\d+\s*x\b)/i, '$1');
        
        // Rimuovi prefisso residuo "a" attaccato prima di una parola maiuscola
        // es. "aEURO" -> "EURO"
        cleaned = cleaned.replace(/^a(?=[A-Z])/, '');
        
        return cleaned;
    });
    
    return lines.join('\n');
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
    
    // ======================================================================
    // FALLBACK: nessuna riga keyword ha matchato.
    // Cerca l'ultimo importo in formato "€ X.XX" o "X.XX" in TUTTO il testo,
    // prendendo il valore più probabile di totale (l'ultimo numero con €).
    // ======================================================================
    const allPrices = [];
    for (const line of lines) {
        const match = line.match(CONFIG.PRICE_REGEX);
        if (match) {
            const total = normalizeNumber(match[1]);
            if (total !== null) {
                allPrices.push({
                    total,
                    line_raw: line.trim()
                });
            }
        }
    }
    
    if (allPrices.length > 0) {
        // Prendi l'ultimo importo - è probabilmente il totale
        const last = allPrices[allPrices.length - 1];
        return last;
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
        let cleanedText = cleanText(rawText);
        
        // Rimuovi residui di comandi ESC/POS non filtrati (es. "@ta!Test", "a1 x Caffe")
        cleanedText = stripEscPosResiduals(cleanedText);
        
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
