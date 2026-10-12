import { AppHeader } from "@/components/AppHeader";
import { requireAdmin } from "@/server/authz/actor";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin({ allowLocked: true }); // 열쇠 화면도 이 틀 안에 있다. 다른 관리자 화면은 각 화면에서 다시 확인
  return (
    <>
      <AppHeader viewer={a.name} employeeNo={a.employeeNo} link={a.personId ? { href: "/me", label: "내 할 일" } : undefined} />
      {children}
    </>
  );
}
