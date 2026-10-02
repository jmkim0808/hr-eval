import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SelfForm } from "@/app/me/form/[personId]/SelfForm";
import { AdminNav } from "@/components/AdminNav";
import { PageHeader } from "@/components/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { fmtRange } from "@/domain/periods";
import { requireAdmin } from "@/server/authz/actor";
import { getFormForAdmin } from "@/server/repo/evaluations";

export default async function AdminFormView({ params }: { params: Promise<{ personId: string }> }) {
  const a = await requireAdmin();
  const { personId } = await params;
  const f = await getFormForAdmin(a, personId);
  const formName = f.person.formType === "leader" ? "팀장용 인사평가지" : "팀원용 인사평가지";
  const status = f.status === "submitted" ? "제출 완료" : f.status === "writing" ? "작성 중" : "작성 전";
  return (
    <>
      <AdminNav current="/admin" />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-6">
        <Link href="/admin" className={buttonVariants({ variant: "ghost", size: "sm", className: "w-fit -ml-3" })}>
          <ChevronLeft aria-hidden="true" />
          진행 현황
        </Link>
        <PageHeader
          title={`${f.person.name} 평가지`}
          description={`${f.cycle.year}년 정기평가 · ${formName} · ${f.person.department || "부서 없음"} · ${status} · 개인작성 기간 ${fmtRange(f.cycle.selfStart, f.cycle.selfEnd)}`}
        />
        <SelfForm
          personId={f.person.id}
          formType={f.person.formType}
          year={f.cycle.year}
          editable={false}
          lockedNote="관리자는 보기만 할 수 있습니다. 내용은 본인만 고칩니다."
          initial={{ draft: f.draft, version: f.version, savedAt: null, submittedAt: f.submittedAt?.toISOString() ?? null }}
        />
      </main>
    </>
  );
}
