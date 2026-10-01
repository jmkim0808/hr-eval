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
      <main className="flex flex-1 items-start justify-center px-4 pt-16">
        <LoginForm expired={sp.expired === "1"} initialEmail={sp.email ?? ""} />
      </main>
    </>
  );
}
