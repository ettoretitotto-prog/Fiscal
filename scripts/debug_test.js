const norm = require('../receipt-normalizer');
const fs = require('fs');

// Debug Scontrinoetico - test stripEscPosResiduals
const text = fs.readFileSync('../captured_receipts/processed/receipt_20260720_162902_0afijdk8v.txt', 'utf8');
console.log('=== RAW FILE ===');
console.log(text);
console.log('\n=== HEX DUMP ===');
for (let i = 0; i < text.length; i++) {
    if (text[i] < ' ' || text.charCodeAt(i) > 126) {
        console.log(`char ${i}: code ${text.charCodeAt(i)} hex ${text.charCodeAt(i).toString(16)}`);
    }
}
console.log('\n=== FIRST CHAR CODE ===');
console.log('First char:', text.charCodeAt(0).toString(16), text[0]);

// Test strip manually
const stripResiduals = (t) => {
    const lines = t.split('\n').map(line => {
        let cleaned = line;
        const before0 = cleaned;
        cleaned = cleaned.replace(/^([@!]|(?<![a-zA-Z])[a-z](?=[A-Z!@]))+/g, '');
        const after0 = cleaned;
        if (before0 !== after0) console.log(`  after reg0: "${before0}" -> "${after0}"`);
        
        const before = cleaned;
        cleaned = cleaned.replace(/^!+/, '');
        if (before !== cleaned) console.log(`  after !: "${before}" -> "${cleaned}"`);
        
        const before2 = cleaned;
        cleaned = cleaned.replace(/^a(\d+\s*x\b)/i, '$1');
        if (before2 !== cleaned) console.log(`  after a qty: "${before2}" -> "${cleaned}"`);
        
        const before3 = cleaned;
        cleaned = cleaned.replace(/^a(?=[A-Z])/, '');
        if (before3 !== cleaned) console.log(`  after a A-Z: "${before3}" -> "${cleaned}"`);
        
        const before4 = cleaned;
        cleaned = cleaned.replace(/^a(?=[A-Za-z])/, '');
        if (before4 !== cleaned) console.log(`  after a A-Za-z: "${before4}" -> "${cleaned}"`);
        
        return cleaned;
    });
    return lines.join('\n');
};

console.log('\n=== STRIP STEP BY STEP ===');
const result = stripResiduals(text);
console.log('\n=== RESULT ===');
console.log(result);