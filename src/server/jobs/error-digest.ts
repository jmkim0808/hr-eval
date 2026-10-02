// 오류 요약 메일 (PRD 19, ADR-0013). 예약 실행(1분마다)이 부르지만, 서울 시각 아침 8시 이후 하루 한 번만 동작한다.
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { appUsers, auditLogs, emailOutbox, errorLogs } from "@/server/db/schema";

const DIGEST = "system.error_digest";
const SEND_HOUR = 8;

/** 서울 날짜·시 */
function seoul(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export type DigestOutcome = "too_early" | "already" | "no_errors" | "queued";

export async function runErrorDigest(now = new Date()): Promise<DigestOutcome> {
  const { day, hour } = seoul(now);
  if (hour < SEND_HOUR) return "too_early";
  const db = getDb();
  return db.transaction(async (tx) => {
    // 여러 예약 실행이 겹쳐도 하루 한 번만
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${DIGEST}))`);
    const [done] = await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.action, DIGEST), sql`${auditLogs.detail}->>'day' = ${day}`)).limit(1);
    if (done) return "already";
    const end = new Date(`${day}T0${SEND_HOUR}:00:00+09:00`);
    const start = new Date(end.getTime() - 24 * 3600_000);
    const errors = await tx.select({ id: errorLogs.requestId }).from(errorLogs).where(and(gte(errorLogs.createdAt, start), lt(errorLogs.createdAt, end))).orderBy(errorLogs.createdAt);
    await tx.insert(auditLogs).values({ actorEmail: "system", action: DIGEST, detail: { day, count: errors.length } });
    if (errors.length === 0) return "no_errors";
    const admins = await tx.select({ email: appUsers.email }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)));
    const ids = [...new Set(errors.map((e) => e.id))];
    const fmt = (d: Date) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", hour12: false }).format(d);
    const payload = { digest: "1", count: String(errors.length), range: `${fmt(start)} ~ ${fmt(end)}`, ids: ids.slice(0, 20).join(", ") + (ids.length > 20 ? ` 외 ${ids.length - 20}건` : "") };
    const batchId = crypto.randomUUID();
    if (admins.length) await tx.insert(emailOutbox).values(admins.map((a) => ({ kind: "admin_alert" as const, toEmail: a.email, batchId, createdBy: "system", payload })));
    return "queued";
  });
}
