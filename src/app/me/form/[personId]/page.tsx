import { PageHeader } from "@/components/PageHeader";
import { fmtRange } from "@/domain/periods";
import { requireParticipant } from "@/server/authz/actor";
import { getSelfForm } from "@/server/repo/evaluations";
import { SelfForm } from "./SelfForm";

export default async function SelfFormPage({ params }: { params: Promise<{ personId: string }> }) {
  const a = await requireParticipant();
  const { personId } = await params;
  const f = await getSelfForm(a, personId);
  const formName = f.person.formType === "leader" ? "팀장용 인사평가지" : "팀원용 인사평가지";
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-6">
      <PageHeader
        title="평가지 작성"
        description={`${f.cycle.year}년 정기평가 · ${formName} · ${f.person.department || "부서 없음"} · ${f.person.name} · 개인작성 기간 ${fmtRange(f.cycle.selfStart, f.cycle.selfEnd)}`}
      />
      <SelfForm
        personId={f.person.id}
        formType={f.person.formType}
        year={f.cycle.year}
        editable={f.editable}
        initial={{ draft: f.draft, version: f.version, savedAt: f.updatedAt?.toISOString() ?? null, submittedAt: f.submittedAt?.toISOString() ?? null }}
      />
    </main>
  );
}
