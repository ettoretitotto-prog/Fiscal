import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getDatabase, onValue, query, ref, orderByChild, limitToLast, runTransaction } from "firebase/database";
import { Check, Download, Share2, Coffee, Phone, Instagram } from "lucide-react";
import html2canvas from "html2canvas";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBtLDRSn5Jo7ZiAqiVJMEch4JLl7dLcFxo",
  authDomain: "fiscal-9a0c8.firebaseapp.com",
  databaseURL: "https://fiscal-9a0c8-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fiscal-9a0c8",
  storageBucket: "fiscal-9a0c8.firebasestorage.app",
  messagingSenderId: "203263315808",
  appId: "1:203263315808:web:b0ad8d1e3f92c478fc9805",
  measurementId: "G-PT6TSWMNYJ",
};

const firebaseApp = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
const db = getDatabase(firebaseApp);

type ReceiptItem = {
  name: string;
  product?: string;
  description?: string;
  item?: string;
  qty?: number;
  qta?: number;
  quantita?: number;
  quantity?: number;
  price?: number;
  unit?: number;
  unitPrice?: number;
  unit_price?: number;
  line_total?: number;
  lineTotal?: number;
  total?: number;
  amount?: number;
};

type ReceiptData = {
  cassa_id?: string;
  store_name?: string;
  items?: ReceiptItem[];
  total?: number;
  tax_id?: string;
  timestamp?: number;
  raw_text?: string;
  rawText?: string;
};

type ReceiptRecord = {
  cassa_id?: string;
  timestamp?: number;
  status?: string;
  data?: ReceiptData;
  receipt_id?: string;
};

type DisplayItem = {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

function fmt(n: number) {
  return n.toFixed(2);
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const normalized = value
      .replace(/[€\s]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function fmtReceiptDate(value: unknown): string {
  const date = new Date(toNumber(value));
  if (Number.isNaN(date.getTime())) {
    return "Data non disponibile";
  }
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const MONO: CSSProperties = { fontFamily: "'DM Mono', monospace" };

const QUANTITY_REGEX = /\b(\d+)\s*x\b|\bx\s*(\d+)\b/i;
const NON_ITEM_LINE_REGEX =
  /\b(totale|total|subtotale|subtotal|iva|imponibile|pagamento|contanti|carta|resto|scontrino|documento)\b/i;

function parseItemsFromRawText(rawText: unknown): ReceiptItem[] {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    return [];
  }

  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const priceMatch = line.match(/€?\s*(\d+[.,]\d{2})\s*$/);
      if (!priceMatch) {
        return null;
      }

      if (NON_ITEM_LINE_REGEX.test(line)) {
        return null;
      }

      const lineTotal = toNumber(priceMatch[1]);
      if (lineTotal <= 0) {
        return null;
      }

      const priceToken = priceMatch[0];
      const namePart = line.slice(0, line.length - priceToken.length).trim();
      if (!namePart) {
        return null;
      }

      const quantityMatch = namePart.match(QUANTITY_REGEX);
      const qty = quantityMatch ? toNumber(quantityMatch[1] ?? quantityMatch[2]) : 1;
      const cleanName = quantityMatch ? namePart.replace(QUANTITY_REGEX, "").trim() : namePart;
      if (!cleanName) {
        return null;
      }

      return {
        name: cleanName,
        quantity: qty || 1,
        line_total: lineTotal,
      } satisfies ReceiptItem;
    })
    .filter((item): item is ReceiptItem => item !== null);
}

function normalizeDisplayItems(receipt: ReceiptRecord | null): DisplayItem[] {
  if (!receipt) {
    return [];
  }

  const fromData = Array.isArray(receipt.data?.items) ? receipt.data.items : [];
  const fromTopLevel = Array.isArray((receipt as { items?: ReceiptItem[] }).items)
    ? ((receipt as { items: ReceiptItem[] }).items ?? [])
    : [];

  const rawItems = fromData.length > 0 ? fromData : fromTopLevel;
  const rawText = receipt.data?.raw_text ?? receipt.data?.rawText;
  const fallbackItems = rawItems.length > 0 ? rawItems : parseItemsFromRawText(rawText);

  return fallbackItems
    .map((item) => {
      const rawName = item.name || item.product || item.description || item.item || "";
      const quantityCandidate = item.qty ?? item.quantity ?? item.qta ?? item.quantita;

      let qty = toNumber(quantityCandidate) || 1;
      let name = rawName.trim();

      if ((!quantityCandidate || qty <= 1) && name) {
        const quantityMatch = name.match(QUANTITY_REGEX);
        if (quantityMatch) {
          const extracted = toNumber(quantityMatch[1] ?? quantityMatch[2]);
          if (extracted > 0) {
            qty = extracted;
            name = name.replace(QUANTITY_REGEX, "").trim();
          }
        }
      }

      const unitCandidate = item.unit ?? item.unitPrice ?? item.unit_price;
      const lineCandidate = item.line_total ?? item.lineTotal ?? item.total ?? item.amount ?? item.price;

      const unitPrice = toNumber(unitCandidate);
      const lineTotal = toNumber(lineCandidate);
      const resolvedLineTotal = lineTotal || (unitPrice > 0 ? qty * unitPrice : 0);
      const resolvedUnitPrice = unitPrice || (qty > 0 ? resolvedLineTotal / qty : 0);

      if (!name || resolvedLineTotal <= 0 || resolvedUnitPrice <= 0 || qty <= 0) {
        return null;
      }

      return {
        name,
        qty,
        unitPrice: resolvedUnitPrice,
        lineTotal: resolvedLineTotal,
      } satisfies DisplayItem;
    })
    .filter((item): item is DisplayItem => item !== null);
}

export default function App() {
  const [shared, setShared] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptRecord | null>(null);
  const receiptCardRef = useRef<HTMLDivElement | null>(null);
  const cassaId = useMemo(
    () => new URLSearchParams(window.location.search).get("cassa") || "demo01",
    [],
  );

  useEffect(() => {
    // Listen to recent receipts (limit to last 50) and try to claim the newest UNCLAIMED
    const receiptsRef = query(ref(db, "scontrini"), orderByChild("timestamp"), limitToLast(50));
    const listener = onValue(receiptsRef, async (snapshot) => {
      const value = snapshot.val() as Record<string, ReceiptRecord> | null;
      if (!value) {
        setActiveReceipt(null);
        return;
      }

      // Find the newest eligible receipt for this cassa: UNCLAIMED and not older than 45s
      const now = Date.now();
      const candidates = Object.entries(value)
        .map(([key, receipt]) => ({ key, receipt }))
        .filter(({ receipt }) => {
          const receiptCassaId = receipt.data?.cassa_id || receipt.cassa_id;
          if (receiptCassaId !== cassaId) return false;
          if (String((receipt as any).status || "").toUpperCase() !== "UNCLAIMED") return false;
          const ts = toNumber(receipt.timestamp) || toNumber(receipt.data?.timestamp);
          if (!ts) return false;
          return now - ts <= 45000; // 45 seconds
        })
        .sort((a, b) => {
          const aTs = toNumber(a.receipt.timestamp) || toNumber(a.receipt.data?.timestamp);
          const bTs = toNumber(b.receipt.timestamp) || toNumber(b.receipt.data?.timestamp);
          return bTs - aTs;
        });

      if (candidates.length === 0) {
        // Nothing to claim for this cassa
        setActiveReceipt(null);
        return;
      }

      // Try to atomically claim the newest candidate using a transaction to avoid races
      for (const { key, receipt } of candidates) {
        try {
          const receiptRef = ref(db, `scontrini/${key}`);
          const result = await runTransaction(receiptRef, (current) => {
            if (!current) return; // deleted meanwhile
            const currentStatus = String(current.status || "").toUpperCase();
            const ts = toNumber(current.timestamp) || toNumber(current.data?.timestamp);
            if (currentStatus === "UNCLAIMED" && ts && Date.now() - ts <= 45000) {
              // mark as claimed
              return { ...current, status: "CLAIMED" };
            }
            // someone else claimed or expired: abort transaction
            return;
          });

          if (result.committed && result.snapshot) {
            // Successfully claimed this receipt — show it and stop listening
            const claimed = result.snapshot.val() as ReceiptRecord;
            // Ensure we include receipt_id if missing
            claimed.receipt_id = claimed.receipt_id || key;
            setActiveReceipt(claimed);
            // stop the listener
            listener();
            return;
          }
        } catch (err) {
          // ignore and try next candidate
          console.error("Claim transaction failed", err);
        }
      }

      // If none could be claimed, ensure active is null
      setActiveReceipt(null);
    });

    return () => listener();
  }, [cassaId]);

  const items = useMemo(() => normalizeDisplayItems(activeReceipt), [activeReceipt]);
  const subtotal = items.reduce((acc, item) => acc + item.lineTotal, 0);
  const tax = subtotal * 0.22;
  const fallbackTotal = subtotal + tax;
  const total = toNumber(activeReceipt?.data?.total) || fallbackTotal;
  const receiptDate = fmtReceiptDate(activeReceipt?.timestamp);
  const storeName = activeReceipt?.data?.store_name || "Digital Receipt";

  const handleShare = async () => {
    const shareTitle = `Scontrino ${storeName}`;
    const shareText = `Totale: €${fmt(total)} · ${receiptDate}`;
    const shareUrl = window.location.href;

    setShareError(null);

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
      } else {
        const encoded = encodeURIComponent(`${shareTitle}\n${shareText}\n${shareUrl}`);
        const shareTargetUrl = `https://wa.me/?text=${encoded}`;
        const shareWindow = window.open(shareTargetUrl, "_blank", "noopener,noreferrer");
        if (!shareWindow) {
          window.location.assign(shareTargetUrl);
        }
      }
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      const fallbackText = `${shareTitle}\n${shareText}\n${shareUrl}`;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(fallbackText);
          setShared(true);
          setTimeout(() => setShared(false), 2000);
          return;
        } catch {
          // Se anche la clipboard fallisce, mostriamo errore esplicito sotto.
        }
      }
      const message = error instanceof Error ? error.message : "Condivisione non disponibile";
      setShareError(message);
    }
  };

  const handleSavePng = async () => {
    setSaveError(null);

    const receiptCard = receiptCardRef.current;
    if (!receiptCard) {
      setSaveError("Anteprima scontrino non disponibile per il salvataggio.");
      return;
    }

    try {
      const canvas = await html2canvas(receiptCard, {
        backgroundColor: null,
        scale: Math.min(window.devicePixelRatio || 1, 2),
      });

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        throw new Error("Impossibile generare l'immagine PNG.");
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `scontrino-${cassaId}-${Date.now()}.png`;
      link.href = objectUrl;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Salvataggio PNG non riuscito";
      setSaveError(message);
    }
  };

  return (
    <div
      className="min-h-screen bg-background flex items-start justify-center pt-10 pb-12 px-4"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div className="w-full max-w-[390px]">

        {/* ── Receipt card ── */}
        <div ref={receiptCardRef} className="bg-card rounded-[22px] shadow-sm overflow-hidden">

          {/* Header: logo + merchant */}
          <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-7 border-b border-border">
            <div className="w-12 h-12 rounded-2xl bg-foreground flex items-center justify-center">
              <Coffee className="w-5 h-5 text-primary-foreground" strokeWidth={1.75} />
            </div>
            <div className="text-center">
              <h1 className="text-base font-semibold text-foreground tracking-tight">{storeName}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Cassa: {cassaId}</p>
            </div>
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full mt-1"
              style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}
            >
              <Check className="w-3 h-3" style={{ color: "#16a34a" }} strokeWidth={2.5} />
              <span className="text-[10px] font-semibold tracking-wide" style={{ color: "#16a34a" }}>
                {activeReceipt ? `Pagamento confermato · ${receiptDate}` : "In attesa di uno scontrino..."}
              </span>
            </div>
          </div>

          {/* Items */}
          <div className="px-6 py-5 border-b border-border space-y-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun articolo disponibile.</p>
            ) : (
              items.map((item, index) => {
                return (
                  <div key={`${item.name}-${index}`} className="flex items-baseline justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-snug">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5" style={MONO}>
                        {item.qty} × €{fmt(item.unitPrice)}
                      </p>
                    </div>
                    <span className="text-sm text-foreground shrink-0" style={MONO}>
                      €{fmt(item.lineTotal)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Subtotals */}
          <div className="px-6 pt-5 pb-4 space-y-3 border-b border-border">
            {[
              { label: "Subtotale", value: `€${fmt(subtotal)}` },
              { label: "IVA 22%", value: `€${fmt(tax)}` },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className="text-sm text-foreground" style={MONO}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="px-6 py-5 flex justify-between items-center">
            <span className="text-base font-semibold text-foreground">Totale</span>
            <span className="text-xl font-semibold text-foreground" style={MONO}>
              €{fmt(total)}
            </span>
          </div>

        </div>

        {/* ── Buttons ── */}
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-150 active:scale-[0.97] bg-card shadow-sm border border-border text-foreground hover:bg-secondary"
          >
            {shared
              ? <><Check className="w-4 h-4" strokeWidth={2} />Copiato</>
              : <><Share2 className="w-4 h-4" strokeWidth={1.75} />Condividi</>
            }
          </button>
          <button
            onClick={handleSavePng}
            className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-150 active:scale-[0.97] bg-foreground text-primary-foreground hover:bg-foreground/85"
          >
            {saved
              ? <><Check className="w-4 h-4" strokeWidth={2} />Salvato</>
              : <><Download className="w-4 h-4" strokeWidth={1.75} />Salva</>
            }
          </button>
        </div>
        {(shareError || saveError) && (
          <p className="mt-2 text-center text-xs text-red-500">
            {shareError || saveError}
          </p>
        )}

        {/* ── Rimani in contatto ── */}
        <div className="bg-card rounded-[22px] shadow-sm mt-4 px-6 py-6">
          <p className="text-base font-semibold text-foreground mb-1">Rimani in contatto 🤙</p>
          <p className="text-xs text-muted-foreground mb-5">Seguici e non perderti niente di nuovo ✨</p>

          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-secondary rounded-xl px-4 py-3">
              <Phone className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
              <input
                type="tel"
                placeholder="+39 333 000 0000"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                style={MONO}
              />
            </div>
            <div className="flex items-center gap-3 bg-secondary rounded-xl px-4 py-3">
              <Instagram className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
              <input
                type="text"
                placeholder="@intervalcoffee"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                style={MONO}
              />
            </div>
            <button className="w-full py-3 rounded-xl bg-foreground text-primary-foreground text-sm font-semibold transition-all duration-150 active:scale-[0.97] hover:bg-foreground/85">
              Invia 🚀
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
