import Link from "next/link";
import { Inbox } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { Icon } from "@/components/Icon";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle } from "@/server/repo/cycles";

export default async function ProgressPage() {
  const a = await requireAdmin();
  const cycle = await getCurrentCycle(a);
  return (
    <>
      <AdminNav current="/admin" />
      <main className="page">
        <div className="page-head">
          <div className="stack-1">
            <h1 className="t-page-title">진행 현황</h1>
            <p className="page-head__sub">지금 누가 어디서 멈춰 있는지 봅니다</p>
          </div>
        </div>
        {!cycle ? (
          <div className="box">
            <div className="empty">
              <Icon as={Inbox} size={20} />
              <span className="empty__title">아직 시작한 평가가 없습니다</span>
              <span>직원 명단을 올리고 기간을 정하면 평가를 시작할 수 있습니다.</span>
              <Link className="btn btn--primary" href="/admin/setup">
                평가 시작 설정
              </Link>
            </div>
          </div>
        ) : (
          <div className="box">
            <div className="box__body">{cycle.year}년 정기평가</div>
          </div>
        )}
      </main>
    </>
  );
}
