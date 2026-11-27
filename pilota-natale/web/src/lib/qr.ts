import QRCode from "qrcode";

const GREEN = "#14532d";
const INK = "#1c1917";

export async function qrDataUrl(text: string, size = 1024): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

const HEADLINE = "Fai un regalo?";
const SUBLINE = "Al posto dello scontrino di cortesia di carta, ricevi la prova d'acquisto regalo digitale.";
const STEPS = [
  "1. Inquadra il QR con la fotocamera",
  "2. Fotografa lo scontrino e descrivi il regalo",
  "3. Ricevi via email il link regalo da inviare",
];

/** Scarica il QR "nudo" in PNG (1024 px). */
export async function downloadQrPng(url: string, shopId: string) {
  download(await qrDataUrl(url, 1024), `fiscal-qr-${shopId}.png`);
}

/** Scarica il cartello da banco in PNG (1200×1700 px). */
export async function downloadPosterPng(url: string, shopId: string, shopName: string) {
  const W = 1200, H = 1700;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, W, 330);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 96px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(HEADLINE, W / 2, 150);
  ctx.font = "40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  wrapLines(ctx, SUBLINE, W - 160).forEach((l, i) => ctx.fillText(l, W / 2, 225 + i * 50));

  const qr = await loadImage(await qrDataUrl(url, 800));
  ctx.drawImage(qr, (W - 800) / 2, 370, 800, 800);

  ctx.fillStyle = INK;
  ctx.font = "bold 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  wrapLines(ctx, shopName, W - 120).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, 1250 + i * 70));

  ctx.textAlign = "left";
  ctx.font = "40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  STEPS.forEach((s, i) => ctx.fillText(s, 150, 1420 + i * 60));

  ctx.textAlign = "center";
  ctx.fillStyle = "#78716c";
  ctx.font = "28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(url.replace(/^https?:\/\//, ""), W / 2, H - 40);

  download(canvas.toDataURL("image/png"), `fiscal-cartello-${shopId}.png`);
}

/** Scarica il cartello da banco in PDF A5 verticale, pronto da stampare. */
export async function downloadPosterPdf(url: string, shopId: string, shopName: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
  const W = 148, H = 210;

  pdf.setFillColor(20, 83, 45);
  pdf.rect(0, 0, W, 42, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  pdf.text(HEADLINE, W / 2, 18, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(pdf.splitTextToSize(SUBLINE, W - 24), W / 2, 28, { align: "center" });

  const qrSize = 96;
  pdf.addImage(await qrDataUrl(url, 1024), "PNG", (W - qrSize) / 2, 48, qrSize, qrSize);

  pdf.setTextColor(28, 25, 23);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  const nameLines = (pdf.splitTextToSize(shopName, W - 20) as string[]).slice(0, 2);
  pdf.text(nameLines, W / 2, 154, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  STEPS.forEach((s, i) => pdf.text(s, 22, 172 + i * 7));

  pdf.setTextColor(120, 113, 108);
  pdf.setFontSize(8);
  pdf.text(url.replace(/^https?:\/\//, ""), W / 2, H - 8, { align: "center" });

  pdf.save(`fiscal-cartello-${shopId}.pdf`);
}
