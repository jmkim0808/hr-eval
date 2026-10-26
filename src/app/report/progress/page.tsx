import { Activity } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DeptBars } from "@/components/DeptBars";
import { StageBar } from "@/components/StageBar";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtRange } from "@/domain/periods";
import { requireReportViewer } from "@/server/authz/actor";
import { execProgress } from "@/server/repo/progress";

const TITLE: Record<string, string> = { self_review: "평가지 제출", first_review: "1차 평가 제출", second_review: "2차 평가·팀장 평가 제출" };

/** 대표이사 진행 현황 (2026-10-26): 단계·제출률·부서별·미제출자 이름만 — 점수·평가 내용·독촉은 인사 관리자 화면에서 */
export default async function ExecProgressPage() {
  const a = await requireReportViewer();
  const { cycle, stage, depts } = await execProgress(a);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="진행 현황" description={`${cycle ? `${cycle.year}년 정기평가 · ` : ""}누가 어디까지 했는지 보기 전용 · 점수·평가 내용은 보이지 않습니다`} />
      {!cycle || cycle.status === "setup" ? (
        <Card>
          <Empty icon={<Activity aria-hidden="true" />} title="아직 시작한 평가가 없습니다">
            인사 담당자가 안내 이메일을 보내면 여기서 진행 상황을 볼 수 있습니다.
          </Empty>
        </Card>
      ) : (
        <>
          <StageBar
            status={cycle.status as Parameters<typeof StageBar>[0]["status"]}
            notes={{
              0: cycle.selfStart ? fmtRange(cycle.selfStart, cycle.selfEnd) : undefined,
              1: cycle.firstStart ? fmtRange(cycle.firstStart, cycle.firstEnd) : undefined,
              2: cycle.secondStart ? fmtRange(cycle.secondStart, cycle.secondEnd) : undefined,
            }}
          />
          {stage ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2" data-testid="exec-submitted" data-value={`${stage.submitted}/${stage.total}`}>
                <StatCard
                  label={TITLE[cycle.status] ?? "제출"}
                  value={`${stage.submitted} / ${stage.total}`}
                  foot={<Progress value={stage.total ? (stage.submitted / stage.total) * 100 : 0} aria-label="제출" className="mt-1" />}
                />
                <StatCard label="남은 사람" value={`${stage.pending.length}명`} foot="독촉·대신 입력은 인사 담당자가 합니다" />
              </div>
              {depts.length > 0 && (
                <Card className="gap-3 px-6" data-testid="exec-depts">
                  <h2 className="text-subsection-title font-bold">부서별 {TITLE[cycle.status] ?? "진행"}</h2>
                  <DeptBars depts={depts} />
                </Card>
              )}
              {stage.pending.length > 0 && (
                <Card className="pb-0">
                  <h2 className="px-6 text-subsection-title font-bold">아직 제출하지 않은 사람</h2>
                  <Table data-testid="exec-pending">
                    <TableHeader>
                      <TableRow>
                        <TableHead>이름</TableHead>
                        <TableHead>부서</TableHead>
                        <TableHead>역할</TableHead>
                        <TableHead>상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stage.pending.map((p) => (
                        <TableRow key={`${p.name}-${p.department}`}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.department}</TableCell>
                          <TableCell>{p.role}</TableCell>
                          <TableCell>
                            <Badge variant={p.status === "writing" ? "primary" : "secondary"}>{p.status === "writing" ? "작성 중" : "시작 전"}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </>
          ) : (
            <Card className="px-6 py-5 text-body text-text-secondary">
              제출 단계가 끝났습니다. {["final_review", "confirmed", "results_sent", "closed"].includes(cycle.status) && "등급은 [등급 결과]에서 보세요."}
            </Card>
          )}
        </>
      )}
    </main>
  );
}
