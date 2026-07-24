const fs = require('fs');
const normalizer = require('../receipt-normalizer');

const sample = fs.readFileSync(__dirname + '/sample_input.txt', 'utf8');

// We'll call internal extractItems by requiring the module and accessing extractItems
const rn = require('../receipt-normalizer');

if (rn && rn.extractItems) {
    console.log('extractItems available');
    const items = rn.extractItems(sample);
    console.log('Items:', JSON.stringify(items, null, 2));
} else {
    console.log('Cannot access extractItems directly. Running normalize to inspect output.');
    const res = rn.normalize(sample);
    console.log(JSON.stringify(res, null, 2));
}
