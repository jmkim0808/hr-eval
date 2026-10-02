"use client";
// 브라우저 전용 엑셀 도구 (ADR-0008). 서버 코드에서 불러오지 않는다.

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

export async function downloadWorkbook(name: string, build: (wb: import("exceljs").Workbook) => void) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  build(wb);
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
