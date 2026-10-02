// 진행 현황 (PRD 05). 관리자만.
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { fmtDay } from "@/domain/periods";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { auditLogs, cyclePeople, emailOutbox, evaluations, evaluationScores, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

export type PendingRow = {
  personId: string;
  name: string;
  department: string;
  role: string;
  status: "not_started" | "writing";
  lastReminder: string | null;
};

export type StageProgress = { total: number; submitted: number; pending: PendingRow[] };

/** 개인작성 단계: 평가지 주인이 제출했는지. (1차·2차는 07·08번에서 더한다) */
export async function selfStageProgress(actor: Actor, cycleId: string): Promise<StageProgress> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const people = await db
    .select({
      id: cyclePeople.id,
      name: cyclePeople.name,
      department: cyclePeople.department,
      formType: cyclePeople.formType,
      submittedAt: evaluations.selfSubmittedAt,
      evId: evaluations.id,
      hasText: sql<boolean>`coalesce(length(${evaluations.achievementText}) + length(${evaluations.improvementText}), 0) > 0`,
    })
    .from(cyclePeople)
    .leftJoin(evaluations, eq(evaluations.personId, cyclePeople.id))
    .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)))
    .orderBy(cyclePeople.department, cyclePeople.name);
  const pendingPeople = people.filter((p) => !p.submittedAt);
  const evIds = pendingPeople.map((p) => p.evId).filter((x): x is string => !!x);
  const scored = new Set(
    evIds.length
      ? (await db.selectDistinct({ id: evaluationScores.evaluationId }).from(evaluationScores).where(and(inArray(evaluationScores.evaluationId, evIds), eq(evaluationScores.rater, "self")))).map((r) => r.id)
      : [],
  );
  const reminders = pendingPeople.length
    ? await db
        .select({ personId: emailOutbox.personId, at: max(emailOutbox.createdAt) })
        .from(emailOutbox)
        .where(and(eq(emailOutbox.cycleId, cycleId), eq(emailOutbox.kind, "reminder"), inArray(emailOutbox.personId, pendingPeople.map((p) => p.id))))
        .groupBy(emailOutbox.personId)
    : [];
  const lastOf = new Map(reminders.map((r) => [r.personId, r.at]));
  return {
    total: people.length,
    submitted: people.length - pendingPeople.length,
    pending: pendingPeople.map((p) => ({
      personId: p.id,
      name: p.name,
      department: p.department,
      role: p.formType === "leader" ? "팀장 (본인 작성)" : "직원 (본인 작성)",
      status: p.hasText || (p.evId && scored.has(p.evId)) ? "writing" : "not_started",
      lastReminder: lastOf.get(p.id)?.toISOString() ?? null,
    })),
  };
}

/** 고른 미제출자에게 독촉 이메일을 메일 목록에 쌓는다 */
export async function queueReminders(actor: Actor, cycleId: string, personIds: string[]): Promise<Result<{ batchId: string; count: number }>> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const [c] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1);
  if (!c || c.status !== "self_review") return fail("stage", "지금 단계에서는 독촉할 수 없습니다.");
  const progress = await selfStageProgress(actor, cycleId);
  const pendingIds = new Set(progress.pending.map((p) => p.personId));
  const ids = personIds.filter((id) => pendingIds.has(id));
  if (ids.length === 0) return fail("empty", "독촉할 미제출자를 골라 주세요.");
  const people = await db.select({ id: cyclePeople.id, email: cyclePeople.email, name: cyclePeople.name }).from(cyclePeople).where(inArray(cyclePeople.id, ids));
  const batchId = crypto.randomUUID();
  await db.insert(emailOutbox).values(
    people.map((p) => ({
      cycleId,
      kind: "reminder" as const,
      toEmail: p.email,
      personId: p.id,
      batchId,
      createdBy: actor.email,
      payload: { name: p.name, year: String(c.year), task: "평가지 작성", due: fmtDay(c.selfEnd) },
    })),
  );
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "cycle.remind", cycleId, detail: { count: people.length } });
  return ok({ batchId, count: people.length });
}
