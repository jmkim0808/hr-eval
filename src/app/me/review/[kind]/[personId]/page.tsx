import Link from "next/link";
import { isUuid } from "@/lib/utils";
import { notFound } from "next/navigation";
import { CircleCheck, FilePen, Clock, ListChecks } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { FORMS } from "@/domain/forms";
import { fmtRange } from "@/domain/periods";
import { REVIEW, type ReviewKind } from "@/domain/review";
import { cn } from "@/lib/utils";
import { requireParticipant } from "@/server/authz/actor";
import { getReview, listReviewGroups } from "@/server/repo/reviews";
import { HUE } from "@/components/Tile";
import { ReviewForm } from "./ReviewForm";

const HUES = [HUE.blue, HUE.violet, HUE.green, HUE.orange, HUE.teal, HUE.pink];

const ORDER = ["setup", "self_review", "first_review", "second_review", "final_review", "confirmed", "results_sent", "closed"];

export default async function ReviewPage({ params }: { params: Promise<{ kind: string; personId: string }> }) {
  const a = await requireParticipant();
  const { kind: k, personId } = await params;
  if (!isUuid(personId)) notFound();
  if (!(k in REVIEW)) notFound();
  const kind = k as ReviewKind;
  const r = await getReview(a, kind, personId);
  const group = (await listReviewGroups(a)).find((g) => g.kind === kind)!;
  const idx = group.people.findIndex((p) => p.id === personId);
  const after = [...group.people.slice(idx + 1), ...group.people.slice(0, idx)];
  const next = after.find((p) => p.status !== "done" && p.id !== personId);
  const def = REVIEW[kind];
  const range = fmtRange(group.range[0], group.range[1]);
  const before = ORDER.indexOf(r.cycle.status) < ORDER.indexOf(def.window);
  const notice = r.editable
    ? null
    : before
      ? kind === "first"
        ? `${def.windowLabel} 기간(${range})에 입력할 수 있습니다. 지금은 보기만 됩니다.`
        : `${r.cycle.status === "first_review" ? "1차평가 진행 중 — " : ""}2차평가 기간에 입력할 수 있습니다.`
      : `${def.windowLabel} 단계가 끝나 고칠 수 없습니다.`;
  const done = group.people.filter((p) => p.status === "done").length;

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader back={{ href: "/me", label: "내 할 일" }}
        title={`평가하기 · ${def.label}`}
        description={`${r.cycle.year}년 정기평가 · ${def.windowLabel} 기간 ${range} · ${group.people.length}명 중 ${done}명 완료`}
        actions={
          <Link href={`/me/review/${kind}`} className={buttonVariants({ variant: "outline" })}>
            <ListChecks aria-hidden="true" />내 평가 현황
          </Link>
        }
      />
      <nav aria-label="평가할 사람" className="-mx-1.5 flex gap-2.5 overflow-x-auto px-1.5 py-1.5">
        {group.people.map((q, n) => (
          <Link
            key={q.id}
            href={`/me/review/${kind}/${q.id}`}
            aria-current={q.id === personId ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-2xl border border-border/70 bg-card py-2 pr-4 pl-2 shadow-card transition-colors hover:border-brand/40",
              q.id === personId && "border-foreground ring-1 ring-foreground",
            )}
          >
            <span
              className={cn(
                "relative flex size-9 items-center justify-center rounded-full text-caption font-bold",
                HUES[n % HUES.length],
                q.status === "done" && "ring-2 ring-success ring-offset-2 ring-offset-card",
                q.status === "writing" && "outline-2 outline-offset-2 outline-brand outline-dashed",
              )}
            >
              {q.name.slice(0, 1)}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-body font-semibold">{q.name}</span>
              <StatusMark status={q.status} />
            </span>
          </Link>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-5">
        <ReviewForm
          key={personId}
          kind={kind}
          label={def.label}
          person={r.person}
          items={FORMS[r.person.formType]}
          year={r.cycle.year}
          visible={r.visible}
          editable={r.editable}
          showMine={r.editable || !before}
          notice={notice}
          self={r.self}
          firstScores={r.firstScores}
          firstComment={r.firstComment}
          initial={{ scores: r.mine, comment: r.myComment, version: r.version, submittedAt: r.submittedAt }}
          nextHref={next ? `/me/review/${kind}/${next.id}` : null}
          overviewHref={`/me/review/${kind}`}
          bundle={r.bundle}
          bonus={r.bonus}
          bonusFinal={["confirmed", "results_sent", "closed"].includes(r.cycle.status)}
        />
      </div>
    </main>
  );
}

function StatusMark({ status }: { status: "todo" | "writing" | "done" }) {
  if (status === "done")
    return (
      <span className="flex items-center gap-1 text-label text-success">
        <CircleCheck className="size-3.5" aria-hidden="true" />
        완료
      </span>
    );
  if (status === "writing")
    return (
      <span className="flex items-center gap-1 text-label text-info">
        <FilePen className="size-3.5" aria-hidden="true" />
        작성 중
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-label text-muted-foreground">
      <Clock className="size-3.5" aria-hidden="true" />
      미평가
    </span>
  );
}
