// 로그인 전 단계에서 쓰는 저장소 함수. 아직 actor가 없으므로 예외적으로 actor 인자를 받지 않는다
// (docs/tech/03-규칙.md 7: 이메일 인증 예외).
import { and, desc, eq, gt, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { appUsers, authCodes, cyclePeople, reviewCycles, sessions } from "@/server/db/schema";

export type LoginIdentity = { email: string; name: string; role: "admin" | "ceo" | null; personId: string | null };

/**
 * 들어올 수 있는 사람인지: 관리자·대표이사, 또는 안내 이메일을 보낸 뒤의 평가 명단(직원·팀장·임원).
 * 열람 차단된 사람은 명단에 있어도 들어올 수 없다.
 */
export async function findLoginIdentity(db: Db, email: string): Promise<LoginIdentity | null> {
  const [u] = await db
    .select({ email: appUsers.email, name: appUsers.name, role: appUsers.role })
    .from(appUsers)
    .where(and(eq(appUsers.email, email), eq(appUsers.active, true)))
    .limit(1);
  const [p] = await db
    .select({ id: cyclePeople.id, name: cyclePeople.name, blocked: cyclePeople.accessBlocked })
    .from(cyclePeople)
    .innerJoin(reviewCycles, eq(reviewCycles.id, cyclePeople.cycleId))
    .where(and(eq(cyclePeople.email, email), ne(reviewCycles.status, "setup")))
    .orderBy(desc(reviewCycles.year))
    .limit(1);
  const person = p && !p.blocked ? p : null;
  if (!u && !person) return null;
  return { email, name: u?.name ?? person!.name, role: u?.role ?? null, personId: person?.id ?? null };
}

export async function countCodeRequestsSince(db: Db, by: { email?: string; ip?: string }, since: Date) {
  const cond = by.email ? eq(authCodes.email, by.email) : eq(authCodes.requestIp, by.ip ?? "");
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(authCodes).where(and(cond, gt(authCodes.createdAt, since)));
  return r?.n ?? 0;
}

export async function latestCodeRequest(db: Db, email: string) {
  const [r] = await db.select().from(authCodes).where(eq(authCodes.email, email)).orderBy(desc(authCodes.createdAt)).limit(1);
  return r ?? null;
}

export async function insertCode(db: Db, v: { email: string; codeHash: string | null; expiresAt: Date; requestIp: string | null }) {
  await db.insert(authCodes).values(v);
}

/** 아직 쓰지 않은 가장 최근 인증번호 (실제로 보낸 것만) */
export async function latestSentCode(db: Db, email: string) {
  const [r] = await db
    .select()
    .from(authCodes)
    .where(and(eq(authCodes.email, email), isNotNull(authCodes.codeHash), isNull(authCodes.consumedAt)))
    .orderBy(desc(authCodes.createdAt))
    .limit(1);
  return r ?? null;
}

export async function addAttempt(db: Db, id: string) {
  await db.update(authCodes).set({ attempts: sql`${authCodes.attempts} + 1` }).where(eq(authCodes.id, id));
}

export async function consumeCode(db: Db, id: string) {
  const r = await db
    .update(authCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(authCodes.id, id), isNull(authCodes.consumedAt)))
    .returning({ id: authCodes.id });
  return r.length === 1;
}

export async function insertSession(db: Db, v: { tokenHash: string; email: string; expiresAt: Date }) {
  await db.insert(sessions).values(v);
}

export async function findSession(db: Db, tokenHash: string) {
  const [s] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  return s ?? null;
}

export async function touchSession(db: Db, tokenHash: string) {
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteSession(db: Db, tokenHash: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
