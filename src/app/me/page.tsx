import Link from "next/link";
import { Award, ChevronRight, History, Medal, CircleCheck, ClipboardCheck, Clock, Eye, FilePen, Inbox, Lock, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Tile, type Hue } from "@/components/Tile";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { fmtDay, fmtRange } from "@/domain/periods";
import { REVIEW } from "@/domain/review";
import { cn } from "@/lib/utils";
import { daysLeft, seoulToday } from "@/lib/time";
import { requireParticipant } from "@/server/authz/actor";
import { getMyTasks } from "@/server/repo/evaluations";
import { listReviewGroups } from "@/server/repo/reviews";
import { listHistory } from "@/server/repo/history";

type Task = { key: string; href: string; title: string; done: boolean; badges: React.ReactNode; icon: React.ReactNode; hue?: Hue };
const HUE_OF: Record<string, Hue> = { result: "violet", self: "blue", first: "teal", second: "teal", leader: "teal", bonus: "green", history: "orange" };

export default async function MyTasksPage() {
  const a = await requireParticipant();
  const t = await getMyTasks(a);
  const groups = await listReviewGroups(a);
  const today = seoulToday();
  const c = t.cycle;
  const cur =
    c.status === "self_review" ? ["개인작성", c.selfStart, c.selfEnd] : c.status === "first_review" ? ["1차평가", c.firstStart, c.firstEnd] : c.status === "second_review" ? ["2차평가", c.secondStart, c.secondEnd] : null;
  const left = cur?.[2] ? daysLeft(cur[2], today) : null;

  const tasks: Task[] = [];
  if (t.self && ["results_sent", "closed"].includes(c.status)) {
    tasks.push({ key: "result", href: "/me/result", title: "평가결과가 나왔습니다", done: false, icon: <Award className="size-5" aria-hidden="true" />, badges: <Badge variant="info">내 평가결과 보기</Badge> });
  }
  if (t.self) {
    const overdue = t.self.editable && !!c.selfEnd && today > c.selfEnd;
    tasks.push({
      key: "self",
      href: `/me/form/${t.self.personId}`,
      title: `내 평가지 작성 — 마감 ${fmtDay(c.selfEnd)}`,
      done: !t.self.editable || t.self.status === "submitted",
      icon: <FilePen className="size-5" aria-hidden="true" />,
      badges: (
        <>
          <SelfBadge status={t.self.status} editable={t.self.editable} end={fmtDay(c.selfEnd)} />
          {overdue && <Overdue />}
        </>
      ),
    });
  }
  for (const g of groups) {
    const def = REVIEW[g.kind];
    const n = g.people.length;
    const remain = g.people.filter((p) => p.status !== "done").length;
    const first = g.people.find((p) => p.status !== "done" && p.visible) ?? g.people.find((p) => p.status !== "done") ?? g.people[0]!;
    const overdue = g.open && !!g.range[1] && today > g.range[1] && remain > 0;
    tasks.push({
      key: g.kind,
      href: remain === 0 ? `/me/review/${g.kind}` : `/me/review/${g.kind}/${first.id}`, // 모두 끝났으면 내 평가 현황
      title: `${def.label} — ${remain === 0 ? `${n}명 중 ${n}명 완료` : `${def.who ? `${def.who} ` : ""}${n}명 중 ${remain}명 남음`}`,
      done: remain === 0,
      icon: <ClipboardCheck className="size-5" aria-hidden="true" />,
      badges: (
        <>
          {g.open ? (
            remain === 0 ? (
              <Badge variant="success">
                <CircleCheck aria-hidden="true" />
                모두 제출 — {fmtDay(g.range[1])}까지 고칠 수 있습니다
              </Badge>
            ) : (
              <Badge variant="info">
                <FilePen aria-hidden="true" />
                {def.windowLabel} 기간 {fmtRange(g.range[0], g.range[1])}
              </Badge>
            )
          ) : (
            <Badge variant="secondary">
              <Eye aria-hidden="true" />
              {remain > 0 && ["self_review", "first_review"].includes(c.status) && def.window !== c.status ? `보기만 · ${def.windowLabel} 기간에 입력` : "보기만"}
            </Badge>
          )}
          {overdue && <Overdue />}
        </>
      ),
    });
  }
  tasks.sort((x, y) => Number(x.done) - Number(y.done));
  // 지난 평가 기록 (2026-10-15)
  const history = await listHistory(a);
  if (history.length)
    tasks.push({ key: "history", href: "/me/history", title: "지난 평가 기록", done: true, icon: <History className="size-5" aria-hidden="true" />, badges: <Badge variant="secondary">{history.map((h) => h.year).join(" · ")}년 평가지(업적)·결과 보기</Badge> });
  // 내 가점: 할 일은 아니지만 언제든 확인할 수 있게 맨 아래에 둔다 (2026-10-15)
  if (t.self && c.status !== "setup")
    tasks.push({ key: "bonus", href: "/me/bonus", title: "내 가점 확인", done: true, icon: <Medal className="size-5" aria-hidden="true" />, badges: <Badge variant="secondary">들어오거나 고쳐지면 바로 반영 · 틀리면 정정 요청</Badge> });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="내 할 일" description={`${c.year}년 정기평가${cur ? ` · ${cur[0]} 기간 ${fmtRange(cur[1], cur[2])}${left !== null && left >= 0 ? ` · D-${left}` : ""}` : ""}`} />
      {tasks.length === 0 ? (
        <Card>
          <Empty icon={<Inbox aria-hidden="true" />} title="지금 할 일이 없습니다">
            평가할 차례가 되면 이메일로 알려 드립니다.
          </Empty>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="할 일">
          {tasks.map((task, i) => (
            <li key={task.key} data-task={task.key} data-done={task.done || undefined}>
              <Link
                href={task.href}
                className={cn(
                  "group flex items-center gap-5 rounded-2xl border border-border/70 bg-card px-6 shadow-card transition-all hover:-translate-y-px hover:border-brand/30 hover:shadow-overlay focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
                  i === 0 && !task.done ? "py-5" : "py-4",
                  task.done && "bg-card/60",
                )}
              >
                <Tile size="lg" hue={task.done && !["bonus", "history"].includes(task.key) ? "gray" : (HUE_OF[task.key] ?? "blue")}>{task.icon}</Tile>
                <span className="flex flex-1 flex-col gap-1.5">
                  <span className={cn("font-bold", i === 0 && !task.done ? "text-section-title" : "text-subsection-title")}>{task.title}</span>
                  <span className="flex flex-wrap items-center gap-2">{task.badges}</span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Overdue() {
  return (
    <Badge variant="warning">
      <TriangleAlert aria-hidden="true" />
      기한 지남
    </Badge>
  );
}

function SelfBadge({ status, editable, end }: { status: "not_started" | "writing" | "submitted"; editable: boolean; end: string }) {
  if (status === "submitted")
    return editable ? (
      <Badge variant="success">
        <CircleCheck aria-hidden="true" />
        제출 완료 — {end}까지 고칠 수 있습니다
      </Badge>
    ) : (
      <Badge variant="secondary">
        <Lock aria-hidden="true" />
        제출 완료 (잠김)
      </Badge>
    );
  if (!editable)
    return (
      <Badge variant="secondary">
        <Lock aria-hidden="true" />
        미제출 (잠김)
      </Badge>
    );
  return status === "writing" ? (
    <Badge variant="info">
      <FilePen aria-hidden="true" />
      작성 중
    </Badge>
  ) : (
    <Badge variant="secondary">
      <Clock aria-hidden="true" />
      작성 전
    </Badge>
  );
}
