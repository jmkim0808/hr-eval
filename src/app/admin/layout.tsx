import { AdminSidebar, AdminTopNav } from "@/components/AdminNav";
import { AppHeader } from "@/components/AppHeader";
import { requireAdmin } from "@/server/authz/actor";

export const dynamic = "force-dynamic";

// 관리자 화면 틀 (2026-10-15 SaaS 스타일): 왼쪽 세로 메뉴 + 위쪽 머리줄 + 본문
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin({ allowLocked: true }); // 열쇠 화면도 이 틀 안에 있다. 다른 관리자 화면은 각 화면에서 다시 확인
  return (
    <div className="flex flex-1">
      <AdminSidebar meHref={a.personId ? "/me" : undefined} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader viewer={a.name} employeeNo={a.employeeNo} link={a.personId ? { href: "/me", label: "내 할 일" } : undefined} sidebar />
        <AdminTopNav />
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
