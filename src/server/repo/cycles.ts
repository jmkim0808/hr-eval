import { and, desc, eq, sql as dsql } from "drizzle-orm";
import { fail, ok, type Result } from "@/lib/result";
import { checkPeriods, fmtDay, fmtRange, type PeriodErrors, type Periods } from "@/domain/periods";
import { getDb } from "@/server/db/client";
import { auditLogs, cyclePeople, emailOutbox, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

/** 가장 최근 정기평가 (없으면 null) */
export async function getCurrentCycle(actor: Actor) {
  assert(can.manageCycle(actor));
  const [c] = await getDb()
    .select({ id: reviewCycles.id, year: reviewCycles.year, status: reviewCycles.status, selfStart: reviewCycles.selfStart, selfEnd: reviewCycles.selfEnd, firstStart: reviewCycles.firstStart, firstEnd: reviewCycles.firstEnd, secondStart: reviewCycles.secondStart, secondEnd: reviewCycles.secondEnd })
    .from(reviewCycles)
    .orderBy(desc(reviewCycles.year))
    .limit(1);
  return c ?? null;
}

// ── 기간과 안내 이메일 (PRD 03) ──

/** 기간을 고칠 수 있는 단계: 2차평가가 끝나기 전 (마감일 연장 등) */
const PERIOD_EDITABLE = ["setup", "self_review", "first_review", "second_review"];

export async function getCycleDetail(actor: Actor, year: number) {
  assert(can.manageCycle(actor));
  const [c] = await getDb().select().from(reviewCycles).where(eq(reviewCycles.year, year)).limit(1);
  return c ?? null;
}

export async function savePeriods(actor: Actor, year: number, p: Periods): Promise<Result<undefined> | { ok: false; code: "invalid_periods"; message: string; errors: PeriodErrors }> {
  assert(can.manageCycle(actor));
  const errors = checkPeriods(p);
  if (Object.keys(errors).length > 0) return { ok: false, code: "invalid_periods", message: "기간을 확인해 주세요.", errors };
  const db = getDb();
  const [c] = await db.select().from(reviewCycles).where(eq(reviewCycles.year, year)).limit(1);
  if (!c) return fail("no_roster", "직원 명단을 먼저 올려 주세요.");
  if (!PERIOD_EDITABLE.includes(c.status)) return fail("locked", "2차평가가 끝난 뒤에는 기간을 바꿀 수 없습니다.");
  await db.update(reviewCycles).set({ ...p, version: c.version + 1, updatedAt: new Date() }).where(eq(reviewCycles.id, c.id));
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "cycle.periods", cycleId: c.id, detail: {} });
  return ok();
}

export type InviteReadiness = { targets: number; missingReviewer: number; periodsSet: boolean };

export async function inviteReadiness(actor: Actor, cycleId: string): Promise<InviteReadiness> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const [r] = await db
    .select({
      targets: dsql<number>`count(*)::int`,
      missing: dsql<number>`count(*) filter (where ${cyclePeople.firstReviewerId} is null or (${cyclePeople.formType} = 'member' and ${cyclePeople.secondReviewerId} is null))::int`,
    })
    .from(cyclePeople)
    .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)));
  const [c] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1);
  const periodsSet = !!c && [c.selfStart, c.selfEnd, c.firstStart, c.firstEnd, c.secondStart, c.secondEnd, c.bonusCutoff].every(Boolean);
  return { targets: r?.targets ?? 0, missingReviewer: r?.missing ?? 0, periodsSet };
}

/** 안내 이메일을 보낼 메일 목록에 쌓고 단계를 "개인작성"으로 연다. 한 번만 된다. */
export async function startInvites(actor: Actor, cycleId: string, version: number): Promise<Result<{ batchId: string; count: number }>> {
  assert(can.manageCycle(actor));
  const ready = await inviteReadiness(actor, cycleId);
  if (ready.targets === 0) return fail("no_roster", "직원 명단을 먼저 올려 주세요.");
  if (!ready.periodsSet) return fail("no_periods", "기간을 먼저 정해 주세요.");
  if (ready.missingReviewer > 0) return fail("missing_reviewer", `평가자가 비어 있는 사람이 ${ready.missingReviewer}명 있습니다.`);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1).for("update");
    if (!c) return fail("not_found", "평가를 찾을 수 없습니다.");
    if (c.status !== "setup") return fail("already", "안내 이메일은 이미 보냈습니다.");
    if (c.version !== version) return fail("stale", "다른 관리자가 먼저 바꿨습니다. 화면을 새로고침해 주세요.");
    const people = await tx
      .select({ id: cyclePeople.id, email: cyclePeople.email, name: cyclePeople.name })
      .from(cyclePeople)
      .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)));
    const batchId = crypto.randomUUID();
    const common = { year: String(c.year), selfRange: fmtRange(c.selfStart, c.selfEnd), bonusCutoff: fmtDay(c.bonusCutoff) };
    await tx.insert(emailOutbox).values(
      people.map((p) => ({ cycleId, kind: "invite" as const, toEmail: p.email, personId: p.id, batchId, createdBy: actor.email, payload: { ...common, name: p.name } })),
    );
    await tx.update(reviewCycles).set({ status: "self_review", invitedAt: new Date(), version: c.version + 1, updatedAt: new Date() }).where(eq(reviewCycles.id, cycleId));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "cycle.invite", cycleId, detail: { count: people.length } });
    return ok({ batchId, count: people.length });
  });
}

/** 가장 최근 안내 이메일 묶음 */
export async function latestBatch(actor: Actor, cycleId: string, kind: "invite" | "reminder" | "result_notice") {
  assert(can.manageCycle(actor));
  const [r] = await getDb()
    .select({ batchId: emailOutbox.batchId })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.cycleId, cycleId), eq(emailOutbox.kind, kind)))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(1);
  return r?.batchId ?? null;
}
