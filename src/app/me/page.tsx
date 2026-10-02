import Link from "next/link";
import { Award, ChevronRight, CircleCheck, ClipboardCheck, Clock, Eye, FilePen, Inbox, Lock, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
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

type Task = { key: string; href: string; title: string; done: boolean; badges: React.ReactNode; icon: React.ReactNode };

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
      href: `/me/review/${g.kind}/${first.id}`,
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-6">
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
                  "group flex items-center gap-5 rounded-lg border bg-card px-6 shadow-xs transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
                  i === 0 && !task.done ? "py-5" : "py-4",
                  task.done && "bg-card/60",
                )}
              >
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", task.done ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground")}>{task.icon}</span>
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
