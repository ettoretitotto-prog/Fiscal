const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');
const { URL } = require('url');

async function ocrImage(imagePath) {
    // In ambiente Node il core wasm deve essere passato come file:// URL
    let corePath;
    try {
        const coreResolved = require.resolve('tesseract.js-core/tesseract-core.wasm');
        corePath = new URL('file://' + coreResolved).toString();
    } catch (err) {
        // fallback: leave undefined and let tesseract.js try to locate it
        corePath = undefined;
    }

    const worker = await createWorker({ logger: m => console.log(m), corePath });
    await worker.load();
    await worker.loadLanguage('ita');
    await worker.initialize('ita');
    const { data: { text } } = await worker.recognize(imagePath);
    await worker.terminate();
    return text;
}

async function main() {
    const screenshotsDir = path.join(__dirname, '..', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        console.error('Cartella screenshots non trovata:', screenshotsDir);
        process.exit(1);
    }

    const files = fs.readdirSync(screenshotsDir).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
    for (const f of files) {
        const p = path.join(screenshotsDir, f);
        console.log('--- OCR for', f, '---');
        try {
            const text = await ocrImage(p);
            console.log(text);
            // save output
            const outPath = path.join(__dirname, '..', 'screenshots', f + '.txt');
            fs.writeFileSync(outPath, text, 'utf8');
            console.log('Saved to', outPath);
        } catch (err) {
            console.error('OCR failed for', f, err);
        }
    }
}

main().catch(err => console.error(err));
