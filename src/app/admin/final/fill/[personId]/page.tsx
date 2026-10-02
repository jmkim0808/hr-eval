import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { PageHeader } from "@/components/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { FORMS } from "@/domain/forms";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle } from "@/server/repo/cycles";
import { getFillForm } from "@/server/repo/final";
import { FillForm } from "./FillForm";

export default async function FillPage({ params }: { params: Promise<{ personId: string }> }) {
  const a = await requireAdmin();
  const { personId } = await params;
  const f = await getFillForm(a, personId);
  if (!f) notFound();
  const cycle = await getCurrentCycle(a);
  return (
    <>
      <AdminNav current="/admin/final" />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-6">
        <Link href="/admin/final" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-3 w-fit" })}>
          <ChevronLeft aria-hidden="true" />
          최종평가
        </Link>
        <PageHeader
          title={`평가하기 (관리자 대신 입력) · ${f.person.name}`}
          description={`${f.person.department || "부서 없음"} · ${f.person.formType === "leader" ? "팀장용 인사평가지" : "팀원용 인사평가지"} · 평가자에게 받은 점수를 빈 칸에만 넣습니다. 넣은 사람이 기록됩니다`}
        />
        <FillForm
          personId={f.person.id}
          formType={f.person.formType}
          items={FORMS[f.person.formType]}
          first={f.first}
          second={f.second}
          open={cycle?.status === "final_review"}
        />
      </main>
    </>
  );
}
