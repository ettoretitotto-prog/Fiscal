const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');
const { URL } = require('url');

async function ocrImage(imagePath) {
    // In ambiente Node il core wasm deve essere passato come file:// URL
    let corePath;
    try {
        const coreResolved = require.resolve('tesseract.js-core/tesseract-core.wasm');
        // Use URL.pathToFileURL to ensure a valid file:// URL
        const { pathToFileURL } = require('url');
        corePath = pathToFileURL(coreResolved).toString();
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

    // Recursively find image files under screenshotsDir
    function findImages(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const imgs = [];
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) imgs.push(...findImages(full));
            else if (/\.(png|jpe?g|webp)$/i.test(e.name)) imgs.push(full);
        }
        return imgs;
    }

    const files = findImages(screenshotsDir);
    for (const p of files) {
        console.log('--- OCR for', p, '---');
        try {
            const text = await ocrImage(p);
            console.log('OCR length:', (text || '').length);
            // save output next to image file
            const outPath = p + '.txt';
            fs.writeFileSync(outPath, text, 'utf8');
            console.log('Saved to', outPath);
        } catch (err) {
            console.error('OCR failed for', p, err);
        }
    }
}

main().catch(err => console.error(err));
