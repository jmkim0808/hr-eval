"use client";
// 브라우저 전용 엑셀 도구 (ADR-0008). 서버 코드에서 불러오지 않는다.
import { logExport } from "@/lib/portal";

/** 엑셀 칸 값을 글자로. 날짜는 YYYY-MM-DD */
export function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text !== undefined) return cellText(o.text);
    if (o.result !== undefined) return cellText(o.result);
    return "";
  }
  return String(v).trim();
}

/** 내보낼 때 수식으로 실행되지 않게 (규칙 11) */
export function safeCell(v: string | number | null): string | number | null {
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return `'${v}`;
  return v;
}

export async function loadWorkbook(file: File) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb;
}

/** 엑셀을 만들어 내려받고, 포털에 내보내기 기록을 남긴다 (사양 5장 — 실패해도 내려받기는 진행) */
export async function downloadWorkbook(name: string, build: (wb: import("exceljs").Workbook) => void, log: { target: string; rows: number }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  build(wb);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  logExport(log.target, blob.size, log.rows);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
