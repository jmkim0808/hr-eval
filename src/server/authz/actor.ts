// 지금 요청한 사람이 누구인지(actor)를 정한다. 모든 서버 동작은 requireActor()로 시작한다.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/server/db/client";
import { AUTH } from "@/server/auth/policy";
import { sessionHash } from "@/server/auth/service";
import * as repo from "@/server/repo/login";

export const SESSION_COOKIE = "hr_session";

export type Actor = {
  email: string;
  name: string;
  roles: { admin: boolean; ceo: boolean };
};

export const getActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const hash = await sessionHash(token);
  const s = await repo.findSession(db, hash);
  if (!s) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > AUTH.idleMs) {
    await repo.deleteSession(db, hash);
    return null;
  }
  const who = await repo.findLoginIdentity(db, s.email);
  if (!who) return null;
  await repo.touchSession(db, hash);
  return { email: who.email, name: who.name, roles: { admin: who.role === "admin", ceo: who.role === "ceo" } };
});

/** 로그인하지 않았거나 30분이 지났으면 이메일 인증 화면으로 보낸다. */
export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) {
    const hadSession = (await cookies()).has(SESSION_COOKIE);
    redirect(hadSession ? "/login?expired=1" : "/login");
  }
  return a;
}

export async function requireAdmin(): Promise<Actor> {
  const a = await requireActor();
  if (!a.roles.admin) redirect("/");
  return a;
}
