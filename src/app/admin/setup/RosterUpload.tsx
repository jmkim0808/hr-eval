"use client";

import { CircleAlert, CircleCheck, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROSTER_HEADERS, ROSTER_MAX_BYTES, ROSTER_MAX_ROWS, type RawRosterRow } from "@/domain/roster";
import { cellText, downloadWorkbook, loadWorkbook, safeCell } from "@/lib/excel/browser";
import { applyRosterAction, previewRosterAction, type RosterPreview } from "./actions";

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "error"; message: string }
  | { kind: "preview"; rows: RawRosterRow[]; preview: RosterPreview; fileName: string }
  | { kind: "applied"; preview: RosterPreview };

export function RosterUpload({ locked }: { locked: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, start] = useTransition();

  async function template() {
    await downloadWorkbook("직원명단_템플릿.xlsx", (wb) => {
      const ws = wb.addWorksheet("직원 명단");
      ws.addRow([...ROSTER_HEADERS]);
      ws.getRow(1).font = { bold: true };
      ws.columns = ROSTER_HEADERS.map((h) => ({ width: h === "이메일" || h === "담당 임원" ? 28 : 14 }));
      ws.addRow(["(예시) 정하늘", "haneul@powernet.co.kr", "", "상무", "2010-03-02", "아니오", ""].map((v) => safeCell(v)));
      ws.addRow(["(예시) 최성호", "sungho@powernet.co.kr", "영업1팀", "부장", "2015-07-01", "예", "haneul@powernet.co.kr"].map((v) => safeCell(v)));
      ws.addRow(["(예시) 김민수", "minsu@powernet.co.kr", "영업1팀", "대리", "2021-03-02", "아니오", "haneul@powernet.co.kr"].map((v) => safeCell(v)));
      const help = wb.addWorksheet("작성 안내");
      [
        ["제목 줄(1행)은 바꾸지 마세요. 예시 줄은 지우고 작성하세요."],
        ["임원(이사·상무·전무·부사장·사장)도 명단에 넣으세요. 평가 대상이 아니라 평가자로 쓰입니다. 부서·담당 임원은 비워 둡니다."],
        ["팀장 여부: 예 / 아니오"],
        ["담당 임원: 그 사람의 2차 평가자(팀장은 평가자)인 임원의 이메일"],
        ["입사일: 2021-03-02 형식. 그해 7월 1일 이후 입사자는 평가에서 자동으로 빠집니다."],
      ].forEach((r) => help.addRow(r));
      help.getColumn(1).width = 110;
    });
  }

  async function onFile(file: File) {
    setState({ kind: "checking" });
    if (!file.name.toLowerCase().endsWith(".xlsx")) return setState({ kind: "error", message: ".xlsx 파일만 올릴 수 있습니다." });
    if (file.size > ROSTER_MAX_BYTES) return setState({ kind: "error", message: "1MB 이하 파일만 올릴 수 있습니다." });
    let rows: RawRosterRow[];
    try {
      const ws = (await loadWorkbook(file)).worksheets[0];
      if (!ws) return setState({ kind: "error", message: "시트를 찾을 수 없습니다." });
      const head = ROSTER_HEADERS.map((_, i) => cellText(ws.getRow(1).getCell(i + 1).value));
      if (head.join("|") !== ROSTER_HEADERS.join("|")) return setState({ kind: "error", message: "제목 줄이 템플릿과 다릅니다. 템플릿을 내려받아 그대로 작성해 주세요." });
      rows = [];
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const c = (i: number) => cellText(row.getCell(i).value);
        const values = [1, 2, 3, 4, 5, 6, 7].map(c);
        if (values.every((v) => !v) || values[0]!.startsWith("(예시)")) return;
        rows.push({ rowNo: n, name: values[0]!, email: values[1]!, department: values[2]!, position: values[3]!, hireDate: values[4]!, isTeamLeader: values[5]!, executiveEmail: values[6]! });
      });
    } catch {
      return setState({ kind: "error", message: "엑셀 파일을 읽을 수 없습니다." });
    }
    if (rows.length === 0) return setState({ kind: "error", message: "명단이 비어 있습니다." });
    if (rows.length > ROSTER_MAX_ROWS) return setState({ kind: "error", message: `${ROSTER_MAX_ROWS}줄까지만 올릴 수 있습니다.` });
    const r = await previewRosterAction(rows);
    if (!r.ok) return setState({ kind: "error", message: r.message });
    setState({ kind: "preview", rows, preview: r.value, fileName: file.name });
  }

  function apply() {
    if (state.kind !== "preview") return;
    const rows = state.rows;
    start(async () => {
      const r = await applyRosterAction(rows);
      setState(r.ok ? { kind: "applied", preview: r.value } : { kind: "error", message: r.message });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={template}>
          <Download aria-hidden="true" />
          템플릿 내려받기
        </Button>
        <Button variant="outline" disabled={locked || state.kind === "checking"} onClick={() => input.current?.click()}>
          {state.kind === "checking" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
          {state.kind === "checking" ? "확인 중" : "템플릿 올리기"}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          className="hidden"
          aria-label="직원 명단 파일"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />
      </div>

      {locked && (
        <Alert variant="neutral">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>안내 이메일을 보낸 뒤에는 명단을 다시 올릴 수 없습니다.</AlertDescription>
        </Alert>
      )}

      {state.kind === "error" && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>올릴 수 없습니다</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.kind === "applied" && (
        <Alert variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertTitle>반영 완료</AlertTitle>
          <AlertDescription>
            대상 {state.preview.counts.applied}명 · 제외 {state.preview.counts.excluded}명 (7월 이후 입사)
          </AlertDescription>
        </Alert>
      )}

      {state.kind === "preview" && (
        <div className="space-y-3">
          <Alert variant={state.preview.counts.needsCheck > 0 ? "warning" : "info"}>
            <FileSpreadsheet aria-hidden="true" />
            <AlertTitle>미리보기 · {state.fileName}</AlertTitle>
            <AlertDescription>
              <span>
                반영 {state.preview.counts.applied}명 · 제외 {state.preview.counts.excluded}명 (7월 이후 입사) · 확인 필요 {state.preview.counts.needsCheck}명
              </span>
              {state.preview.counts.needsCheck > 0 && <span className="text-caption">확인 필요 인원을 템플릿에서 고쳐 다시 올리면 [반영하기]를 누를 수 있습니다.</span>}
            </AlertDescription>
          </Alert>
          {state.preview.issues.length > 0 && (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">엑셀 줄</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>사유</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.preview.issues.map((i, k) => (
                    <TableRow key={k}>
                      <TableCell className="tabular-nums">{i.rowNo}</TableCell>
                      <TableCell>{i.name}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">
                          <CircleAlert aria-hidden="true" />
                          {i.reason}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Button onClick={apply} disabled={pending || state.preview.counts.needsCheck > 0}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            반영하기
          </Button>
        </div>
      )}
    </div>
  );
}
