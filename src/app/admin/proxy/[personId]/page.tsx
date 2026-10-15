import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SelfForm } from "@/app/me/form/[personId]/SelfForm";
import { PageHeader } from "@/components/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { FORMS } from "@/domain/forms";
import { isUuid } from "@/lib/utils";
import { requireAdmin } from "@/server/authz/actor";
import { getFormForAdmin, SELF_PROXY_STAGES } from "@/server/repo/evaluations";
import { getFillForm } from "@/server/repo/final";
import { proxyComments, proxyWindow } from "@/server/repo/proxy";
import { ClosedNote, ProxyScoreForm } from "./ProxyScoreForm";

export const dynamic = "force-dynamic";

/** 관리자 대신 입력 (2026-10-15 피드백): 본인 평가지 + 평가자 점수 */
export default async function ProxyPage({ params }: { params: Promise<{ personId: string }> }) {
  const a = await requireAdmin();
  const { personId } = await params;
  if (!isUuid(personId)) notFound();
  const f = await getFormForAdmin(a, personId);
  const fill = await getFillForm(a, personId);
  const comments = await proxyComments(a, personId);
  if (!fill) notFound();
  const st = f.cycle.status;
  const form = f.person.formType;
  const selfOpen = SELF_PROXY_STAGES.includes(st);
  const raters = form === "member" ? (["first", "second"] as const) : (["first"] as const);
  const label = (r: "first" | "second") => (form === "leader" ? "임원" : r === "first" ? "1차" : "2차");
  const open = raters.filter((r) => proxyWindow(form, r) === st);
  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        <Link href="/admin" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-3 w-fit" })}>
          <ChevronLeft aria-hidden="true" />
          진행 현황
        </Link>
        <PageHeader
          title={`관리자 대신 입력 · ${f.person.name}`}
          description={`${f.cycle.year}년 정기평가 · ${f.person.department || "부서 없음"} · 출장·외근 등으로 직접 입력하지 못한 내용을 받아서 넣습니다`}
        />

        <h2 className="text-subsection-title font-bold">본인 평가지 {f.proxyBy && <span className="text-caption font-normal text-info">· 관리자 대신 입력함</span>}</h2>
        {selfOpen ? (
          <SelfForm personId={f.person.id} formType={form} year={f.cycle.year} editable proxy initial={{ draft: f.draft, version: f.version, savedAt: null, submittedAt: f.submittedAt?.toISOString() ?? null }} />
        ) : (
          <ClosedNote text="본인 평가지는 2차평가가 끝나기 전까지 대신 입력할 수 있습니다." />
        )}

        <h2 className="text-subsection-title font-bold">평가자 점수</h2>
        {open.length ? (
          open.map((r) => <ProxyScoreForm key={r} personId={f.person.id} rater={r} label={label(r)} items={FORMS[form]} cells={fill[r]} submitted={false} comment={comments[r]} />)
        ) : st === "final_review" ? (
          <ClosedNote text="최종평가 단계에서는 [최종평가] 화면의 '빈칸 대신 입력'으로 빈 칸만 채울 수 있습니다." />
        ) : (
          <ClosedNote text={`평가자 점수는 ${form === "leader" ? "2차평가" : "1차평가(1차)·2차평가(2차)"} 단계에 대신 입력할 수 있습니다.`} />
        )}
      </main>
    </>
  );
}
