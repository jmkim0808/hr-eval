import { redirect } from "next/navigation";
import { requireActor } from "@/server/authz/actor";

export const dynamic = "force-dynamic";

/** 역할에 맞는 첫 화면으로 보낸다 (UX 1-1). */
export default async function Home() {
  const a = await requireActor();
  if (a.roles.admin) redirect("/admin");
  if (a.personId) redirect("/me");
  redirect("/login");
}
