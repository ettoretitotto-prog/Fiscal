const norm = require('../receipt-normalizer');

// Simula lo scontrino con 2 brioche che non funziona
const text = `@ta!Test 1

!----------------------------------------------------------------
!
aEURO
a2 x Brioche                                 4,00

!Totale EURO                                 4,00
!CONTANTI                                    4,00

27/07/2026 13:07                       Sc.Nr. 62
!

Documento non fiscale ai sensi dell'art. 1, c. 1, lett. a), DPR 696/1996

VA`;

const res = norm.normalize(text);
console.log('====== SCONTRINO 2 BRIOCHE ======');
console.log('Totale:', res.total);
console.log('Items:', JSON.stringify(res.items, null, 2));
console.log();

// Debug: mostra righe dopo ogni fase
const fs = require('fs');
const path = require('path');
// Get internals
const stripped = require('../receipt-normalizer');
console.log('=== raw_text ===');
res.raw_text.split('\n').forEach((l,i) => console.log(i+':', JSON.stringify(l)));