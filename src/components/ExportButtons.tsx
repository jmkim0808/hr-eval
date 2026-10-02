"use client";

import { Archive, CircleAlert, FileSpreadsheet, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { exportBackupAction, exportFinalAction } from "@/app/admin/export-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { downloadWorkbook, safeCell } from "@/lib/excel/browser";
import type { Sheet } from "@/server/repo/export";

const stamp = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()).replaceAll("-", "");

function addSheet(wb: import("exceljs").Workbook, s: Sheet) {
  const ws = wb.addWorksheet(s.name);
  ws.addRow(s.headers);
  ws.getRow(1).font = { bold: true };
  for (const r of s.rows) ws.addRow(r.map((v) => safeCell(v)));
  ws.columns.forEach((c, i) => (c.width = Math.min(40, Math.max(10, (s.headers[i]?.length ?? 4) * 2 + 4))));
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function useExport() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return { pending, error, run: (fn: () => Promise<string | null>) => start(async () => setError(await fn())), refresh: () => router.refresh() };
}

export function FinalExcelButton({ enabled }: { enabled: boolean }) {
  const x = useExport();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        className="w-fit"
        disabled={!enabled || x.pending}
        onClick={() =>
          x.run(async () => {
            const r = await exportFinalAction();
            if (!r.ok) return r.message;
            await downloadWorkbook(`${r.value.year}_최종결과_${stamp()}.xlsx`, (wb) => addSheet(wb, r.value.sheet));
            return null;
          })
        }
      >
        {x.pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet aria-hidden="true" />}
        최종결과 엑셀 내려받기
      </Button>
      {!enabled && <p className="text-caption text-muted-foreground">평가등급을 확정하면 내려받을 수 있습니다.</p>}
      {x.error && <p role="alert" className="text-caption text-danger">{x.error}</p>}
    </div>
  );
}

export function BackupButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const x = useExport();
  return (
    <>
      <Button
        variant={variant}
        disabled={x.pending}
        onClick={() =>
          x.run(async () => {
            const r = await exportBackupAction();
            if (!r.ok) return r.message;
            await downloadWorkbook(`${r.value.year}_전체기록백업_${stamp()}.xlsx`, (wb) => r.value.sheets.forEach((s) => addSheet(wb, s)));
            x.refresh();
            return null;
          })
        }
      >
        {x.pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Archive aria-hidden="true" />}
        전체 기록 백업 내려받기
      </Button>
      {x.error && <span role="alert" className="text-caption text-danger">{x.error}</span>}
    </>
  );
}

/** 단계를 넘기거나 확정한 뒤 아직 백업을 받지 않았으면 (ADR-0011) */
export function BackupNotice() {
  return (
    <Alert variant="info">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>지금 백업을 내려받아 보관하세요</AlertTitle>
      <AlertDescription>
        <p>단계를 넘기거나 확정한 뒤에는 이 시점의 전체 기록 엑셀을 받아 사내 보안 저장소에 보관합니다. 무료 DB는 자동 백업이 없습니다.</p>
        <BackupButton variant="default" />
      </AlertDescription>
    </Alert>
  );
}
