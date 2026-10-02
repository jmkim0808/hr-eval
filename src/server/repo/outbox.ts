// 보낼 메일 목록 (ADR-0006). 쌓기·진행 숫자·다시 보내기는 관리자만, 내보내기는 예약 실행(시스템)이 한다.
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { cyclePeople, emailOutbox, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";
import { sendMail } from "@/server/mail/sender";
import { renderOutbox } from "@/server/mail/templates";

export const DRAIN_BATCH = 10; // 무료 플랜 CPU 한도 대비 (ADR-0002)
const MAX_ATTEMPTS = 3;

export type BatchProgress = { total: number; sent: number; failed: number; pending: number; failedPeople: { id: string; name: string }[] };

export async function batchProgress(actor: Actor, batchId: string): Promise<BatchProgress> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const rows = await db
    .select({ status: emailOutbox.status, n: sql<number>`count(*)::int` })
    .from(emailOutbox)
    .where(eq(emailOutbox.batchId, batchId))
    .groupBy(emailOutbox.status);
  const c = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const failedPeople = await db
    .select({ id: emailOutbox.id, name: cyclePeople.name })
    .from(emailOutbox)
    .leftJoin(cyclePeople, eq(cyclePeople.id, emailOutbox.personId))
    .where(and(eq(emailOutbox.batchId, batchId), eq(emailOutbox.status, "failed")))
    .orderBy(asc(cyclePeople.name));
  const sent = c.sent ?? 0;
  const failed = c.failed ?? 0;
  const pending = (c.queued ?? 0) + (c.sending ?? 0);
  return { total: sent + failed + pending, sent, failed, pending, failedPeople: failedPeople.map((f) => ({ id: f.id, name: f.name ?? "(이름 없음)" })) };
}

export async function retryFailed(actor: Actor, batchId: string) {
  assert(can.manageCycle(actor));
  const [c] = await getDb()
    .select({ status: reviewCycles.status })
    .from(emailOutbox)
    .innerJoin(reviewCycles, eq(reviewCycles.id, emailOutbox.cycleId))
    .where(eq(emailOutbox.batchId, batchId))
    .limit(1);
  if (c?.status === "closed") return; // 마감 뒤에는 보기 전용
  await getDb()
    .update(emailOutbox)
    .set({ status: "queued", attempts: 0, lastError: null })
    .where(and(eq(emailOutbox.batchId, batchId), eq(emailOutbox.status, "failed")));
}

/**
 * 시스템 작업: 쌓인 메일을 최대 DRAIN_BATCH통 보낸다. 여러 곳에서 동시에 불러도 같은 메일을 두 번 보내지 않는다.
 * 받는 사람·내용은 기록하지 않는다.
 */
export async function drainOutbox(limit = DRAIN_BATCH): Promise<number> {
  const db = getDb();
  // 5분 넘게 "보내는 중"에 멈춘 것은 다시 줄 세운다
  await db.update(emailOutbox).set({ status: "queued" }).where(and(eq(emailOutbox.status, "sending"), lt(emailOutbox.claimedAt, new Date(Date.now() - 5 * 60_000))));
  const claimed = await db.execute<{ id: string; kind: string; to_email: string; payload: Record<string, string>; attempts: number }>(sql`
    update email_outbox set status = 'sending', claimed_at = now(), attempts = attempts + 1
    where id in (select id from email_outbox where status = 'queued' order by created_at limit ${limit} for update skip locked)
    returning id, kind, to_email, payload, attempts`);
  let done = 0;
  for (const m of claimed) {
    try {
      await sendMail(renderOutbox(m.kind, m.to_email, m.payload));
      await db.update(emailOutbox).set({ status: "sent", sentAt: new Date(), lastError: null }).where(eq(emailOutbox.id, m.id));
      done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 120) : "send failed";
      await db
        .update(emailOutbox)
        .set({ status: m.attempts >= MAX_ATTEMPTS ? "failed" : "queued", lastError: msg })
        .where(eq(emailOutbox.id, m.id));
    }
  }
  return done;
}

export async function hasQueued(): Promise<boolean> {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(emailOutbox).where(inArray(emailOutbox.status, ["queued"]));
  return (r?.n ?? 0) > 0;
}
