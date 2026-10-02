import { AppHeader } from "@/components/AppHeader";
import { requireParticipant } from "@/server/authz/actor";

export const dynamic = "force-dynamic";

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const a = await requireParticipant();
  return (
    <>
      <AppHeader viewer={a.name} link={a.roles.admin ? { href: "/admin", label: "관리자 화면" } : undefined} />
      {children}
    </>
  );
}
