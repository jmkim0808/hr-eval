"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadWorkbook, safeCell } from "@/lib/excel/browser";
import type { OverviewPerson } from "@/server/repo/overview";
import { logOverviewExportAction } from "./actions";

const f1 = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(1));
const f2 = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(2));
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
};

/** 그룹별(평가 데이터 전체) / 부서별(최종점수·가점만, 등급 없음) */
export function OverviewTable({ year, view, people }: { year: number; view: "group" | "dept"; people: OverviewPerson[] }) {
  const [pending, start] = useTransition();
  const keyOf = (p: OverviewPerson) => (view === "dept" ? p.department || "부서 없음" : p.groupLabel);
  const sections = [...new Map(people.map((p) => [keyOf(p), [] as OverviewPerson[]])).keys()]
    .sort((a, b) => (view === "group" ? people.find((p) => keyOf(p) === a)!.group - people.find((p) => keyOf(p) === b)!.group : a.localeCompare(b, "ko")))
    .map((k) => ({ key: k, rows: people.filter((p) => keyOf(p) === k).sort((a, b) => (b.final ?? -1) - (a.final ?? -1) || a.name.localeCompare(b.name, "ko")) }));

  function excel() {
    start(async () => {
      const headers =
        view === "dept"
          ? ["부서", "이름", "직급", "그룹", "가점", "최종점수"]
          : ["그룹", "이름", "부서", "직급", "본인평가", "1차 역량", "1차 업적", "1차 점수", "2차 역량", "2차 업적", "2차 점수", "가점", "최종점수"];
      const rows = sections.flatMap((s) =>
        s.rows.map((p) =>
          view === "dept"
            ? [s.key, p.name, p.position, p.groupLabel, p.bonus, p.final]
            : [p.groupLabel, p.name, p.department, p.position, p.selfSubmitted ? "제출" : "미제출", p.first.competency, p.first.achievement, p.first.total, p.second?.competency ?? null, p.second?.achievement ?? null, p.second?.total ?? null, p.bonus, p.final],
        ),
      );
      await downloadWorkbook(
        `${year}_전체현황_${view === "dept" ? "부서별" : "그룹별"}.xlsx`,
        (wb) => {
          const ws = wb.addWorksheet(view === "dept" ? "부서별" : "그룹별");
          ws.addRow(headers);
          ws.getRow(1).font = { bold: true };
          rows.forEach((r) => ws.addRow(r.map((v) => (typeof v === "string" ? safeCell(v) : v))));
        },
        { target: `인사평가 ${year} 전체 현황 (${view === "dept" ? "부서별" : "그룹별"})`, rows: rows.length },
      );
      await logOverviewExportAction({ rows: rows.length, view });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button variant="outline" onClick={excel} disabled={pending}>
          <Download aria-hidden="true" />
          엑셀 내려받기
        </Button>
      </div>
      {sections.map((s) => (
        <Card key={s.key} className="pb-0" data-section={s.key}>
          <CardHeader>
            <CardTitle>
              {s.key} · {s.rows.length}명
            </CardTitle>
            <CardDescription>
              평균 최종점수 {f2(avg(s.rows.map((r) => r.final)))} · 평균 가점 {f2(avg(s.rows.map((r) => r.bonus)))}
            </CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              {view === "dept" ? (
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>직급</TableHead>
                  <TableHead>그룹</TableHead>
                  <TableHead className="text-right">가점</TableHead>
                  <TableHead className="text-right">최종점수</TableHead>
                </TableRow>
              ) : (
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead>본인평가</TableHead>
                  <TableHead className="text-right">1차 역량</TableHead>
                  <TableHead className="text-right">1차 업적</TableHead>
                  <TableHead className="text-right">1차 점수</TableHead>
                  <TableHead className="text-right">2차 역량</TableHead>
                  <TableHead className="text-right">2차 업적</TableHead>
                  <TableHead className="text-right">2차 점수</TableHead>
                  <TableHead className="text-right">가점</TableHead>
                  <TableHead className="text-right">최종점수</TableHead>
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {s.rows.map((p) => (
                <TableRow key={p.id} data-person={p.name}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  {view === "dept" ? (
                    <>
                      <TableCell>{p.position}</TableCell>
                      <TableCell>{p.groupLabel}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{p.department || "—"}</TableCell>
                      <TableCell>{p.selfSubmitted ? "제출" : "미제출"}</TableCell>
                      <TableCell className="text-right tabular-nums">{f1(p.first.competency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{f1(p.first.achievement)}</TableCell>
                      <TableCell className="text-right tabular-nums">{f2(p.first.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.isLeader ? "해당 없음" : f1(p.second?.competency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.isLeader ? "" : f1(p.second?.achievement)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.isLeader ? "" : f2(p.second?.total)}</TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums">{f2(p.bonus)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{f2(p.final)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
