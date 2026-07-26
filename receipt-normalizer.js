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
        'documento non fiscale', 'sc.nr', 'scontrino n'
    ],
    
    // Parole chiave per identificare METODI DI PAGAMENTO / metadata che NON devono
    // essere considerati nomi di prodotto anche se appaiono vicino a prezzi.
    PAYMENT_KEYWORDS: ['contanti','contante','cash','carta','bancomat','visa','mastercard','pagamento','pagato','resto','credito','debito'],
    
    // Regex per estrarre prezzo (accetta simboli euro o artefatti come '¬', o parole 'eur','euro')
    // Cattura l'ultima occorrenza di un numero con due decimali alla fine della riga.
    // Accept optional spaces between decimal separator and decimals (OCR sometimes inserts a space)
    PRICE_REGEX: /(?:[€¬]|eur|euro)?\s*(\d+[.,]\s*\d{2})\s*$/i,
    
    // Regex per estrarre quantità (es. "x1", "x2", "1x", "2 pz")
    QUANTITY_REGEX: /\b(\d+)\s*x\b|\bx\s*(\d+)\b|\b(\d+)\s*(?:pz|pcs|pc)\b/i,
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
 * Preprocess RTF-like content: convert RTF hex escapes (\'hh) to proper
 * characters using Windows-1252 decoding, normalize common RTF controls
 * (\par, \line, \tab) to newlines/tabs, and return a UTF-8 string.
 */
function preprocessRTF(text) {
    if (!text || typeof text !== 'string') return text;

    // normalize line controls
    let s = text.replace(/\\par[d]?/gi, '\n').replace(/\\line/gi, '\n').replace(/\\tab/gi, '\t');

    // Build byte array: when we find \'hh sequences, insert that byte;
    // otherwise insert the char code of the current character.
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '\\' && s[i+1] === "'" && i + 3 < s.length) {
            const h1 = s[i+2];
            const h2 = s[i+3];
            if (/^[0-9A-Fa-f]$/.test(h1) && /^[0-9A-Fa-f]$/.test(h2)) {
                const hex = h1 + h2;
                bytes.push(parseInt(hex, 16));
                i += 3; // skip \'hh
                continue;
            }
        }
        // For other backslash sequences like \{ or \\ just skip the backslash
        if (ch === '\\') {
            // skip until space or non-letter (simple heuristic)
            let j = i+1;
            while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
            // advance and continue (we ignore control word)
            i = j - 1;
            continue;
        }
        bytes.push(s.charCodeAt(i));
    }

    try {
        let decoded = iconv.decode(Buffer.from(bytes), 'windows-1252');

        // Normalize common annoying symbols produced by conversions / OCR:
        // - non-breaking spaces to normal spaces
        // - soft hyphen to nothing
        // - weird '¬' that sometimes appears where € or line-break markers are output
        decoded = decoded.replace(/\u00A0/g, ' ');
        decoded = decoded.replace(/\u00AD/g, '');
        // Replace the '¬' glyph (often produced by some RTF/OCR flows) with the euro symbol
        // so PRICE_REGEX can recognize amounts like "¬ 44,00".
        decoded = decoded.replace(/¬/g, '€');

        // Normalize common Mojibake sequences a bit (e.g. smart quotes)
        decoded = decoded.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
        decoded = decoded.replace(/[\u201C\u201D\u201E\u201F]/g, '"');

        // Collapse repeated visual separators produced by some captures
        decoded = decoded.replace(/[_\-]{3,}/g, '-');

        return decoded;
    } catch (err) {
        // fallback: return original with a best-effort replace of \'hh
        return s.replace(/\\'([0-9A-Fa-f]{2})/g, (m, p1) => String.fromCharCode(parseInt(p1,16)));
    }
}

/**
 * Sanitize a product name reconstructed from a code-start block.
 * Removes tiny noisy tokens and preserves words and quoted phrases.
 */
function sanitizeCodeBlockName(name) {
    if (!name || typeof name !== 'string') return '';
    // normalize whitespace
    let s = name.replace(/\s+/g, ' ').trim();
    // remove common stray punctuation sequences
    s = s.replace(/[\u0000-\u001F]/g, ' ');

    const tokens = s.split(/\s+/).filter(tok => {
        // keep quoted tokens like "sole"
        if (/^".*"$/.test(tok) && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(tok)) return true;
        // keep tokens that contain at least two letters
        if (/[A-Za-zÀ-ÖØ-öø-ÿ].*[A-Za-zÀ-ÖØ-öø-ÿ]/.test(tok)) return true;
        // keep tokens longer than 2 (to preserve words like '150' or 'cm')
        if (tok.length > 2) return true;
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

    return tokens.join(' ').replace(/\s{2,}/g, ' ').trim();
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
    
    const exactTotalCandidates = [];
    const genericTotalCandidates = [];

    for (const line of lines) {
        const lowerLine = line.toLowerCase();

        const isSubtotalLine = /\bsub[\s-]?tot(?:ale|al)?\b/i.test(lowerLine);
        if (isSubtotalLine) {
            continue;
        }

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
                const candidate = {
                    total,
                    line_raw: line.trim()
                };
                if (/\b(?:totale|total)\b/i.test(lowerLine)) {
                    exactTotalCandidates.push(candidate);
                } else {
                    genericTotalCandidates.push(candidate);
                }
            }
        }
    }

    if (exactTotalCandidates.length > 0) {
        return exactTotalCandidates[exactTotalCandidates.length - 1];
    }

    if (genericTotalCandidates.length > 0) {
        return genericTotalCandidates[genericTotalCandidates.length - 1];
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
 * Estrae il subtotale (se presente) dal testo
 */
function extractSubtotal(text) {
    if (!text) return null;
    const lines = text.split('\n');
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (/\bsub[\s-]?tot(?:ale|al)?\b/i.test(lower) || lower.includes('subtotale') || lower.includes('subtotal')) {
            const m = line.match(CONFIG.PRICE_REGEX);
            if (m) return normalizeNumber(m[1]);
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
function reconcileItems(items, text, reportedTotal) {
    const result = { items: items.slice(), adjusted: false, reason: null };

    // compute sum
    const sum = result.items.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0);
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

    const sum2 = result.items.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0);
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
            const sumNew = newItems.reduce((s, it) => s + it.price * (it.quantity || 1), 0);
            if (Math.abs(sumNew - subtotal) < 0.005) {
                result.items = newItems; result.adjusted = true; result.reason = 'reassociated_prices';
                return result;
            }
        }
    }

    // Step 3: small subset-sum attempt (only up to N items to avoid expensive compute)
    const vals = result.items.map(it => Math.round((it.price || 0) * 100));
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

    // Build logical blocks by concatenating physical lines until a price is found.
    const logicalBlocks = [];
    let buffer = '';
    let physBuffer = [];
    const codeStartRe = /^\s*\d{2,5}\b/;

    for (const line of physLines) {
        if (!line) continue;

        if (codeStartRe.test(line)) {
            // new product block starts
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
            // Heuristic: if the incoming line is noisy (many single-char tokens / OCR artifacts),
            // still append it but mark as continuation to attempt reconstruction later.
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

    // Post-process: unisci blocchi dove il prezzo è stato separato su una riga
    // a parte (es. un blocco con descrizione senza prezzo seguito da un blocco
    // che contiene solo il prezzo). Se il blocco precedente non contiene un
    // prezzo e quello corrente sì, normalmente li uniamo, ma EVITIAMO di unire
    // se il blocco precedente sembra essere una riga di pagamento/metadata
    // (es. "CONTANTI") — in tal caso cerchiamo di associare il prezzo al
    // prodotto valido più vicino prima del blocco di pagamento.
    for (let i = 1; i < logicalBlocks.length; i++) {
        const prev = logicalBlocks[i - 1];
        const cur = logicalBlocks[i];
        const prevHasPrice = CONFIG.PRICE_REGEX.test(prev.text);
        const curHasPrice = CONFIG.PRICE_REGEX.test(cur.text);
        if (!prevHasPrice && curHasPrice) {
            const prevLower = (prev.text || '').toLowerCase();
            const prevIsPayment = CONFIG.PAYMENT_KEYWORDS.some(k => prevLower.includes(k));
            if (prevIsPayment) {
                // Try to attach the current price block to the nearest earlier
                // logical block that looks like a product (has letters and/or price)
                let attached = false;
                for (let j = i - 2; j >= 0; j--) {
                    const candidate = logicalBlocks[j];
                    // candidate is suitable if it already contains a price (unlikely)
                    // or if it contains letters (likely a product name)
                    if (CONFIG.PRICE_REGEX.test(candidate.text) || /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(candidate.text)) {
                        candidate.text = (candidate.text + ' ' + cur.text).trim();
                        candidate.physLines = (candidate.physLines || []).concat(cur.physLines || []);
                        logicalBlocks.splice(i, 1);
                        attached = true;
                        break;
                    }
                }
                if (!attached) {
                    // Couldn't attach: mark prev as payment metadata and drop current price
                    // (avoid creating a spurious product named 'CONTANTI')
                    prev._isPayment = true;
                    logicalBlocks.splice(i, 1);
                }
                i--; // adjust index after splice (if splice occurred)
                continue;
            }

            // Default: merge as before
            prev.text = (prev.text + ' ' + cur.text).trim();
            prev.physLines = (prev.physLines || []).concat(cur.physLines || []);
            logicalBlocks.splice(i, 1);
            i--; // stay on same index for next iteration
        }
    }

    for (const block of logicalBlocks) {
        const trimmedLine = block.text;
        const physBlock = block.physLines || [trimmedLine];

        if (!trimmedLine) continue;

        // Skip blocks that appear to be payment metadata (e.g. "CONTANTI")
        const blockLower = (trimmedLine || '').toLowerCase();
        if (block._isPayment || CONFIG.PAYMENT_KEYWORDS.some(k => blockLower.includes(k))) {
            // don't treat as item
            continue;
        }

        // Controlla prima se la riga logica contiene un prezzo: se c'è un prezzo
        // vogliamo processarla anche se contiene parole come "euro" che sono
        // normalmente nella lista di IGNORE_KEYWORDS (evita di scartare righe valide).
        // If physical block contains lines that start with a product code (e.g. "0029"),
        // extract each product by scanning physBlock for code-starting lines and collecting
        // following lines until a price is found. This preserves the original Danea layout.
        const codeStartRe = /^\s*\d{2,5}\b/;
        let handled = false;
        for (let i = 0; i < physBlock.length; i++) {
            const pl = physBlock[i];
            if (!codeStartRe.test(pl)) continue;

            // collect segment from this line until next code line or end
            const seg = [pl];
            let priceLine = null;
            for (let j = i + 1; j < physBlock.length; j++) {
                const l = physBlock[j];
                seg.push(l);
                if (CONFIG.PRICE_REGEX.test(l)) { priceLine = l; break; }
                if (codeStartRe.test(l)) break; // next product starts
            }

            // If still no priceLine, try to find price in joined segment
            if (!priceLine) {
                const joinedSeg = seg.join(' ');
                const m = joinedSeg.match(CONFIG.PRICE_REGEX);
                if (m) priceLine = m[0];
            }

            let priceVal = null;
            if (priceLine) {
                const m2 = priceLine.match(CONFIG.PRICE_REGEX);
                priceVal = m2 ? normalizeNumber(m2[1]) : null;
            }

                // Fallback: if priceVal is still null, try to extract using a tolerant fallback
                if (priceVal === null) {
                    // search joined segment for any price-like token
                    const joined = seg.join(' ');
                    const fallback = joined.match(/(\d+[.,]\s*\d{2})/);
                    if (fallback) priceVal = normalizeNumber(fallback[1]);
                }

            // Build product name by joining original physical lines.
            // If the last segment line contains the price, strip the price and include the remaining text.
            const lastLine = seg[seg.length - 1] || '';
            let nameLines = seg.slice(0, -1);
            if (CONFIG.PRICE_REGEX.test(lastLine)) {
                const lastWithoutPrice = lastLine.replace(CONFIG.PRICE_REGEX, '').trim();
                if (lastWithoutPrice) nameLines.push(lastWithoutPrice);
            } else {
                nameLines = seg.slice();
            }
            // Join with space to form a single-line product name similar to Danea export
                const productNameExact = sanitizeCodeBlockName(nameLines.join(' ').replace(/\s{2,}/g, ' ').trim());
            // Skip pushing empty or non-meaningful names (e.g. just '00')
            if (priceVal !== null && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(productNameExact)) {
                items.push({ name: productNameExact, quantity: 1, price: priceVal, line_raw: seg.join(' ') });
                handled = true;
            }
        }
        if (handled) continue;

        const priceMatch = trimmedLine.match(CONFIG.PRICE_REGEX);
        if (!priceMatch) {
            // Se non c'è un prezzo, allora è sicuro applicare i filtri di ignorare
            const lowerLine = trimmedLine.toLowerCase();
            if (CONFIG.IGNORE_KEYWORDS.some(keyword => lowerLine.includes(keyword))) continue;
            if (CONFIG.TOTAL_KEYWORDS.some(keyword => lowerLine.includes(keyword))) continue;
            // senza prezzo non possiamo estrarre un item
            continue;
        }

        const price = normalizeNumber(priceMatch[1]);
        if (price === null) continue;

        // If this logical line is actually a total/summary (contains total keywords), skip as item
        const lowerLine = trimmedLine.toLowerCase();
        if (CONFIG.TOTAL_KEYWORDS.some(keyword => lowerLine.includes(keyword))) {
            continue;
        }

        const priceStart = trimmedLine.lastIndexOf(priceMatch[0]);
        let productName = trimmedLine.substring(0, priceStart).trim();

        // If the physical block contains a product code at any line, prefer a
        // conservative reconstruction: join the original physical lines (minus
        // the trailing price) to match exactly what Danea provided. This avoids
        // losing words or over-cleaning messy OCR fragments.
        const hasCodeLine = physBlock.some(l => codeStartRe.test(l));
        if (hasCodeLine) {
            productName = physBlock
                .map(l => l.replace(CONFIG.PRICE_REGEX, ''))
                .map(l => l.trim())
                .filter(l => l.length > 0)
                .join(' ')
                .trim();
        } else {
            // Fallback: apply previous cleaning logic for non-coded blocks
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

        // Strip leading dates if present (e.g. "24/07/2026")
        productName = productName.replace(/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\s*/, '');

        // Aggressive cleaning for OCR residues
        productName = productName
            .replace(/\b[A-Za-z]\b/g, ' ')
            .replace(/[^A-Za-z0-9\s\-\"']{2,}/g, ' ')
            .replace(/(?<=[A-Za-z])1(?=[A-Za-z])/g, '')
            .replace(/\b\d+[A-Za-z]\b/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        // Additional pass: remove isolated single letters separated by spaces caused by OCR
        productName = productName.replace(/\b[A-Za-z]\b/g, '').replace(/\s{2,}/g, ' ').trim();

        let quantity = 1;
        const quantityMatch = productName.match(CONFIG.QUANTITY_REGEX);
        if (quantityMatch) {
            quantity = parseInt(quantityMatch[1] || quantityMatch[2] || quantityMatch[3], 10);
            productName = productName.replace(CONFIG.QUANTITY_REGEX, '').trim();
        }

        if (!productName) continue;

        // Guard: if productName contains payment keywords only, skip
        const productNameLower = (productName || '').toLowerCase();
        if (CONFIG.PAYMENT_KEYWORDS.some(k => productNameLower.includes(k)) && !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(productName)) {
            continue;
        }

        items.push({ name: productName, quantity, price, line_raw: trimmedLine });
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
        // Preprocess RTF-like content then clean the resulting text
        let pre = preprocessRTF(rawText);
        let cleanedText = cleanText(pre);
        
        // Rimuovi residui di comandi ESC/POS non filtrati (es. "@ta!Test", "a1 x Caffe")
        cleanedText = stripEscPosResiduals(cleanedText);
        
        // Estrai il totale
        const totalData = extractTotal(cleanedText);
        const total = totalData ? totalData.total : null;
        
        // Estrai i prodotti
            let items = extractItems(cleanedText);

            // Reconcilia items con subtotal/total per correggere errori dovuti a linee di pagamento
            const reconciliation = reconcileItems(items, cleanedText, total);
            if (reconciliation.adjusted) {
                items = reconciliation.items;
                // Optionally, we could attach a flag to the normalized object indicating reconciliation
            }
        
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

// Export internals for debugging (not intended for production use)
module.exports._internals = {
    extractItems,
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
        // merge blocks where price split
        for (let i = 1; i < logicalBlocks.length; i++) {
            const prev = logicalBlocks[i-1]; const cur = logicalBlocks[i];
            const prevHasPrice = CONFIG.PRICE_REGEX.test(prev.text); const curHasPrice = CONFIG.PRICE_REGEX.test(cur.text);
            if (!prevHasPrice && curHasPrice) { prev.text = (prev.text + ' ' + cur.text).trim(); prev.physLines = (prev.physLines || []).concat(cur.physLines || []); logicalBlocks.splice(i,1); i--; }
        }
        return logicalBlocks;
    }
};
