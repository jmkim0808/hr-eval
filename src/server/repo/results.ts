// 결과 알림과 내 평가결과 (PRD 16). 등급조정 여부는 직원에게 어떤 형태로도 주지 않는다.
import { and, eq, inArray, max } from "drizzle-orm";
import { BONUS_ITEMS, type BonusCode } from "@/domain/bonus";
import type { Grade } from "@/domain/grading";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { auditLogs, bonusPoints, cyclePeople, emailOutbox, finalResults, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

/** 확정 뒤 결과 알림을 쌓고 단계를 "결과 발송"으로 */
export async function sendResultNotices(actor: Actor, cycleId: string, version: number): Promise<Result<{ batchId: string; count: number }>> {
  assert(can.manageCycle(actor));
  return getDb().transaction(async (tx) => {
    const [c] = await tx.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1).for("update");
    if (!c || c.status !== "confirmed") return fail("stage", "평가등급을 확정하면 보낼 수 있습니다.");
    if (c.version !== version) return fail("stale", "다른 관리자가 먼저 처리했습니다. 화면을 새로고침해 주세요.");
    const people = await tx.select({ id: cyclePeople.id, email: cyclePeople.email, name: cyclePeople.name }).from(cyclePeople).where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)));
    const batchId = crypto.randomUUID();
    await tx.insert(emailOutbox).values(people.map((p) => ({ cycleId, kind: "result_notice" as const, toEmail: p.email, personId: p.id, batchId, createdBy: actor.email, payload: { name: p.name, year: String(c.year) } })));
    await tx.update(reviewCycles).set({ status: "results_sent", version: c.version + 1, updatedAt: new Date() }).where(eq(reviewCycles.id, cycleId));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "cycle.results_sent", cycleId, detail: { count: people.length } });
    return ok({ batchId, count: people.length });
  });
}

export type MyResult = {
  year: number;
  name: string;
  isLeader: boolean;
  first: number | null;
  second: number | null;
  bonus: { label: string; points: number }[];
  bonusTotal: number;
  final: number;
  grade: Grade;
  percentile: number;
  groupSize: number;
};

/** 내 평가결과. 열람할 때마다 작업 기록에 "결과 열람"을 남긴다 */
export async function getMyResult(actor: Actor): Promise<{ status: "not_yet" } | { status: "ok"; result: MyResult }> {
  if (!actor.personId) return { status: "not_yet" };
  const db = getDb();
  const [row] = await db
    .select({ p: cyclePeople, c: reviewCycles, f: finalResults })
    .from(cyclePeople)
    .innerJoin(reviewCycles, eq(reviewCycles.id, cyclePeople.cycleId))
    .leftJoin(finalResults, eq(finalResults.personId, cyclePeople.id))
    .where(eq(cyclePeople.id, actor.personId))
    .limit(1);
  if (!row || !row.f || !row.f.finalScore || !row.f.finalGrade || !can.viewOwnResult(actor, row.p.id, row.c.status)) return { status: "not_yet" };
  const bonus = await db.select().from(bonusPoints).where(eq(bonusPoints.personId, row.p.id));
  const by = new Map(bonus.map((b) => [b.item as BonusCode, Number(b.points)]));
  const items = BONUS_ITEMS.filter((i) => !("leaderOnly" in i) || row.p.formType === "leader").map((i) => ({ label: i.label, points: by.get(i.code) ?? 0 }));
  const groupSize = (await db.select({ id: cyclePeople.id }).from(cyclePeople).where(and(eq(cyclePeople.cycleId, row.c.id), eq(cyclePeople.isTarget, true), eq(cyclePeople.gradeGroup, row.p.gradeGroup ?? 0)))).length;
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "result.view", cycleId: row.c.id, personId: row.p.id, detail: {} });
  return {
    status: "ok",
    result: {
      year: row.c.year,
      name: row.p.name,
      isLeader: row.p.formType === "leader",
      first: row.f.firstTotal === null ? null : Number(row.f.firstTotal),
      second: row.f.secondTotal === null ? null : Number(row.f.secondTotal),
      bonus: items,
      bonusTotal: Number(row.f.bonusTotal ?? 0),
      final: Number(row.f.finalScore),
      grade: row.f.finalGrade,
      percentile: Number(row.f.displayPercentile ?? 0),
      groupSize,
    },
  };
}

/** 관리자: 사람별 결과 알림 발송 상태와 마지막 열람 시각 */
export async function resultViews(actor: Actor, cycleId: string) {
  assert(can.manageCycle(actor));
  const db = getDb();
  const people = await db.select({ id: cyclePeople.id, name: cyclePeople.name, department: cyclePeople.department }).from(cyclePeople).where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true))).orderBy(cyclePeople.department, cyclePeople.name);
  const ids = people.map((p) => p.id);
  const views = ids.length ? await db.select({ id: auditLogs.personId, at: max(auditLogs.createdAt) }).from(auditLogs).where(and(eq(auditLogs.action, "result.view"), inArray(auditLogs.personId, ids))).groupBy(auditLogs.personId) : [];
  const v = new Map(views.map((x) => [x.id, x.at]));
  return people.map((p) => ({ ...p, viewedAt: v.get(p.id)?.toISOString() ?? null }));
}

/** 평가 마감 (PRD 17). 결과 알림 뒤에만. 메일 실패자가 남아도 된다(수기 전달). 마감 뒤에는 모든 화면이 보기 전용 */
export async function closeCycle(actor: Actor, cycleId: string, version: number): Promise<Result> {
  assert(can.manageCycle(actor));
  return getDb().transaction(async (tx) => {
    const [c] = await tx.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1).for("update");
    if (!c || c.status !== "results_sent") return fail("stage", "평가결과 알림을 보낸 뒤에 마감할 수 있습니다.");
    if (c.version !== version) return fail("stale", "다른 관리자가 먼저 처리했습니다. 화면을 새로고침해 주세요.");
    const now = new Date();
    await tx.update(reviewCycles).set({ status: "closed", closedAt: now, closedBy: actor.name, version: c.version + 1, updatedAt: now }).where(eq(reviewCycles.id, cycleId));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "cycle.close", cycleId, detail: {} });
    return ok();
  });
}

/** 보관 기한: 마감일 + 3년 (ADR-0010) */
export const retentionUntil = (closedAt: Date) => {
  const d = new Date(closedAt);
  d.setFullYear(d.getFullYear() + 3);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
};
