import Link from "next/link";
import { ChevronRight, CircleCheck, Clock, FilePen, Inbox, Lock, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { fmtDay, fmtRange } from "@/domain/periods";
import { daysLeft, seoulToday } from "@/lib/time";
import { requireParticipant } from "@/server/authz/actor";
import { getMyTasks } from "@/server/repo/evaluations";

export default async function MyTasksPage() {
  const a = await requireParticipant();
  const t = await getMyTasks(a);
  const self = t.self;
  const today = seoulToday();
  const overdue = !!self && self.editable && !!t.cycle.selfEnd && today > t.cycle.selfEnd;
  const left = t.cycle.selfEnd ? daysLeft(t.cycle.selfEnd, today) : null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-6">
      <PageHeader
        title="내 할 일"
        description={
          t.cycle.status === "self_review"
            ? `${t.cycle.year}년 정기평가 · 개인작성 기간 ${fmtRange(t.cycle.selfStart, t.cycle.selfEnd)}${left !== null && left >= 0 ? ` · D-${left}` : ""}`
            : `${t.cycle.year}년 정기평가`
        }
      />
      {!self ? (
        <Card>
          <Empty icon={<Inbox aria-hidden="true" />} title="지금 할 일이 없습니다">
            평가할 차례가 되면 이메일로 알려 드립니다.
          </Empty>
        </Card>
      ) : (
        <Link
          href={`/me/form/${self.personId}`}
          className="group flex items-center gap-5 rounded-lg border bg-card px-6 py-5 shadow-xs transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FilePen className="size-5" aria-hidden="true" />
          </span>
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="text-section-title font-bold">내 평가지 작성 — 마감 {fmtDay(t.cycle.selfEnd)}</span>
            <span className="flex flex-wrap items-center gap-2">
              <SelfBadge status={self.status} editable={self.editable} end={fmtDay(t.cycle.selfEnd)} />
              {overdue && (
                <Badge variant="warning">
                  <TriangleAlert aria-hidden="true" />
                  기한 지남
                </Badge>
              )}
            </span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      )}
    </main>
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
