import { AppHeader } from "@/components/AppHeader";
import { requireAdmin } from "@/server/authz/actor";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  return (
    <>
      <AppHeader viewer={a.name} link={a.personId ? { href: "/me", label: "내 할 일" } : undefined} />
      {children}
    </>
  );
}
