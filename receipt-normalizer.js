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
const iconv = require('iconv-lite');

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
        'documento non fiscale', 'sc.nr', 'scontrino n',
        'test'  // Scontrinoetico scrive "Test 1" come testata
    ],
    
    // Parole chiave per identificare METODI DI PAGAMENTO / metadata che NON devono
    // essere considerati nomi di prodotto anche se appaiono vicino a prezzi.
    PAYMENT_KEYWORDS: ['contanti','contante','cash','carta','bancomat','visa','mastercard','pagamento','pagato','resto','credito','debito'],
    
    // Regex per estrarre prezzo (accetta simboli euro o artefatti come '¬', o parole 'eur','euro').
    // Tolleriamo un'eventuale cifra finale spuria introdotta da OCR/RTF (es. 20.001 -> 20.00).
    PRICE_REGEX: /(?:[€¬]|eur|euro)?\s*(\d+[.,]\s*\d{2})(?:\d)?\s*$/i,
    PRICE_CANDIDATE_REGEX: /(?:[€¬]|eur|euro)?\s*(\d+[.,]\s*\d{2})(?:\d)?/gi,
    CODE_LINE_REGEX: /^(?:\d+\s+)?(\d{3,5})\b/,
    
    // Regex per estrarre quantità (es. "x1", "x2", "1x", "2 pz")
    QUANTITY_REGEX: /\b(\d+)\s*x\b|\bx\s*(\d+)\b|\b(\d+)\s*(?:pz|pcs|pc)\b/i,

    // Checklist / validation patterns used to verify presence of mandatory fields
    CHECKLIST_PATTERNS: {
        PIVA_REGEX: /\b\d{11}\b/, // Italian VAT number
        DATE_REGEX: /\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/, // dates like 24/07/2026 or 2026-07-24
        TIME_REGEX: /\b\d{1,2}:\d{2}\b/, // hh:mm
        IVA_RATE_REGEX: /\bIVA\b[^\n\d]*(\d{1,2})%|\b(\d{1,2})\s*%/i,
        RT_SERIAL_REGEX: /\b(matricola|mat\.?|registratore telematico|registratore)\b[\s:\-]{0,10}([A-Z0-9\-\/]{4,})/i,
        ADDRESS_HINTS: /\b(via|viale|piazza|p\.?zza|strada|corso|loc\.|localita|km\b)\b/i,
        DOCUMENT_COMMERCIAL_PHRASE: /documento commerciale di vendita|documento commerciale|documento di vendita/i,
        SHOP_NAME_HINTS: /\b(s\.r\.l|srl|s\.p\.a|spa|snc|sas|ditta|ristorante|bar|pizzeria|negozio|supermercato)\b/i
    }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Pulisce il testo da caratteri di controllo residui
 * Include anche processing intelligente di \r (carriage return).
 * 
 * Danea Easyfatt usa CR per sovrapporre testo nella stessa riga, ma gli spazi
 * dopo il CR non devono cancellare i caratteri precedenti non-spazio.
 * Invece di simulare una stampante termica (che sovrascrive tutto),
 * uniamo le due parti carattere per carattere: dove la seconda parte ha
 * uno spazio, preserviamo il carattere della prima parte.
 */
function cleanText(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Rimuovi caratteri di controllo non-CR (eccetto newline e tab)
    let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Elabora CR in modo intelligente: CR torna a inizio riga,
    // ma gli spazi vuoti nella seconda parte non sovrascrivono i caratteri
    // della prima parte (che vengono preservati).
    const result = [];
    let currentLine = '';
    
    for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        const code = cleaned.charCodeAt(i);
        
        if (code === 0x0d) {
            // Check if next char is LF (CR+LF = newline)
            if (i + 1 < cleaned.length && cleaned.charCodeAt(i + 1) === 0x0a) {
                // CR+LF: finish current line
                result.push(currentLine.trimEnd());
                currentLine = '';
                i++; // skip LF
            } else {
                // CR alone: trova il testo dopo il CR fino al prossimo \n o \r
                // e uniscilo alla riga corrente senza sovrascrivere con spazi
                let afterCR = '';
                let j = i + 1;
                while (j < cleaned.length && cleaned[j] !== '\n' && cleaned.charCodeAt(j) !== 0x0d) {
                    afterCR += cleaned[j];
                    j++;
                }
                
                // Merge: se afterCR ha caratteri non-spazio, sovrascrivi
                // quelli nella stessa posizione in currentLine
                if (afterCR.length > 0) {
                    let merged = currentLine.split('');
                    for (let k = 0; k < afterCR.length; k++) {
                        if (k < merged.length) {
                            // Sovrascrivi SOLO se afterCR[k] non è spazio
                            // (preserva caratteri significativi della prima parte)
                            if (afterCR[k] !== ' ') {
                                merged[k] = afterCR[k];
                            }
                        } else {
                            merged.push(afterCR[k]);
                        }
                    }
                    currentLine = merged.join('');
                }
                
                // Salta il testo afterCR già processato
                i = j - 1;
            }
        } else if (code === 0x0a) {
            // LF alone: newline
            result.push(currentLine.trimEnd());
            currentLine = '';
        } else {
            // Regular character
            currentLine += ch;
        }
    }
    if (currentLine.length > 0) {
        result.push(currentLine.trimEnd());
    }
    
    cleaned = result.join('\n');
    
    // Rimuovi righe vuote multiple (max 2 newline consecutivi)
    cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');
    
    // Trim generale
    cleaned = cleaned.trim();
    
    return cleaned;
}

/**
 * Preprocess RTF-like content: convert RTF hex escapes (\'hh) to proper
 * characters using Windows-1252 decoding, normalize common RTF controls
 * (\par, \line, \tab) to newlines/tabs, and return a UTF-8 string.
 */
function preprocessRTF(text) {
    if (!text || typeof text !== 'string') return text;

    let s = text;

    const finalReceiptIndex = s.search(/SCONTRINO FINALE:/i);
    if (finalReceiptIndex >= 0) {
        const fileSectionIndex = s.search(/\nFILE:/i);
        s = s.slice(finalReceiptIndex, fileSectionIndex >= 0 ? fileSectionIndex : undefined);
    }

    s = s.replace(/\\par[d]?/gi, '\n').replace(/\\line/gi, '\n').replace(/\\tab/gi, '\t');

    const bytes = [];
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '\\' && s[i + 1] === "'" && i + 3 < s.length) {
            const h1 = s[i + 2];
            const h2 = s[i + 3];
            if (/^[0-9A-Fa-f]$/.test(h1) && /^[0-9A-Fa-f]$/.test(h2)) {
                bytes.push(parseInt(h1 + h2, 16));
                i += 3;
                continue;
            }
        }
        bytes.push(s.charCodeAt(i));
    }

    try {
        let decoded = iconv.decode(Buffer.from(bytes), 'windows-1252');

        decoded = decoded.replace(/\u00A0/g, ' ');
        decoded = decoded.replace(/\u00AD/g, '');
        decoded = decoded.replace(/¬/g, '€');
        decoded = decoded.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
        decoded = decoded.replace(/[\u201C\u201D\u201E\u201F]/g, '"');
        decoded = decoded.replace(/[_\-]{3,}/g, '-');
        decoded = decoded.replace(/[{}]/g, ' ');
        decoded = decoded.replace(/\\[a-z]+-?\d*\s?/gi, ' ');
        decoded = decoded.replace(/\b(?:e?ftab\d*|tightenfactor\d*|ightenfactor\d*|cf\d+|cb\d+|fs\d+|fsmilli\d+|pard|partightenfactor|deftab)\b/gi, ' ');
        decoded = decoded.replace(/\\/g, ' ');
        decoded = decoded.replace(/[ \t]{2,}/g, ' ');
        decoded = decoded.replace(/\n{3,}/g, '\n\n');

        return decoded.trim();
    } catch (err) {
        return s.replace(/\\'([0-9A-Fa-f]{2})/g, (m, p1) => String.fromCharCode(parseInt(p1, 16)));
    }
}

/**
 * Sanitize a product name reconstructed from a code-start block.
 * Removes tiny noisy tokens and preserves words and quoted phrases.
 * Preserva token numerici significativi (es. "150", "80", "90", "cm", "°").
 */
function sanitizeCodeBlockName(name) {
    if (!name || typeof name !== 'string') return '';
    // normalize whitespace
    let s = name.replace(/\s+/g, ' ').trim();
    // remove common stray punctuation sequences
    s = s.replace(/[\u0000-\u001F]/g, ' ');

    const tokens = s.split(/\s+/).filter(tok => {
        // Skip tokens that are just single punctuation/symbols (unless it's °)
        if (/^[\.,:;!?\-=+\/\\'"]+$/.test(tok)) return false;
        // keep quoted tokens like "sole" or "Arcadia"
        if (/^".*"$/.test(tok) && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(tok)) return true;
        // keep tokens that contain at least two letters
        if (/[A-Za-zÀ-ÖØ-öø-ÿ].*[A-Za-zÀ-ÖØ-öø-ÿ]/.test(tok)) return true;
        // keep tokens longer than 2 (to preserve words like '150' or 'cm')
        // IMPORTANTE: per Danea, token come "150", "80", "90", "cm" sono significativi
        if (tok.length > 2) return true;
        // keep single-letter tokens that are units like "cm", "mm", "kg", "°" etc.
        // Also keep 2-letter tokens (cm, kg, mm, pz)
        if (tok.length >= 2 && /^[a-zA-Z°0-9]+$/.test(tok)) return true;
        // keep numeric tokens of any length (preserva misure numeriche)
        if (/^\d+$/.test(tok)) return true;
        // keep "°" symbol
        if (tok === '°') return true;
        return false;
    });

    // Remove trailing price tokens accidentally left in the name, e.g. '€ 31,00' or '31.00'
    while (tokens.length > 0) {
        const last = tokens[tokens.length - 1];
        if (/^€?\s*\d+[.,]\s*\d{2}$/.test(last) || /^\d+[.,]\s*\d{2}$/.test(last)) {
            tokens.pop();
            continue;
        }
        // Also if last token is '€' or common currency artifacts
        if (/^[€¬]$/.test(last) || /^(eur|euro)$/i.test(last)) { tokens.pop(); continue; }
        break;
    }

    // Additional token-level cleanup to remove noisy OCR residues while
    // preserving meaningful words and quoted phrases.
    const cleanedTokens = tokens.map(tok => {
        // preserve quoted tokens entirely (but trim surrounding punctuation)
        if (/^".*"$/.test(tok)) return tok.replace(/^"|"$/g, '');

        // Se il token è puramente numerico (es. "150", "80"), preservalo
        if (/^\d+$/.test(tok)) return tok;
        // Se il token è un'unità di misura (cm, mm, kg, pz), preservalo
        if (/^[a-zA-Z]{1,3}$/.test(tok)) return tok;
        if (tok === '°') return tok;

        // remove non-letter characters (keep accents), remove embedded digits
        let c = tok.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\-\"]+/g, '');
        c = c.replace(/\d+/g, '');
        c = c.replace(/^[-\"]+|[-\"]+$/g, '');
        return c;
    }).filter(c => {
        if (!c) return false;
        // keep quoted-like tokens or tokens with at least two letters
        if (/^".*"$/.test(c)) return true;
        if (/[A-Za-zÀ-ÖØ-öø-ÿ].*[A-Za-zÀ-ÖØ-öø-ÿ]/.test(c)) return true;
        // also keep tokens of length >=3 (to preserve short meaningful words)
        if (c.length >= 3) return true;
        // keep numeric tokens e misure
        if (/^\d+$/.test(c)) return true;
        if (/^[a-zA-Z°]{1,3}$/.test(c)) return true;
        if (c === '°') return true;
        return false;
    }).map(c => c.replace(/\s{2,}/g, ' ').trim());

    return cleanedTokens.join(' ').replace(/\s{2,}/g, ' ').trim();
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
        // Cattura sia sequenze alternate (@, t, a, !) sia gruppi di lettere
        // minuscole seguite da ! (tipo "ta!") che sono residui ESC/POS.
        cleaned = cleaned.replace(/^([@!]|(?<![a-zA-Z])[a-z](?=[A-Z!@a-z]))+/g, '');
        // Additional pass: remove sequences of lowercase letters terminated by !
        // that start the line (e.g. "ta!Test" -> "Test")
        cleaned = cleaned.replace(/^[a-z]+!/, '');
        // Remove trailing leftover from @ removal at start
        cleaned = cleaned.replace(/^[@!]+/, '');

        // Rimuovi prefisso residuo "a" attaccato subito prima di un pattern quantità
        // es. "a1 x Caffe" -> "1 x Caffe"
        cleaned = cleaned.replace(/^a(\d+\s*x\b)/i, '$1');

        // Rimuovi prefisso residuo "a" attaccato prima di una parola maiuscola
        // es. "aEURO" -> "EURO"
        cleaned = cleaned.replace(/^a(?=[A-Z])/, '');

        // Rimuovi anche "a" prima di "Test" (Scontrinoetico)
        cleaned = cleaned.replace(/^a(?=[A-Za-z])/, '');

        // Remove stray '¬' characters and other isolated separators often introduced
        // by conversion or OCR. Convert them to space so tokenization works.
        cleaned = cleaned.replace(/[¬¦|··\u00B6]/g, ' ');

        // Remove runs of non-printable punctuation that confuse parsing
        cleaned = cleaned.replace(/[^\w\s\p{P}]+/gu, ' ');
        
        return cleaned;
    });
    
    return lines.join('\n');
}

/**
 * Normalizza un numero (converte virgola in punto)
 */
function normalizeNumber(str) {
    if (!str) return null;
    const num = parseFloat(String(str).replace(/\s+/g, '').replace(',', '.'));
    return isNaN(num) ? null : num;
}

function extractPriceCandidates(text) {
    if (!text || typeof text !== 'string') return [];
    const matches = [];
    const regex = new RegExp(CONFIG.PRICE_CANDIDATE_REGEX.source, CONFIG.PRICE_CANDIDATE_REGEX.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
        const value = normalizeNumber(match[1]);
        if (value !== null) {
            matches.push({ value, token: match[0], start: match.index, end: match.index + match[0].length });
        }
    }
    return matches;
}

function extractTrailingPrice(text) {
    const candidates = extractPriceCandidates(text);
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

function sanitizeProductCandidate(name) {
    if (!name || typeof name !== 'string') return '';
    const codeMatch = name.match(CONFIG.CODE_LINE_REGEX);
    const code = codeMatch ? codeMatch[1] : '';

    let cleaned = name
        .replace(CONFIG.PRICE_CANDIDATE_REGEX, ' ')
        .replace(/\b(?:Subtotale|Totale|IVA\s*\d+%?)\b.*$/i, ' ')
        .replace(/\b(?:QuantitP|Quantita|Prezzo|Importo|Codice|Descrizione|Destinatario|Vendita al banco|SCONTRINO FINALE)\b/gi, ' ')
        .replace(/\b(?:Documento creato con|Danea Easyfatt|dimostrativa|Pag\d+)\b.*$/gi, ' ')
        .replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, ' ')
        .replace(/\b(?:e?ftab\d*|tightenfactor\d*|ightenfactor\d*|cf\d+|cb\d+|fs\d+|fsmilli\d+|pard|partightenfactor|deftab)\b/gi, ' ')
        .replace(/[{}\\]/g, ' ')
        .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])1(?=\s|$)/g, '$1 ')
        .replace(/\b\d+\s*[x×]\s*/gi, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

    if (code) {
        cleaned = cleaned.replace(new RegExp(`^${code}\b\s*`), '').trim();
    }

    cleaned = sanitizeCodeBlockName(cleaned);
    if (code) cleaned = `${code} ${cleaned}`.trim();
    return cleaned.trim();
}

/**
 * Estrae il totale dal testo
 * Cerca una riga che contiene una parola chiave di totale seguita da un numero
 */
function extractTotal(text) {
    if (!text) return null;
    
    const lines = text.split('\n');
    
    const exactTotalCandidates = [];
    const genericTotalCandidates = [];

    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        const lowerLine = line.toLowerCase();

        const isSubtotalLine = /\bsub[\s-]?tot(?:ale|al)?\b/i.test(lowerLine);
        if (isSubtotalLine) {
            continue;
        }

        const hasTotalKeyword = CONFIG.TOTAL_KEYWORDS.some(keyword => lowerLine.includes(keyword));
        if (!hasTotalKeyword) continue;

        const priceSource = [line, lines[idx + 1] || '', lines[idx + 2] || '']
            .map(part => extractTrailingPrice(part))
            .find(Boolean);

        if (priceSource) {
            const candidate = {
                total: priceSource.value,
                line_raw: line.trim()
            };
            if (/\b(?:totale|total)\b/i.test(lowerLine)) {
                exactTotalCandidates.push(candidate);
            } else {
                genericTotalCandidates.push(candidate);
            }
        }
    }

    if (exactTotalCandidates.length > 0) {
        return exactTotalCandidates[exactTotalCandidates.length - 1];
    }

    if (genericTotalCandidates.length > 0) {
        return genericTotalCandidates[genericTotalCandidates.length - 1];
    }
    
    const allPrices = [];
    for (const line of lines) {
        const trailingPrice = extractTrailingPrice(line);
        if (trailingPrice) {
            allPrices.push({
                total: trailingPrice.value,
                line_raw: line.trim()
            });
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
 * Estrae il subtotale (se presente) dal testo
 */
function extractSubtotal(text) {
    if (!text) return null;
    const lines = text.split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        const lower = line.toLowerCase();
        if (/\bsub[\s-]?tot(?:ale|al)?\b/i.test(lower) || lower.includes('subtotale') || lower.includes('subtotal')) {
            const priceSource = [line, lines[idx + 1] || '', lines[idx + 2] || '']
                .map(part => extractTrailingPrice(part))
                .find(Boolean);
            if (priceSource) return priceSource.value;
        }
    }
    return null;
}

/**
 * Reconcilia gli items estratti confrontandoli col subtotale/totale
 * Applica semplici heuristics: rimuove items che derivano da payment blocks,
 * prova a riassociare price-only blocks al prodotto precedente, e, se necessario,
 * cerca una combinazione di items che corrisponda al subtotale (small subset-sum).
 */
function getItemLineTotal(item) {
    const lineTotal = Number(item.line_total ?? item.lineTotal);
    if (Number.isFinite(lineTotal) && lineTotal > 0) return lineTotal;
    const price = Number(item.price);
    return Number.isFinite(price) ? price : 0;
}

function reconcileItems(items, text, reportedTotal) {
    const result = { items: items.slice(), adjusted: false, reason: null };

    // `price` nei parser storici rappresenta l'importo della riga, non il prezzo unitario.
    const sum = result.items.reduce((s, it) => s + getItemLineTotal(it), 0);
    const subtotal = extractSubtotal(text) || reportedTotal || null;

    if (subtotal === null) {
        // nothing to reconcile against
        return result;
    }

    // If sums match within rounding, ok
    if (Math.abs(sum - subtotal) < 0.005) return result;

    // Step 1: drop items that clearly contain payment keywords
    const before = result.items.length;
    result.items = result.items.filter(it => {
        const ln = (it.name || '').toLowerCase();
        return !CONFIG.PAYMENT_KEYWORDS.some(k => ln.includes(k));
    });
    if (result.items.length !== before) {
        result.adjusted = true; result.reason = 'removed_payment_items';
    }

    const sum2 = result.items.reduce((s, it) => s + getItemLineTotal(it), 0);
    if (Math.abs(sum2 - subtotal) < 0.005) return result;

    // Step 2: try to reassign price-only occurrences: scan text for lines with price
    const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
    const priceLines = [];
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (CONFIG.PRICE_REGEX.test(l)) priceLines.push({ line: l, index: i });
    }

    // If there are more price lines than items, try to associate from top-down skipping payment lines
    if (priceLines.length > result.items.length) {
        // build candidate items from nearby product-like lines
        const newItems = [];
        for (let p of priceLines) {
            // get price value
            const m = p.line.match(CONFIG.PRICE_REGEX);
            const price = m ? normalizeNumber(m[1]) : null;
            if (price === null) continue;
            // look backwards for nearest non-payment line with letters
            let name = null;
            for (let j = p.index - 1; j >= Math.max(0, p.index - 3); j--) {
                const cand = lines[j];
                const lc = cand.toLowerCase();
                if (CONFIG.PAYMENT_KEYWORDS.some(k => lc.includes(k))) break; // stop if payment encountered
                if (/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(cand)) { name = cand; break; }
            }
            if (name) newItems.push({ name: sanitizeCodeBlockName(name), quantity: 1, price, line_raw: p.line });
        }
        if (newItems.length > 0) {
            // replace items with the new inferred ones and check sum
            const sumNew = newItems.reduce((s, it) => s + getItemLineTotal(it), 0);
            if (Math.abs(sumNew - subtotal) < 0.005) {
                result.items = newItems; result.adjusted = true; result.reason = 'reassociated_prices';
                return result;
            }
        }
    }

    // Step 3: small subset-sum attempt (only up to N items to avoid expensive compute)
    const vals = result.items.map(it => Math.round(getItemLineTotal(it) * 100));
    const target = Math.round(subtotal * 100);
    const N = vals.length;
    if (N <= 20) {
        // bitmask search
        let foundMask = null;
        const limit = 1 << N;
        for (let mask = 1; mask < limit; mask++) {
            let s = 0;
            for (let i = 0; i < N; i++) if (mask & (1 << i)) s += vals[i];
            if (s === target) { foundMask = mask; break; }
        }
        if (foundMask !== null) {
            const filtered = [];
            for (let i = 0; i < N; i++) if (foundMask & (1 << i)) filtered.push(result.items[i]);
            result.items = filtered; result.adjusted = true; result.reason = 'subset_sum_filtered';
            return result;
        }
    }

    // If nothing matched, return with adjusted flag possibly set earlier
    return result;
}

/**
 * Estrae i prodotti dal testo
 * Usa euristiche per identificare righe prodotto (nome + prezzo)
 */
function extractItems(text) {
    if (!text) return [];

    const items = [];
    const physLines = text.split('\n').map(l => l.trim());

    const logicalBlocks = [];
    let buffer = '';
    let physBuffer = [];
    const codeStartRe = /^\s*\d{2,5}\b/;

    for (const line of physLines) {
        if (!line) continue;

        if (codeStartRe.test(line)) {
            if (buffer) {
                logicalBlocks.push({ text: buffer.trim(), physLines: physBuffer.slice() });
            }
            buffer = line;
            physBuffer = [line];
            if (CONFIG.PRICE_REGEX.test(line)) {
                logicalBlocks.push({ text: buffer.trim(), physLines: physBuffer.slice() });
                buffer = '';
                physBuffer = [];
            }
            continue;
        }

        if (!buffer) {
            buffer = line;
            physBuffer = [line];
        } else {
            buffer += ' ' + line;
            physBuffer.push(line);
        }

        if (CONFIG.PRICE_REGEX.test(buffer)) {
            logicalBlocks.push({ text: buffer.trim(), physLines: physBuffer.slice() });
            buffer = '';
            physBuffer = [];
        }
    }

    if (buffer) {
        logicalBlocks.push({ text: buffer.trim(), physLines: physBuffer.slice() });
    }

    for (let i = 1; i < logicalBlocks.length; i++) {
        const prev = logicalBlocks[i - 1];
        const cur = logicalBlocks[i];
        const prevHasPrice = CONFIG.PRICE_REGEX.test(prev.text);
        const curHasPrice = CONFIG.PRICE_REGEX.test(cur.text);
        if (!prevHasPrice && curHasPrice) {
            const prevLower = (prev.text || '').toLowerCase();
            const prevIsPayment = CONFIG.PAYMENT_KEYWORDS.some(k => prevLower.includes(k));
            const prevIsHeader = !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(prev.text || '') || 
                                 CONFIG.IGNORE_KEYWORDS.some(k => prevLower.includes(k)) ||
                                 /^[\d\/\s\-:]+$/.test(prev.text || '');
            const prevHasLetters = /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(prev.text || '');
            
            if (prevIsPayment) {
                let attached = false;
                for (let j = i - 2; j >= 0; j--) {
                    const candidate = logicalBlocks[j];
                    if (CONFIG.PRICE_REGEX.test(candidate.text) || /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(candidate.text)) {
                        candidate.text = (candidate.text + ' ' + cur.text).trim();
                        candidate.physLines = (candidate.physLines || []).concat(cur.physLines || []);
                        logicalBlocks.splice(i, 1);
                        attached = true;
                        break;
                    }
                }
                if (!attached) {
                    prev._isPayment = true;
                    logicalBlocks.splice(i, 1);
                }
                i--;
                continue;
            }
            
            if (prevIsHeader && !prevHasLetters) {
                continue;
            }

            prev.text = (prev.text + ' ' + cur.text).trim();
            prev.physLines = (prev.physLines || []).concat(cur.physLines || []);
            logicalBlocks.splice(i, 1);
            i--;
        }
    }

    for (const block of logicalBlocks) {
        const trimmedLine = block.text;
        const physBlock = block.physLines || [trimmedLine];

        if (!trimmedLine) continue;

        const blockLower = (trimmedLine || '').toLowerCase();
        if (block._isPayment || CONFIG.PAYMENT_KEYWORDS.some(k => blockLower.includes(k))) {
            continue;
        }
        
        if (CONFIG.IGNORE_KEYWORDS.some(k => blockLower.includes(k))) {
            const hasPrice = CONFIG.PRICE_REGEX.test(trimmedLine);
            if (!hasPrice) continue;
            const hasProductLetters = /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(trimmedLine.replace(CONFIG.PRICE_REGEX, ''));
            if (!hasProductLetters) continue;
        }

        const lineWithoutPrice = trimmedLine.replace(CONFIG.PRICE_REGEX, '').trim();
        if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(lineWithoutPrice) && lineWithoutPrice.length > 0) {
            continue;
        }

        let handled = false;
        for (let i = 0; i < physBlock.length; i++) {
            const pl = physBlock[i];
            if (!codeStartRe.test(pl)) continue;

            const seg = [pl];
            let priceLine = null;
            for (let j = i + 1; j < physBlock.length; j++) {
                const l = physBlock[j];
                seg.push(l);
                if (CONFIG.PRICE_REGEX.test(l)) { priceLine = l; break; }
                if (codeStartRe.test(l)) break;
            }

            if (!priceLine) {
                const joinedSeg = seg.join(' ');
                const trailingPrice = extractTrailingPrice(joinedSeg);
                if (trailingPrice) priceLine = trailingPrice.token;
            }

            let priceVal = null;
            if (priceLine) {
                const trailingPrice = extractTrailingPrice(priceLine);
                priceVal = trailingPrice ? trailingPrice.value : null;
            }

            if (priceVal === null) {
                const joined = seg.join(' ');
                const trailingPrice = extractTrailingPrice(joined);
                if (trailingPrice) priceVal = trailingPrice.value;
            }

            const lastLine = seg[seg.length - 1] || '';
            let nameLines = seg.slice(0, -1);
            if (CONFIG.PRICE_REGEX.test(lastLine)) {
                const lastWithoutPrice = lastLine.replace(CONFIG.PRICE_REGEX, '').trim();
                if (lastWithoutPrice) nameLines.push(lastWithoutPrice);
            } else {
                nameLines = seg.slice();
            }

            const productNameExact = sanitizeProductCandidate(nameLines.join(' ').replace(/\s{2,}/g, ' ').trim());
            if (priceVal !== null && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(productNameExact)) {
                items.push({ name: productNameExact, quantity: 1, price: priceVal, line_raw: seg.join(' ') });
                handled = true;
            }
        }
        if (handled) continue;

        const trailingPrice = extractTrailingPrice(trimmedLine);
        if (!trailingPrice) {
            const lowerLine = trimmedLine.toLowerCase();
            if (CONFIG.IGNORE_KEYWORDS.some(keyword => lowerLine.includes(keyword))) continue;
            if (CONFIG.TOTAL_KEYWORDS.some(keyword => lowerLine.includes(keyword))) continue;
            continue;
        }

        const price = trailingPrice.value;
        if (price === null) continue;

        const lowerLine = trimmedLine.toLowerCase();
        if (CONFIG.TOTAL_KEYWORDS.some(keyword => lowerLine.includes(keyword))) {
            continue;
        }

        let productName = trimmedLine.substring(0, trailingPrice.start).trim();

        const hasCodeLine = physBlock.some(l => codeStartRe.test(l));
        if (hasCodeLine) {
            productName = physBlock
                .map(l => l.replace(CONFIG.PRICE_REGEX, ''))
                .map(l => l.trim())
                .filter(l => l.length > 0)
                .join(' ')
                .trim();
        } else {
            const headerRe = /\b(codice|descrizione|quantit|destinatario|vendita al banco|nr\.?|del)\b/i;
            const docRe = /documento creato con|danea easyfatt|dimostrativa|tot\. documento/i;
            const codeIndex = physBlock.findIndex(l => codeStartRe.test(l));
            const candidateLines = codeIndex >= 0 ? physBlock.slice(codeIndex) : physBlock.slice();

            let parts = candidateLines
                .map(l => l.replace(CONFIG.PRICE_REGEX, '').trim())
                .filter(l => l && !/^\d+\s*$/.test(l) && !/^\W+$/.test(l))
                .filter(l => !headerRe.test(l) && !docRe.test(l));

            parts = parts.filter(l => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(l));
            const joined = parts.join(' ').replace(/\s{2,}/g, ' ').trim();
            if (joined) productName = joined;
        }

        productName = sanitizeProductCandidate(productName);

        let quantity = 1;
        const quantityMatch = trimmedLine.match(CONFIG.QUANTITY_REGEX);
        if (quantityMatch) {
            quantity = parseInt(quantityMatch[1] || quantityMatch[2] || quantityMatch[3], 10);
        }
        if (quantity === 1) {
            const qm2 = productName.match(CONFIG.QUANTITY_REGEX);
            if (qm2) {
                quantity = parseInt(qm2[1] || qm2[2] || qm2[3], 10);
                productName = productName.replace(CONFIG.QUANTITY_REGEX, '').trim();
            }
        }

        if (!productName) continue;

        items.push({ name: productName, quantity, price, line_raw: trimmedLine });
    }

    return dedupeItems(items);
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
        // Preprocess RTF-like content then clean the resulting text
        let pre = preprocessRTF(rawText);
        let cleanedText = cleanText(pre);
        
        // Rimuovi residui di comandi ESC/POS non filtrati (es. "@ta!Test", "a1 x Caffe")
        cleanedText = stripEscPosResiduals(cleanedText);
        
        // Estrai il totale
        const totalData = extractTotal(cleanedText);
        const total = totalData ? totalData.total : null;
        
        // Estrai i prodotti
        let items = extractItemsFromFinalReceipt(cleanedText);
        if (items.length === 0) {
            items = extractItems(cleanedText);
        }

        // Reconcilia items con subtotal/total per correggere errori dovuti a linee di pagamento
        const reconciliation = reconcileItems(items, cleanedText, total);
        if (reconciliation.adjusted) {
            items = reconciliation.items;
        }
        
        // Crea l'oggetto normalizzato (base)
        const normalized = {
            register_id: registerId,
            timestamp: new Date().toISOString(),
            raw_text: cleanedText,
            total,
            items
        };
        // Distinguere unit_price e line_total per ogni item
        normalized.items = normalized.items.map(it => {
            const line_total = getItemLineTotal(it);
            const unit_price = it.quantity && line_total > 0
                ? line_total / it.quantity
                : line_total;
            return {
                name: it.name,
                quantity: it.quantity || 1,
                unit_price: Number(unit_price.toFixed(2)),
                line_total: Number(line_total.toFixed(2))
            };
        });

        // Esegui la validazione della checklist e arricchisci l'output
        try {
            const checklist = validateChecklist(normalized);
            normalized.missing_fields = checklist.missing_fields;
            normalized.requires_raw_text = checklist.requires_raw_text;
            normalized.checklist_details = checklist.details;

            // If any required field is missing, ensure raw_text is preserved (fallback behavior)
            if (checklist.requires_raw_text) {
                normalized.raw_text = cleanedText; // explicit but already set
            }
        } catch (e) {
            // Non blocchiamo il parsing: log e prosegui
            console.error('Checklist validation failed:', e && e.message);
            normalized.missing_fields = [];
            normalized.requires_raw_text = false;
            normalized.checklist_details = {};
        }
        
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

// Export internals for debugging (not intended for production use)
module.exports._internals = {
    extractItems,
    extractItemsFromFinalReceipt,
    validateChecklist,
    preprocessRTF,
    extractPriceCandidates,
    extractTrailingPrice,
    sanitizeProductCandidate,
    dedupeItems,
    // buildLogicalBlocks: helper to inspect how physical lines are grouped
    buildLogicalBlocks: function(text) {
        const physLines = (text || '').split('\n').map(l => l.trim());
        const logicalBlocks = [];
        let buffer = '';
        let physBuffer = [];
        const codeStartRe = /^\s*\d{2,5}\b/;
        for (const line of physLines) {
            if (!line) continue;
            if (codeStartRe.test(line)) {
                if (buffer) logicalBlocks.push({ text: buffer.trim(), physLines: physBuffer.slice() });
                buffer = line; physBuffer = [line];
                if (CONFIG.PRICE_REGEX.test(line)) { logicalBlocks.push({ text: buffer.trim(), physLines: physBuffer.slice() }); buffer = ''; physBuffer = []; }
                continue;
            }
            if (!buffer) { buffer = line; physBuffer = [line]; }
            else { buffer += ' ' + line; physBuffer.push(line); }
            if (CONFIG.PRICE_REGEX.test(buffer)) { logicalBlocks.push({ text: buffer.trim(), physLines: physBuffer.slice() }); buffer = ''; physBuffer = []; }
        }
        if (buffer) logicalBlocks.push({ text: buffer.trim(), physLines: physBuffer.slice() });
        for (let i = 1; i < logicalBlocks.length; i++) {
            const prev = logicalBlocks[i-1]; const cur = logicalBlocks[i];
            const prevHasPrice = CONFIG.PRICE_REGEX.test(prev.text); const curHasPrice = CONFIG.PRICE_REGEX.test(cur.text);
            if (!prevHasPrice && curHasPrice) { prev.text = (prev.text + ' ' + cur.text).trim(); prev.physLines = (prev.physLines || []).concat(cur.physLines || []); logicalBlocks.splice(i,1); i--; }
        }
        return logicalBlocks;
    }
};

/**
 * Valida la checklist richiesta per il documento commerciale.
 * Restituisce un oggetto { missing_fields: [], requires_raw_text: boolean, details: {} }
 */
function validateChecklist(normalized) {
    const details = {};
    const missing = [];
    const text = (normalized.raw_text || '').toString();

    // 1) Shop name / business name: look for common business tokens or uppercase lines
    const shopName = (() => {
        if (normalized.shop_name) return normalized.shop_name;
        // heuristic: first non-empty line that contains letters and either business tokens or all-caps
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < Math.min(6, lines.length); i++) {
            const ln = lines[i];
            if (CONFIG.CHECKLIST_PATTERNS.SHOP_NAME_HINTS.test(ln) || /^[A-Z\s\d\-\.]{4,}$/.test(ln)) return ln;
        }
        return null;
    })();
    details.shop_name = !!shopName;
    if (!shopName) missing.push('shop_name');

    // 2) Partita IVA (P.IVA)
    const pivaMatch = text.match(CONFIG.CHECKLIST_PATTERNS.PIVA_REGEX);
    details.piva = !!pivaMatch;
    if (!pivaMatch) missing.push('piva');

    // 3) Address
    const addressHint = CONFIG.CHECKLIST_PATTERNS.ADDRESS_HINTS.test(text);
    details.address = addressHint;
    if (!addressHint) missing.push('address');

    // 4) Date and time
    const dateMatch = text.match(CONFIG.CHECKLIST_PATTERNS.DATE_REGEX);
    const timeMatch = text.match(CONFIG.CHECKLIST_PATTERNS.TIME_REGEX);
    details.date = !!dateMatch;
    details.time = !!timeMatch;
    if (!dateMatch) missing.push('date');
    if (!timeMatch) missing.push('time');

    // 5) Description of what was bought (at least 1 item or items list)
    const hasItems = Array.isArray(normalized.items) && normalized.items.length > 0;
    details.items_present = hasItems;
    if (!hasItems) missing.push('items_description');

    // 6) IVA rates applied (look for % or 'IVA')
    const ivaMatch = text.match(CONFIG.CHECKLIST_PATTERNS.IVA_RATE_REGEX);
    details.iva_rates = !!ivaMatch;
    if (!ivaMatch) missing.push('iva_rates');

    // 7) Total amount
    details.total = typeof normalized.total === 'number' && !isNaN(normalized.total);
    if (!details.total) missing.push('total');

    // 8) Payment method
    const paymentFound = CONFIG.PAYMENT_KEYWORDS.some(k => text.toLowerCase().includes(k));
    details.payment_method = paymentFound;
    if (!paymentFound) missing.push('payment_method');

    // 9) Registratore telematico serial/matricola
    const rtMatch = text.match(CONFIG.CHECKLIST_PATTERNS.RT_SERIAL_REGEX);
    details.rt_serial = !!rtMatch;
    if (!rtMatch) missing.push('rt_serial');

    // 10) Phrase 'documento commerciale'
    const docPhrase = CONFIG.CHECKLIST_PATTERNS.DOCUMENT_COMMERCIAL_PHRASE.test(text);
    details.document_phrase = docPhrase;
    if (!docPhrase) missing.push('document_phrase');

    // Build result
    const requires_raw_text = missing.length > 0;
    return { missing_fields: missing, requires_raw_text, details };
}

function dedupeItems(items) {
    // Righe identiche possono rappresentare acquisti distinti: non deduplicarle.
    // Il parser deve preservare il dettaglio fiscale originale.
    return Array.isArray(items) ? items.slice() : [];
}

function extractItemsFromFinalReceipt(text) {
    if (!/SCONTRINO FINALE:/i.test(text || '')) return [];

    const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
    const items = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/^\d{3,5}\b/.test(line)) continue;

        let price = null;
        let quantity = 1;
        for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
            const next = lines[j];
            const trailingPrice = extractTrailingPrice(next);
            if (!trailingPrice) continue;
            price = trailingPrice.value;
            const qm = next.match(CONFIG.QUANTITY_REGEX) || next.match(/\b(\d+)\b/);
            if (qm) quantity = parseInt(qm[1] || qm[2] || qm[3], 10) || 1;
            break;
        }

        if (price !== null) {
            items.push({
                name: sanitizeProductCandidate(line),
                quantity,
                price,
                line_raw: line
            });
        }
    }

    return dedupeItems(items);
}
