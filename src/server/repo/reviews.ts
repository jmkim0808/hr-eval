// 평가하기 (PRD 07·08). 평가자는 맡은 사람의 평가지만, 자기 칸의 점수만 쓴다.
import { and, eq, inArray, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FORMS, type FormType } from "@/domain/forms";
import { canScore, canSeeForm, checkAverage, missingScores, raterTotal, REVIEW, reviewKindOf, scoreCodes, seesFirstScores, type ReviewKind } from "@/domain/review";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { auditLogs, cyclePeople, evaluations, evaluationScores, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";

export type ReviewStatus = "todo" | "writing" | "done";
export type GroupPerson = { id: string; name: string; department: string; position: string; status: ReviewStatus; visible: boolean };
export type ReviewGroup = { kind: ReviewKind; people: GroupPerson[]; open: boolean; range: [string | null, string | null] };

async function myCycle(personId: string) {
  const [r] = await getDb()
    .select({ cycle: reviewCycles })
    .from(cyclePeople)
    .innerJoin(reviewCycles, eq(reviewCycles.id, cyclePeople.cycleId))
    .where(eq(cyclePeople.id, personId))
    .limit(1);
  return r?.cycle ?? null;
}

/** 내가 맡은 평가 묶음 (내 할 일·평가하기 왼쪽 목록) */
export async function listReviewGroups(actor: Actor): Promise<ReviewGroup[]> {
  const me = actor.personId;
  if (!me) return [];
  const cycle = await myCycle(me);
  if (!cycle || cycle.status === "setup") return [];
  const db = getDb();
  const rows = await db
    .select({ p: cyclePeople, ev: evaluations })
    .from(cyclePeople)
    .leftJoin(evaluations, eq(evaluations.personId, cyclePeople.id))
    .where(and(eq(cyclePeople.cycleId, cycle.id), eq(cyclePeople.isTarget, true), or(eq(cyclePeople.firstReviewerId, me), eq(cyclePeople.secondReviewerId, me))))
    .orderBy(cyclePeople.department, cyclePeople.name);
  const evIds = rows.map((r) => r.ev?.id).filter((x): x is string => !!x);
  const scored = evIds.length
    ? await db.selectDistinct({ id: evaluationScores.evaluationId, rater: evaluationScores.rater }).from(evaluationScores).where(inArray(evaluationScores.evaluationId, evIds))
    : [];
  const has = new Set(scored.map((s) => `${s.id}:${s.rater}`));
  const groups = new Map<ReviewKind, GroupPerson[]>();
  for (const { p, ev } of rows) {
    const kind = reviewKindOf(me, p);
    if (!kind) continue;
    const rater = REVIEW[kind].rater;
    const submitted = rater === "first" ? ev?.firstSubmittedAt : ev?.secondSubmittedAt;
    const status: ReviewStatus = submitted ? "done" : ev && has.has(`${ev.id}:${rater}`) ? "writing" : "todo";
    const list = groups.get(kind) ?? [];
    list.push({ id: p.id, name: p.name, department: p.department, position: p.position, status, visible: canSeeForm(cycle.status, !!ev?.selfSubmittedAt) });
    groups.set(kind, list);
  }
  return (["first", "second", "leader"] as const)
    .filter((k) => groups.has(k))
    .map((kind) => ({
      kind,
      people: groups.get(kind)!,
      open: canScore(kind, cycle.status),
      range: REVIEW[kind].window === "first_review" ? [cycle.firstStart, cycle.firstEnd] : [cycle.secondStart, cycle.secondEnd],
    }));
}

/** 평가하기 한 사람. 맡은 사람이 아니면 없는 주소처럼 보인다. 1차 평가자에게는 2차 점수를 아예 읽지 않는다. */
export async function getReview(actor: Actor, kind: ReviewKind, personId: string) {
  const me = actor.personId;
  const db = getDb();
  const [row] = await db
    .select({ p: cyclePeople, cycle: reviewCycles })
    .from(cyclePeople)
    .innerJoin(reviewCycles, eq(reviewCycles.id, cyclePeople.cycleId))
    .where(eq(cyclePeople.id, personId))
    .limit(1);
  if (!row || reviewKindOf(me, row.p) !== kind) notFound();
  const { p, cycle } = row;
  const [ev] = await db.select().from(evaluations).where(eq(evaluations.personId, personId)).limit(1);
  const visible = canSeeForm(cycle.status, !!ev?.selfSubmittedAt);
  const rater = REVIEW[kind].rater;
  const raters: ("self" | "first" | "second")[] = ["self", rater];
  if (seesFirstScores(kind)) raters.push("first");
  const scores = ev
    ? await db
        .select({ rater: evaluationScores.rater, item: evaluationScores.itemCode, score: evaluationScores.score })
        .from(evaluationScores)
        .where(and(eq(evaluationScores.evaluationId, ev.id), inArray(evaluationScores.rater, raters)))
    : [];
  const pick = (r: string) => Object.fromEntries(scores.filter((s) => s.rater === r).map((s) => [s.item, s.score])) as Record<string, number>;
  const submittedAt = rater === "first" ? ev?.firstSubmittedAt : ev?.secondSubmittedAt;
  return {
    kind,
    person: { id: p.id, name: p.name, department: p.department, position: p.position, formType: p.formType as FormType },
    cycle: { year: cycle.year, status: cycle.status, firstStart: cycle.firstStart, firstEnd: cycle.firstEnd, secondStart: cycle.secondStart, secondEnd: cycle.secondEnd },
    visible,
    editable: visible && canScore(kind, cycle.status),
    self: visible ? { scores: pick("self"), achievement: ev?.achievementText ?? "", improvement: ev?.improvementText ?? "", submitted: !!ev?.selfSubmittedAt } : null,
    firstScores: seesFirstScores(kind) && visible ? pick("first") : null,
    firstSubmitted: seesFirstScores(kind) ? !!ev?.firstSubmittedAt : false,
    mine: pick(rater),
    submittedAt: submittedAt?.toISOString() ?? null,
    version: ev?.version ?? 0,
    bundle: await bundleTotals(actor, kind),
  };
}

export type BundlePerson = { id: string; name: string; total: number | null; submitted: boolean };

/** 같은 묶음 사람들의 내 점수(평가자 점수)와 제출 여부 — 평균 80점 확인용 */
export async function bundleTotals(actor: Actor, kind: ReviewKind): Promise<BundlePerson[]> {
  const group = (await listReviewGroups(actor)).find((g) => g.kind === kind);
  if (!group) return [];
  const db = getDb();
  const rater = REVIEW[kind].rater;
  const rows = await db
    .select({ personId: evaluations.personId, formType: cyclePeople.formType, item: evaluationScores.itemCode, score: evaluationScores.score })
    .from(evaluations)
    .innerJoin(cyclePeople, eq(cyclePeople.id, evaluations.personId))
    .innerJoin(evaluationScores, and(eq(evaluationScores.evaluationId, evaluations.id), eq(evaluationScores.rater, rater)))
    .where(inArray(evaluations.personId, group.people.map((p) => p.id)));
  const by = new Map<string, { form: FormType; s: Record<string, number> }>();
  for (const r of rows) {
    const e = by.get(r.personId) ?? { form: r.formType as FormType, s: {} };
    e.s[r.item] = r.score;
    by.set(r.personId, e);
  }
  return group.people.map((p) => {
    const e = by.get(p.id);
    return { id: p.id, name: p.name, total: e ? raterTotal(e.form, e.s) : null, submitted: p.status === "done" };
  });
}

export type ReviewSaveResult =
  | Result<{ version: number; savedAt: string }>
  | { ok: false; code: "incomplete"; message: string; missing: string[] }
  | { ok: false; code: "average"; message: string; avg: number };

export async function saveReview(actor: Actor, kind: ReviewKind, personId: string, version: number, raw: Record<string, number>, submit: boolean): Promise<ReviewSaveResult> {
  const r = await getReview(actor, kind, personId);
  if (!r.editable) return fail("locked", `${REVIEW[kind].windowLabel} 기간에 입력할 수 있습니다.`);
  const codes = new Set(scoreCodes(r.person.formType));
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!codes.has(k)) continue;
    if (!Number.isInteger(v) || v < 1 || v > 10) return fail("range", "점수는 1~10 사이 숫자만 넣을 수 있습니다.");
    scores[k] = v;
  }
  if (submit) {
    const missing = missingScores(r.person.formType, scores);
    if (missing.length) return { ok: false, code: "incomplete", message: `빈 점수 칸이 ${missing.length}개 있습니다.`, missing };
    // 묶음의 마지막 사람을 제출할 때(또는 모두 제출한 뒤 다시 제출할 때) 평균 80 ± 0.5
    const bundle = await bundleTotals(actor, kind);
    const others = bundle.filter((b) => b.id !== personId);
    if (others.every((b) => b.submitted)) {
      const totals = [...others.map((b) => b.total).filter((t): t is number => t !== null), raterTotal(r.person.formType, scores)!];
      const avg = checkAverage(bundle.length, totals);
      if (!avg.ok) return { ok: false, code: "average", message: avg.advice!, avg: avg.avg! };
    }
  }
  const rater = REVIEW[kind].rater;
  return getDb().transaction(async (tx) => {
    const now = new Date();
    const [ev] = await tx.select().from(evaluations).where(eq(evaluations.personId, personId)).limit(1).for("update");
    let evId: string;
    const stamp = submit ? (rater === "first" ? { firstSubmittedAt: now } : { secondSubmittedAt: now }) : {};
    if (!ev) {
      if (version !== 0) return fail("conflict", "다른 창에서 고친 내용이 있습니다.");
      const [ins] = await tx.insert(evaluations).values({ personId, version: 1, ...stamp }).returning({ id: evaluations.id });
      evId = ins!.id;
    } else {
      if (ev.version !== version) return fail("conflict", "다른 창에서 고친 내용이 있습니다.");
      evId = ev.id;
      await tx.update(evaluations).set({ version: ev.version + 1, updatedAt: now, ...stamp }).where(eq(evaluations.id, ev.id));
    }
    await tx.delete(evaluationScores).where(and(eq(evaluationScores.evaluationId, evId), eq(evaluationScores.rater, rater)));
    const entries = Object.entries(scores);
    if (entries.length) await tx.insert(evaluationScores).values(entries.map(([itemCode, score]) => ({ evaluationId: evId, rater, itemCode, score })));
    if (submit) await tx.insert(auditLogs).values({ actorEmail: actor.email, action: `review.${kind}.submit`, personId, detail: {} });
    return ok({ version: version + 1, savedAt: now.toISOString() });
  });
}

export const itemsOf = (form: FormType) => FORMS[form];
