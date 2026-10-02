"use client";

import { CircleAlert, CircleCheck, Download, Loader2, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BONUS_HEADERS, BONUS_ITEMS, BONUS_MAX_ROWS, type BonusCheck, type BonusRow, type RawBonusRow } from "@/domain/bonus";
import { cellText, downloadWorkbook, loadWorkbook, safeCell } from "@/lib/excel/browser";
import { applyBonusAction, previewBonusAction } from "./actions";

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "error"; message: string }
  | { kind: "preview"; rows: RawBonusRow[]; check: BonusCheck }
  | { kind: "applied"; count: number };

const MAX_BYTES = 1024 * 1024;

export function BonusUpload({ roster, locked, cutoff }: { roster: (Pick<BonusRow, "name" | "email" | "department" | "isLeader" | "values">)[]; locked: boolean; cutoff: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, start] = useTransition();

  async function template() {
    await downloadWorkbook("가점_템플릿.xlsx", (wb) => {
      const ws = wb.addWorksheet("가점");
      ws.addRow(BONUS_HEADERS);
      ws.getRow(1).font = { bold: true };
      ws.columns = BONUS_HEADERS.map((h) => ({ width: h === "이메일" ? 28 : 14 }));
      for (const r of roster) {
        const vals = BONUS_ITEMS.map((i) => ("leaderOnly" in i && !r.isLeader ? "—" : r.values && r.values[i.code] !== 0 ? String(r.values[i.code]) : ""));
        const row = ws.addRow([r.name, r.email, r.department, ...vals].map((v) => safeCell(v)));
        if (!r.isLeader) row.getCell(BONUS_HEADERS.length).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF0F4" } };
      }
      const help = wb.addWorksheet("작성 안내");
      [
        ["이름·이메일·부서는 바꾸지 마세요. 이메일로 사람을 찾고, 이름이 다르면 반영하지 않습니다."],
        ["빈칸은 0점입니다. 소수 둘째 자리까지 넣을 수 있습니다."],
        ["징계사항은 감점이라 0 이하(예: -1)로 넣습니다. 합계에서 빠집니다."],
        ["다면평가는 팀장만 넣습니다. 팀원 줄의 다면평가 칸(—)은 비워 두세요."],
        [`가점 인정 기준일: ${cutoff}`],
      ].forEach((r) => help.addRow(r));
      help.getColumn(1).width = 100;
    });
  }

  async function onFile(file: File) {
    setState({ kind: "checking" });
    if (!file.name.toLowerCase().endsWith(".xlsx")) return setState({ kind: "error", message: ".xlsx 파일만 올릴 수 있습니다." });
    if (file.size > MAX_BYTES) return setState({ kind: "error", message: "1MB 이하 파일만 올릴 수 있습니다." });
    let rows: RawBonusRow[];
    try {
      const ws = (await loadWorkbook(file)).worksheets[0];
      if (!ws) return setState({ kind: "error", message: "시트를 찾을 수 없습니다." });
      const head = BONUS_HEADERS.map((_, i) => cellText(ws.getRow(1).getCell(i + 1).value));
      if (head.join("|") !== BONUS_HEADERS.join("|")) return setState({ kind: "error", message: "제목 줄이 템플릿과 다릅니다. 템플릿을 내려받아 그대로 작성해 주세요." });
      rows = [];
      ws.eachRow((row, n) => {
        if (n === 1) return;
        rows.push({ rowNo: n, values: BONUS_HEADERS.map((_, i) => cellText(row.getCell(i + 1).value).slice(0, 100)) });
      });
      if (rows.length > BONUS_MAX_ROWS) return setState({ kind: "error", message: `${BONUS_MAX_ROWS}줄까지만 올릴 수 있습니다.` });
    } catch {
      return setState({ kind: "error", message: "엑셀 파일을 읽지 못했습니다. 템플릿으로 다시 작성해 주세요." });
    }
    const r = await previewBonusAction(rows);
    setState(r.ok ? { kind: "preview", rows, check: r.value } : { kind: "error", message: r.message });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={template}>
          <Download aria-hidden="true" />
          템플릿 내려받기
        </Button>
        <Button disabled={locked || state.kind === "checking"} onClick={() => input.current?.click()}>
          {state.kind === "checking" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
          {state.kind === "checking" ? "확인 중" : "템플릿 올리기"}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          className="hidden"
          aria-label="가점 템플릿 파일"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />
      </div>
      {state.kind === "error" && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.kind === "applied" && (
        <Alert variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>반영 완료 · {state.count}명</AlertDescription>
        </Alert>
      )}
      {state.kind === "preview" && (
        <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-4">
          <p className="font-semibold">
            {state.check.total}명 중 {state.check.matched.length}명 일치
            {state.check.mismatched.length > 0 && <span className="text-danger"> · 이름이 맞지 않는 {state.check.mismatched.length}명</span>}
            {state.check.invalid.length > 0 && <span className="text-warning"> · 확인 필요 {state.check.invalid.length}명</span>}
          </p>
          {(state.check.mismatched.length > 0 || state.check.invalid.length > 0) && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>엑셀 줄</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>이유</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.check.mismatched.map((m) => (
                  <TableRow key={`m${m.rowNo}`}>
                    <TableCell className="tabular-nums">{m.rowNo}</TableCell>
                    <TableCell>{m.name || "(빈칸)"}</TableCell>
                    <TableCell className="text-danger">이름 불일치 · {m.reason}</TableCell>
                  </TableRow>
                ))}
                {state.check.invalid.map((m) => (
                  <TableRow key={`i${m.rowNo}`}>
                    <TableCell className="tabular-nums">{m.rowNo}</TableCell>
                    <TableCell>{m.name}</TableCell>
                    <TableCell className="text-warning">{m.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-caption text-muted-foreground">맞지 않는 사람은 반영하지 않습니다. 템플릿을 고쳐 다시 올리거나 아래 표에서 줄을 눌러 직접 입력하세요.</p>
          <div className="flex gap-2">
            <Button
              disabled={pending || state.check.matched.length === 0}
              onClick={() =>
                start(async () => {
                  const r = await applyBonusAction(state.rows);
                  setState(r.ok ? { kind: "applied", count: r.value.count } : { kind: "error", message: r.message });
                })
              }
            >
              {state.check.matched.length}명 반영하기
            </Button>
            <Button variant="outline" onClick={() => setState({ kind: "idle" })}>
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
