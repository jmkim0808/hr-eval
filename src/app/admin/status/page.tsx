import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle } from "@/server/repo/cycles";
import { adminOverview } from "@/server/repo/overview";
import { OverviewTable } from "./OverviewTable";

export const dynamic = "force-dynamic";

/** 전체 현황 (2026-10-15 피드백): 지금까지 들어간 점수와 가점으로 바로 계산한 값. 등급은 최종평가 화면에서 */
export default async function StatusPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const a = await requireAdmin();
  const cycle = await getCurrentCycle(a);
  const view = (await searchParams).view === "dept" ? "dept" : "group";
  const people = cycle && cycle.status !== "setup" ? await adminOverview(a, cycle.id) : [];
  const tab = (v: "group" | "dept", label: string) => (
    <Link href={`/admin/status?view=${v}`} aria-current={view === v ? "page" : undefined} className={cn("rounded-md border px-3 py-1.5 text-caption", view === v ? "border-primary bg-accent font-semibold text-accent-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
      {label}
    </Link>
  );
  return (
    <>
      <main className="flex flex-col gap-6 px-8 py-6">
        <PageHeader
          title="전체 현황"
          description="지금까지 들어간 점수와 가점으로 바로 계산합니다 (가점을 넣으면 즉시 반영) · 점수가 다 들어가야 최종점수가 나옵니다 · 등급은 [최종평가]에서"
        />
        {!people.length ? (
          <Card>
            <Empty icon={<ClipboardList aria-hidden="true" />} title="안내 메일을 보낸 뒤부터 볼 수 있습니다">
              평가가 시작되면 사람별 점수가 여기에 모입니다.
            </Empty>
          </Card>
        ) : (
          <>
            <div className="flex gap-2">
              {tab("group", "그룹별 (평가 데이터 전체)")}
              {tab("dept", "부서별 (최종점수·가점)")}
            </div>
            <OverviewTable year={cycle!.year} view={view} people={people} />
          </>
        )}
      </main>
    </>
  );
}
