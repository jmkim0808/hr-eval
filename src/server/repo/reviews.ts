// 평가하기 (PRD 07·08). 평가자는 맡은 사람의 평가지만, 자기 칸의 점수만 쓴다.
import { and, eq, inArray, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FORMS, type FormType } from "@/domain/forms";
import { ACHIEVEMENT, canScore, canSeeForm, checkAverage, isScore, missingScores, raterTotal, REVIEW, reviewKindOf, scoreCodes, seesFirstScores, type ReviewKind } from "@/domain/review";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { auditLogs, cyclePeople, evaluations, evaluationScores, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { dec, decNum, enc, encNum } from "@/server/crypto/vault";
import { bonusOf, type BonusView } from "@/server/repo/bonus";

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
  const pick = (r: string) => Object.fromEntries(scores.filter((s) => s.rater === r).map((s) => [s.item, decNum(s.score)!])) as Record<string, number>;
  const submittedAt = rater === "first" ? ev?.firstSubmittedAt : ev?.secondSubmittedAt;
  return {
    kind,
    person: { id: p.id, name: p.name, department: p.department, position: p.position, formType: p.formType as FormType },
    cycle: { year: cycle.year, status: cycle.status, firstStart: cycle.firstStart, firstEnd: cycle.firstEnd, secondStart: cycle.secondStart, secondEnd: cycle.secondEnd },
    visible,
    editable: visible && canScore(kind, cycle.status),
    self: visible ? { scores: pick("self"), achievement: dec(ev?.achievementText ?? ""), improvement: dec(ev?.improvementText ?? ""), submitted: !!ev?.selfSubmittedAt } : null,
    firstScores: seesFirstScores(kind) && visible ? pick("first") : null,
    firstSubmitted: seesFirstScores(kind) ? !!ev?.firstSubmittedAt : false,
    mine: pick(rater),
    /** 내 평가의견, 그리고 2차 평가자에게만 1차 의견 (팀장에게 2차 의견을 주는 경로는 없다) */
    myComment: ev ? dec((rater === "first" ? ev.firstComment : ev.secondComment) ?? "") : "",
    firstComment: seesFirstScores(kind) && visible && ev ? dec(ev.firstComment ?? "") : null,
    submittedAt: submittedAt?.toISOString() ?? null,
    version: ev?.version ?? 0,
    bundle: await bundleTotals(actor, kind),
    bonus: (await bonusOf([p.id])).get(p.id) ?? null,
  };
}

export type BundlePerson = { id: string; name: string; total: number | null; ach: number | null; submitted: boolean };

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
    e.s[r.item] = decNum(r.score)!;
    by.set(r.personId, e);
  }
  return group.people.map((p) => {
    const e = by.get(p.id);
    return { id: p.id, name: p.name, total: e ? raterTotal(e.form, e.s) : null, ach: e?.s[ACHIEVEMENT] ?? null, submitted: p.status === "done" };
  });
}

export type ReviewSaveResult =
  | Result<{ version: number; savedAt: string }>
  | { ok: false; code: "incomplete"; message: string; missing: string[] }
  | { ok: false; code: "average"; message: string; avg: number };

export const COMMENT_MAX = 1000;

export async function saveReview(actor: Actor, kind: ReviewKind, personId: string, version: number, raw: Record<string, number>, submit: boolean, comment?: string): Promise<ReviewSaveResult> {
  if (comment !== undefined && comment.length > COMMENT_MAX) return fail("long", `평가의견은 ${COMMENT_MAX.toLocaleString()}자까지 쓸 수 있습니다.`);
  const r = await getReview(actor, kind, personId);
  if (!r.editable) return fail("locked", `${REVIEW[kind].windowLabel} 기간에 입력할 수 있습니다.`);
  const codes = new Set(scoreCodes(r.person.formType));
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!codes.has(k)) continue;
    if (!isScore(v)) return fail("range", "점수는 1~10 사이, 소수 첫째 자리까지 넣을 수 있습니다.");
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
    const stamp = {
      ...(submit ? (rater === "first" ? { firstSubmittedAt: now } : { secondSubmittedAt: now }) : {}),
      ...(comment === undefined ? {} : rater === "first" ? { firstComment: comment.trim() ? enc(comment) : null } : { secondComment: comment.trim() ? enc(comment) : null }),
    };
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
    if (entries.length) await tx.insert(evaluationScores).values(entries.map(([itemCode, score]) => ({ evaluationId: evId, rater, itemCode, score: encNum(score)! })));
    if (submit) await tx.insert(auditLogs).values({ actorEmail: actor.email, action: `review.${kind}.submit`, personId, detail: {} });
    return ok({ version: version + 1, savedAt: now.toISOString() });
  });
}

export const itemsOf = (form: FormType) => FORMS[form];

// ── 내 평가 현황 (2026-10-15 피드백): 내가 맡은 사람 전체의 1차·2차 역량·업적 점수 ──

export type OverviewScores = { competency: number | null; achievement: number | null; total: number | null };
export type OverviewRow = {
  id: string;
  name: string;
  department: string;
  position: string;
  selfSubmitted: boolean;
  status: ReviewStatus;
  /** 1차(팀장 평가 묶음에서는 임원) 점수 */
  first: OverviewScores;
  /** 2차 점수 — 2차 평가자(임원)에게만. 팀장(1차 평가자)에게는 언제나 null */
  second: OverviewScores | null;
  /** 가점 (아직 안 넣었으면 null) */
  bonus: BonusView | null;
};

const scoresOf = (form: FormType, s: Record<string, number>): OverviewScores => {
  const codes = FORMS[form].map((i) => i.code);
  const has = codes.filter((c) => s[c] !== undefined);
  return {
    competency: has.length === codes.length ? Math.round(codes.reduce((a, c) => a + s[c]! * 10, 0)) / 10 : null,
    achievement: s[ACHIEVEMENT] ?? null,
    total: raterTotal(form, s),
  };
};

/** 내 평가 현황. 팀장(1차)은 자기 점수만, 임원(2차)은 1차·2차를 본다. 2차 점수를 팀장에게 주는 경로는 없다 */
export async function reviewOverview(actor: Actor, kind: ReviewKind) {
  const group = (await listReviewGroups(actor)).find((g) => g.kind === kind);
  if (!group) notFound();
  const ids = group.people.map((p) => p.id);
  const db = getDb();
  const evs = ids.length ? await db.select({ id: evaluations.id, personId: evaluations.personId, self: evaluations.selfSubmittedAt }).from(evaluations).where(inArray(evaluations.personId, ids)) : [];
  const raters: ("first" | "second")[] = kind === "second" ? ["first", "second"] : ["first"];
  const scores = evs.length
    ? await db.select({ ev: evaluationScores.evaluationId, rater: evaluationScores.rater, item: evaluationScores.itemCode, score: evaluationScores.score }).from(evaluationScores).where(and(inArray(evaluationScores.evaluationId, evs.map((e) => e.id)), inArray(evaluationScores.rater, raters)))
    : [];
  const forms = new Map((await db.select({ id: cyclePeople.id, form: cyclePeople.formType }).from(cyclePeople).where(inArray(cyclePeople.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]))).map((r) => [r.id, r.form as FormType]));
  const evOf = new Map(evs.map((e) => [e.personId, e]));
  const by = new Map<string, { first: Record<string, number>; second: Record<string, number> }>();
  for (const s of scores) {
    const e = by.get(s.ev) ?? { first: {}, second: {} };
    e[s.rater as "first" | "second"][s.item] = decNum(s.score)!;
    by.set(s.ev, e);
  }
  const bonus = await bonusOf(ids);
  const rows: OverviewRow[] = group.people.map((p) => {
    const ev = evOf.get(p.id);
    const sc = (ev && by.get(ev.id)) || { first: {}, second: {} };
    const form = forms.get(p.id)!;
    return {
      id: p.id,
      name: p.name,
      department: p.department,
      position: p.position,
      selfSubmitted: !!ev?.self,
      status: p.status,
      first: scoresOf(form, sc.first),
      second: kind === "second" ? scoresOf(form, sc.second) : null,
      bonus: bonus.get(p.id) ?? null,
    };
  });
  return { group, rows };
}
