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
  /** 누르면 열 평가지 (평가자 줄은 없음) */
  formHref: string | null;
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
      formHref: `/admin/forms/${p.id}`,
      name: p.name,
      department: p.department,
      role: p.formType === "leader" ? "팀장 (본인 작성)" : "직원 (본인 작성)",
      status: p.hasText || (p.evId && scored.has(p.evId)) ? "writing" : "not_started",
      lastReminder: lastOf.get(p.id)?.toISOString() ?? null,
    })),
  };
}

/**
 * 1차·2차평가 단계: 평가자별로 아직 제출하지 않은 평가가 남았는지.
 * 1차 = 팀원 평가지의 1차 평가자, 2차 = 팀원 평가지의 2차 평가자 + 팀장 평가지의 평가자(임원)
 */
export async function reviewStageProgress(actor: Actor, cycleId: string, stage: "first_review" | "second_review"): Promise<StageProgress> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const targets = await db
    .select({ p: cyclePeople, ev: evaluations })
    .from(cyclePeople)
    .leftJoin(evaluations, eq(evaluations.personId, cyclePeople.id))
    .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)));
  type Job = { reviewer: string | null; evId: string | null; rater: "first" | "second"; done: boolean };
  const jobs: Job[] = [];
  for (const { p, ev } of targets) {
    if (stage === "first_review" && p.formType === "member") jobs.push({ reviewer: p.firstReviewerId, evId: ev?.id ?? null, rater: "first", done: !!ev?.firstSubmittedAt });
    if (stage === "second_review" && p.formType === "member") jobs.push({ reviewer: p.secondReviewerId, evId: ev?.id ?? null, rater: "second", done: !!ev?.secondSubmittedAt });
    if (stage === "second_review" && p.formType === "leader") jobs.push({ reviewer: p.firstReviewerId, evId: ev?.id ?? null, rater: "first", done: !!ev?.firstSubmittedAt });
  }
  const evIds = jobs.map((j) => j.evId).filter((x): x is string => !!x);
  const scored = new Set(
    evIds.length ? (await db.selectDistinct({ id: evaluationScores.evaluationId, rater: evaluationScores.rater }).from(evaluationScores).where(inArray(evaluationScores.evaluationId, evIds))).map((r) => `${r.id}:${r.rater}`) : [],
  );
  const byReviewer = new Map<string, { total: number; left: number; started: boolean }>();
  for (const j of jobs) {
    if (!j.reviewer) continue;
    const r = byReviewer.get(j.reviewer) ?? { total: 0, left: 0, started: false };
    r.total++;
    if (!j.done) r.left++;
    if (j.done || (j.evId && scored.has(`${j.evId}:${j.rater}`))) r.started = true;
    byReviewer.set(j.reviewer, r);
  }
  const pendingIds = [...byReviewer].filter(([, r]) => r.left > 0).map(([id]) => id);
  const reviewers = pendingIds.length ? await db.select().from(cyclePeople).where(inArray(cyclePeople.id, pendingIds)).orderBy(cyclePeople.department, cyclePeople.name) : [];
  const last = await lastReminders(cycleId, pendingIds);
  const label = stage === "first_review" ? "1차 평가" : "2차 평가";
  return {
    total: jobs.length,
    submitted: jobs.filter((j) => j.done).length,
    pending: reviewers.map((r) => {
      const st = byReviewer.get(r.id)!;
      return {
        personId: r.id,
        formHref: null,
        name: r.name,
        department: r.department,
        role: `${r.isExecutive ? "임원" : "팀장"} (${label} ${st.total}명 중 ${st.left}명 남음)`,
        status: st.started ? "writing" : "not_started",
        lastReminder: last.get(r.id) ?? null,
      };
    }),
  };
}

async function lastReminders(cycleId: string, personIds: string[]) {
  if (!personIds.length) return new Map<string, string>();
  const rows = await getDb()
    .select({ personId: emailOutbox.personId, at: max(emailOutbox.createdAt) })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.cycleId, cycleId), eq(emailOutbox.kind, "reminder"), inArray(emailOutbox.personId, personIds)))
    .groupBy(emailOutbox.personId);
  return new Map(rows.filter((r) => r.personId && r.at).map((r) => [r.personId!, r.at!.toISOString()]));
}

/** 지금 단계의 제출 현황 (개인작성·1차·2차) */
export async function stageProgress(actor: Actor, cycleId: string, status: string): Promise<StageProgress | null> {
  if (status === "self_review") return selfStageProgress(actor, cycleId);
  if (status === "first_review" || status === "second_review") return reviewStageProgress(actor, cycleId, status);
  return null;
}

const REMIND_TASK: Record<string, { task: string; end: "selfEnd" | "firstEnd" | "secondEnd" }> = {
  self_review: { task: "평가지 작성", end: "selfEnd" },
  first_review: { task: "1차 평가", end: "firstEnd" },
  second_review: { task: "2차 평가", end: "secondEnd" },
};

/** 고른 미제출자에게 독촉 이메일을 메일 목록에 쌓는다 */
export async function queueReminders(actor: Actor, cycleId: string, personIds: string[]): Promise<Result<{ batchId: string; count: number }>> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const [c] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1);
  const rt = c ? REMIND_TASK[c.status] : undefined;
  if (!c || !rt) return fail("stage", "지금 단계에서는 독촉할 수 없습니다.");
  const progress = (await stageProgress(actor, cycleId, c.status))!;
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
      payload: { name: p.name, year: String(c.year), task: rt.task, due: fmtDay(c[rt.end]) },
    })),
  );
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "cycle.remind", cycleId, detail: { count: people.length } });
  return ok({ batchId, count: people.length });
}
