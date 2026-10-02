// 관리자 설정 (PRD 18). 관리자만. 마지막 1명은 해제할 수 없다.
import { and, asc, eq, sql } from "drizzle-orm";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { appUsers, auditLogs } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

export async function listAdmins(actor: Actor) {
  assert(can.manageCycle(actor));
  return getDb().select({ email: appUsers.email, name: appUsers.name, since: appUsers.createdAt }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true))).orderBy(asc(appUsers.createdAt));
}

export async function addAdmin(actor: Actor, email: string, name: string): Promise<Result> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const [u] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
  if (u?.role === "ceo" && u.active) return fail("ceo", "대표이사 계정은 관리자로 바꿀 수 없습니다.");
  if (u?.role === "admin" && u.active) return fail("exists", "이미 관리자입니다.");
  const display = name.trim() || email.split("@")[0]!;
  await db
    .insert(appUsers)
    .values({ email, name: display, role: "admin" })
    .onConflictDoUpdate({ target: appUsers.email, set: { name: display, role: "admin", active: true, updatedAt: new Date() } });
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "admin.add", detail: { email } });
  return ok();
}

export async function removeAdmin(actor: Actor, email: string): Promise<Result> {
  assert(can.manageCycle(actor));
  return getDb().transaction(async (tx) => {
    // 동시에 두 명을 해제해 0명이 되지 않도록 잠근다
    await tx.execute(sql`lock table ${appUsers} in share row exclusive mode`);
    const admins = await tx.select({ email: appUsers.email }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)));
    if (!admins.some((a) => a.email === email)) return fail("not_found", "관리자가 아닙니다.");
    if (admins.length <= 1) return fail("last", "마지막 관리자는 해제할 수 없습니다.");
    await tx.update(appUsers).set({ active: false, updatedAt: new Date() }).where(eq(appUsers.email, email));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "admin.remove", detail: { email } });
    return ok();
  });
}
