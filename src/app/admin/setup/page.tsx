import { Inbox } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { Icon } from "@/components/Icon";

// 직원 명단 올리기는 PRD 02에서 만든다.
export default function SetupPage() {
  return (
    <>
      <AdminNav current="/admin/setup" />
      <main className="page">
        <div className="page-head">
          <div className="stack-1">
            <h1 className="t-page-title">평가 시작 설정</h1>
            <p className="page-head__sub">누구를, 누가, 언제까지 평가할지 정합니다</p>
          </div>
        </div>
        <div className="box">
          <div className="empty">
            <Icon as={Inbox} size={20} />
            <span className="empty__title">직원 명단을 먼저 올려 주세요</span>
            <span>직원 명단 올리기는 다음 조각에서 열립니다.</span>
          </div>
        </div>
      </main>
    </>
  );
}
