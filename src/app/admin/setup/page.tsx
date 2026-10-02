import { ArrowRightLeft, Mail } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { seoulYear } from "@/lib/time";
import { requireAdmin } from "@/server/authz/actor";
import { fmtDay, fmtRange } from "@/domain/periods";
import { inviteMail } from "@/server/mail/templates";
import { getCycleDetail, inviteReadiness, latestBatch } from "@/server/repo/cycles";
import { batchProgress } from "@/server/repo/outbox";
import { listReviewerCandidates, listTargets } from "@/server/repo/roster";
import { InviteCard } from "./InviteCard";
import { PeriodsForm } from "./PeriodsForm";
import { ReviewerSelect, type Candidate } from "./ReviewerSelect";
import { RosterUpload } from "./RosterUpload";

const GROUP = { 1: "1그룹 팀장", 2: "2그룹 부장", 3: "3그룹 차장", 4: "4그룹 과장", 5: "5그룹 대리이하" } as Record<number, string>;

export default async function SetupPage() {
  const a = await requireAdmin();
  const year = seoulYear();
  const cycle = await getCycleDetail(a, year);
  const targets = cycle ? await listTargets(a, cycle.id) : [];
  const cand = cycle ? await listReviewerCandidates(a, cycle.id) : [];
  const candidates: Candidate[] = cand.map((c) => ({ id: c.id, label: c.isExecutive ? `${c.name} (임원)` : `${c.name} (${c.department} 팀장)`, executive: c.isExecutive }));
  const ready = cycle ? await inviteReadiness(a, cycle.id) : null;
  const batchId = cycle ? await latestBatch(a, cycle.id, "invite") : null;
  const batch = batchId ? { id: batchId, progress: await batchProgress(a, batchId) } : null;
  const blockers = [
    !ready || ready.targets === 0 ? "직원 명단을 먼저 올려 주세요" : null,
    ready && !ready.periodsSet ? "기간을 먼저 정해 주세요" : null,
    ready && ready.missingReviewer > 0 ? `평가자가 비어 있는 사람이 ${ready.missingReviewer}명 있습니다` : null,
  ].filter((b): b is string => !!b);
  const preview = inviteMail("employee@powernet.co.kr", {
    year: String(year),
    name: "○○○",
    selfRange: fmtRange(cycle?.selfStart, cycle?.selfEnd),
    bonusCutoff: fmtDay(cycle?.bonusCutoff),
  });
  const periods = {
    selfStart: cycle?.selfStart ?? undefined,
    selfEnd: cycle?.selfEnd ?? undefined,
    firstStart: cycle?.firstStart ?? undefined,
    firstEnd: cycle?.firstEnd ?? undefined,
    secondStart: cycle?.secondStart ?? undefined,
    secondEnd: cycle?.secondEnd ?? undefined,
    bonusCutoff: cycle?.bonusCutoff ?? undefined,
  };
  const periodsLocked = !!cycle && !["setup", "self_review", "first_review", "second_review"].includes(cycle.status);
  const reviewerLocked = !!cycle && !["setup", "self_review"].includes(cycle.status);

  return (
    <>
      <AdminNav current="/admin/setup" />
      <main className="flex flex-col gap-6 px-8 py-6">
        <PageHeader title="평가 시작 설정" description={`${year}년 정기평가 · 누구를, 누가, 언제까지 평가할지 정합니다`} />

        <Card>
          <CardHeader>
            <CardTitle>① 직원 명단</CardTitle>
            <CardDescription>이름 · 이메일 · 부서 · 직급 · 입사일 · 팀장 여부 · 담당 임원</CardDescription>
          </CardHeader>
          <CardContent>
            <RosterUpload locked={!!cycle && cycle.status !== "setup"} />
          </CardContent>
        </Card>

        <Card className="pb-0">
          <CardHeader>
            <CardTitle>② 대상자 {targets.length > 0 && `${targets.length}명`}</CardTitle>
            <CardDescription>부서이동자는 평가 진행 시점 부서의 팀장 · 임원으로 고칩니다</CardDescription>
          </CardHeader>
          {targets.length === 0 ? (
            <CardContent className="pb-5 text-caption text-muted-foreground">직원 명단을 반영하면 대상자가 여기에 나옵니다.</CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead>직급</TableHead>
                  <TableHead>입사일</TableHead>
                  <TableHead>그룹</TableHead>
                  <TableHead>평가지</TableHead>
                  <TableHead>1차 평가자</TableHead>
                  <TableHead>2차 평가자</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.department}</TableCell>
                    <TableCell>{t.position}</TableCell>
                    <TableCell className="tabular-nums">{t.hireDate}</TableCell>
                    <TableCell>{t.gradeGroup ? GROUP[t.gradeGroup] : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.formType === "leader" ? "primary" : "secondary"}>{t.formType === "leader" ? "팀장용" : "팀원용"}</Badge>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <ReviewerSelect personId={t.id} slot="first" value={t.firstReviewerId} candidates={candidates} executivesOnly={t.formType === "leader"} disabled={reviewerLocked} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      {t.formType === "leader" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ReviewerSelect personId={t.id} slot="second" value={t.secondReviewerId} candidates={candidates} executivesOnly disabled={reviewerLocked} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <ArrowRightLeft className="size-3.5" aria-hidden="true" />
          평가자를 바꾸면 바로 저장됩니다. 1차평가가 시작되면 바꿀 수 없습니다.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>③ 기간</CardTitle>
            <CardDescription>기간 안에서는 자유롭게 쓰고 고칠 수 있습니다. 기간이 지나도 저절로 잠기지 않고, 관리자가 다음 단계로 넘기면 잠깁니다</CardDescription>
          </CardHeader>
          <CardContent>
            <PeriodsForm initial={periods} locked={!cycle || periodsLocked} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>④ 안내 이메일</CardTitle>
            <CardDescription>대상자에게 개인작성 기간과 들어오는 링크를 보냅니다. 점수는 담기지 않습니다</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <section aria-label="안내 이메일 미리보기" className="rounded-md border bg-muted/50">
              <div className="flex items-center gap-2 border-b px-4 py-2.5 text-caption">
                <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">제목</span>
                <span className="font-medium">{preview.subject}</span>
              </div>
              <pre className="whitespace-pre-wrap px-4 py-3 font-sans text-body text-text-secondary">{preview.text}</pre>
            </section>
            {cycle && <InviteCard version={cycle.version} blockers={blockers} targets={ready?.targets ?? 0} batch={batch} />}
            {!cycle && <InviteCard version={0} blockers={blockers} targets={0} batch={null} />}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
