// 지금 요청한 사람이 누구인지(actor)를 정한다. 모든 서버 동작은 requireActor()로 시작한다.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/server/db/client";
import { AUTH } from "@/server/auth/policy";
import { sessionHash } from "@/server/auth/service";
import * as repo from "@/server/repo/login";
import { isOpen } from "@/server/crypto/vault";
import { devAutoUnlock } from "@/server/repo/vault";

export const SESSION_COOKIE = "hr_session";

export type Actor = {
  email: string;
  name: string;
  roles: { admin: boolean; ceo: boolean };
  /** 올해 평가 명단에서의 나 (관리자·대표이사만이면 null) */
  personId: string | null;
  /** 사번 — 포털 로그인 사람과 같은지 화면에서 확인한다 */
  employeeNo: string | null;
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
  return { email: who.email, name: who.name, roles: { admin: who.role === "admin", ceo: who.role === "ceo" }, personId: who.personId, employeeNo: who.employeeNo };
});

type Opts = { allowLocked?: boolean };

/**
 * 로그인하지 않았거나 30분이 지났으면 2차 인증 화면으로 보낸다.
 * 보안 열쇠가 잠겨 있으면(서버 재시작 뒤) 관리자는 열쇠 화면, 나머지는 안내 화면으로 보낸다 (ADR-0021).
 */
export async function requireActor(opts: Opts = {}): Promise<Actor> {
  const a = await getActor();
  if (!a) {
    const hadSession = (await cookies()).has(SESSION_COOKIE);
    redirect(hadSession ? "/login?expired=1" : "/login");
  }
  if (!opts.allowLocked && !isOpen()) {
    await devAutoUnlock();
    if (!isOpen()) redirect(a.roles.admin ? "/admin/vault" : "/locked");
  }
  return a;
}

/** 평가 명단에 있는 사람만 (내 할 일·평가지) */
export async function requireParticipant(): Promise<Actor & { personId: string }> {
  const a = await requireActor();
  if (!a.personId) redirect("/");
  return a as Actor & { personId: string };
}

export async function requireReportViewer(): Promise<Actor> {
  const a = await requireActor();
  if (!a.roles.ceo && !a.roles.admin) redirect("/");
  return a;
}

export async function requireAdmin(opts: Opts = {}): Promise<Actor> {
  const a = await requireActor(opts);
  if (!a.roles.admin) redirect("/");
  return a;
}
