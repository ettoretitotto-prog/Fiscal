// CSV compatibile con Excel in italiano: separatore ";", BOM UTF-8, date leggibili.
const DATE_COLS = /(_il|^data|^creata_il)$/;

function cell(v: unknown, col: string): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "number" && DATE_COLS.test(col) && v > 1e12) {
    s = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }).format(v);
  } else s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita formule (CSV injection)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "﻿";
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c], c)).join(";"))];
  return "﻿" + lines.join("\r\n");
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
