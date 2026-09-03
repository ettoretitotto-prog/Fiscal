#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const normalizer = require('../receipt-normalizer');

const CASES = [
  {
    name: 'prima-prova',
    file: path.join(__dirname, '..', 'screenshots', 'prima prova', 'ocr_22_49_11.txt'),
    expectedTotal: 732,
    expectedItems: [
      { code: '0029', price: 209 },
      { code: '0028', price: 112 },
      { code: '0030', price: 411 },
    ],
  },
  {
    name: 'seconda-prova-danea',
    file: path.join(__dirname, '..', 'screenshots', 'seconda prova', 'scontrino-danea.rtf'),
    expectedTotal: 104,
    expectedItems: [
      { code: '0037', price: 44 },
      { code: '0036', price: 27 },
      { code: '0041', price: 33 },
    ],
  },
  {
    name: 'terzaprova',
    file: path.join(__dirname, '..', 'screenshots', 'terzaprova.rtfd', 'TXT.rtf'),
    expectedTotal: 502,
    expectedItems: [
      { code: '0042', price: 20 },
      { code: '0041', price: 66 },
      { code: '0038', price: 54 },
      { code: '0043', price: 250 },
      { code: '0027', price: 83 },
    ],
  },
];

let hasFailures = false;

for (const testCase of CASES) {
  const raw = fs.readFileSync(testCase.file, 'utf8');
  const result = normalizer.normalize(raw);

  console.log(`\n=== ${testCase.name} ===`);
  console.log('total:', result.total, '| expected:', testCase.expectedTotal);
  console.log('items found:', result.items.length);
  result.items.forEach((item) => console.log(` - ${item.name} :: €${item.line_total}`));

  if (result.total !== testCase.expectedTotal) {
    console.error(`FAIL total mismatch for ${testCase.name}`);
    hasFailures = true;
  }

  for (const expected of testCase.expectedItems) {
    const found = result.items.find((item) => item.name.includes(expected.code) && Math.abs(item.line_total - expected.price) < 0.001);
    if (!found) {
      console.error(`FAIL missing item ${expected.code} @ ${expected.price} for ${testCase.name}`);
      hasFailures = true;
    }
  }
}

if (hasFailures) {
  process.exit(1);
}

console.log('\nAll real receipt regression tests passed.');
