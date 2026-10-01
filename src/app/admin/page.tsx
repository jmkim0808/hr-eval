import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { PageHeader } from "@/components/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle } from "@/server/repo/cycles";

export default async function ProgressPage() {
  const a = await requireAdmin();
  const cycle = await getCurrentCycle(a);
  return (
    <>
      <AdminNav current="/admin" />
      <main className="flex flex-col gap-6 px-8 py-6">
        <PageHeader title="진행 현황" description="지금 누가 어디서 멈춰 있는지 봅니다" />
        {!cycle ? (
          <Card>
            <Empty
              icon={<ClipboardList aria-hidden="true" />}
              title="아직 시작한 평가가 없습니다"
              action={
                <Link className={buttonVariants()} href="/admin/setup">
                  평가 시작 설정
                </Link>
              }
            >
              직원 명단을 올리고 기간을 정하면 평가를 시작할 수 있습니다.
            </Empty>
          </Card>
        ) : (
          <Card className="px-5">{cycle.year}년 정기평가</Card>
        )}
      </main>
    </>
  );
}
