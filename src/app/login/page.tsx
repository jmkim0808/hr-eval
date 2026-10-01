import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getActor } from "@/server/authz/actor";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string; email?: string }> }) {
  if (await getActor()) redirect("/");
  const sp = await searchParams;
  return (
    <>
      <AppHeader />
      <main className="auth">
        <LoginForm expired={sp.expired === "1"} initialEmail={sp.email ?? ""} />
      </main>
    </>
  );
}
