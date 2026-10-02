import Link from "next/link";
import { isUuid } from "@/lib/utils";
import { notFound } from "next/navigation";
import { CircleCheck, FilePen, Clock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { FORMS } from "@/domain/forms";
import { fmtRange } from "@/domain/periods";
import { REVIEW, type ReviewKind } from "@/domain/review";
import { cn } from "@/lib/utils";
import { requireParticipant } from "@/server/authz/actor";
import { getReview, listReviewGroups } from "@/server/repo/reviews";
import { ReviewForm } from "./ReviewForm";

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
  const next = after.find((p) => p.status !== "done") ?? after[0];
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 py-6">
      <PageHeader title={`평가하기 · ${def.label}`} description={`${r.cycle.year}년 정기평가 · ${def.windowLabel} 기간 ${range} · ${group.people.length}명 중 ${done}명 완료`} />
      <div className="grid items-start gap-5 lg:grid-cols-[15rem_1fr]">
        <Card className="gap-0 py-0" aria-label="평가할 사람">
          <ul>
            {group.people.map((p) => (
              <li key={p.id} className="border-b last:border-b-0">
                <Link
                  href={`/me/review/${kind}/${p.id}`}
                  aria-current={p.id === personId ? "page" : undefined}
                  className={cn("flex items-center justify-between gap-2 px-4 py-2.5 text-body hover:bg-muted", p.id === personId && "bg-accent font-semibold text-accent-foreground")}
                >
                  <span className="flex flex-col">
                    <span>{p.name}</span>
                    <span className="text-label font-normal text-muted-foreground">{p.department || p.position}</span>
                  </span>
                  <StatusMark status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
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
          initial={{ scores: r.mine, version: r.version, submittedAt: r.submittedAt }}
          nextHref={next && next.id !== personId ? `/me/review/${kind}/${next.id}` : null}
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
