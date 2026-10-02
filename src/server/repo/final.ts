// 최종평가 (PRD 10). 관리자만. 계산은 domain/grading, 여기서는 읽고 저장만 한다.
import { and, eq, inArray } from "drizzle-orm";
import { scoreCodes } from "@/domain/review";
import { replayAdjustments } from "@/server/repo/adjust";
import { fail, ok, type Result } from "@/lib/result";
import { bonusTotal, type BonusCode } from "@/domain/bonus";
import { computeScores, draftGrades, type Grade } from "@/domain/grading";
import { getDb, type Db } from "@/server/db/client";
import { appUsers, auditLogs, bonusPoints, cyclePeople, evaluations, evaluationScores, finalResults, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const n2 = (x: number | null) => (x === null ? null : x.toFixed(2));

/** 최종점수·순위·초안 등급을 다시 계산해 저장한다 (시스템 작업: 넘기기·가점·대신 입력에서 부른다) */
export async function recomputeFinal(db: Db | Tx, cycleId: string) {
  const people = await db
    .select({ id: cyclePeople.id, name: cyclePeople.name, hireDate: cyclePeople.hireDate, group: cyclePeople.gradeGroup, formType: cyclePeople.formType, evId: evaluations.id })
    .from(cyclePeople)
    .leftJoin(evaluations, eq(evaluations.personId, cyclePeople.id))
    .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)));
  if (people.length === 0) return;
  const evIds = people.map((p) => p.evId).filter((x): x is string => !!x);
  const scores = evIds.length ? await db.select().from(evaluationScores).where(and(inArray(evaluationScores.evaluationId, evIds), inArray(evaluationScores.rater, ["first", "second"]))) : [];
  const bonus = await db.select().from(bonusPoints).where(inArray(bonusPoints.personId, people.map((p) => p.id)));
  const sc = new Map<string, { first: Record<string, number>; second: Record<string, number> }>();
  for (const s of scores) {
    const e = sc.get(s.evaluationId) ?? { first: {}, second: {} };
    e[s.rater as "first" | "second"][s.itemCode] = s.score;
    sc.set(s.evaluationId, e);
  }
  const bn = new Map<string, Partial<Record<BonusCode, number>>>();
  for (const b of bonus) bn.set(b.personId, { ...(bn.get(b.personId) ?? {}), [b.item]: Number(b.points) });

  const computed = people.map((p) => {
    const s = (p.evId && sc.get(p.evId)) || { first: {}, second: {} };
    return { p, r: computeScores(p.formType!, s.first, s.second, bonusTotal(bn.get(p.id) ?? {})) };
  });
  const before = new Map((await db.select({ id: finalResults.personId, draft: finalResults.draftGrade }).from(finalResults).where(eq(finalResults.cycleId, cycleId))).map((r) => [r.id, r.draft]));
  const rows: (typeof finalResults.$inferInsert)[] = [];
  const groups = new Map<number, typeof computed>();
  for (const c of computed) groups.set(c.p.group ?? 0, [...(groups.get(c.p.group ?? 0) ?? []), c]);
  for (const list of groups.values()) {
    const draft = new Map(draftGrades(list.map(({ p, r }) => ({ id: p.id, name: p.name, hireDate: p.hireDate, final: r.blank ? null : r.final }))).map((d) => [d.id, d]));
    for (const { p, r } of list) {
      const d = draft.get(p.id)!;
      rows.push({
        personId: p.id,
        cycleId,
        blank: r.blank,
        competencyScore: r.blank ? null : n2(r.competency),
        achievementScore: r.blank ? null : n2(r.achievement),
        firstTotal: r.blank ? null : n2(r.firstTotal),
        secondTotal: r.blank ? null : n2(r.secondTotal),
        bonusTotal: n2(bonusTotal(bn.get(p.id) ?? {})),
        finalScore: r.blank ? null : n2(r.final),
        groupRank: d.rank,
        draftGrade: d.grade,
        finalGrade: d.grade,
        tieRule: d.tieRule,
        changeKind: "none",
        displayPercentile: d.percentile === null ? null : d.percentile.toFixed(1),
        recalcFrom: before.get(p.id) && d.grade && before.get(p.id) !== d.grade ? before.get(p.id)! : null,
        updatedAt: new Date(),
      });
    }
  }
  await db.delete(finalResults).where(eq(finalResults.cycleId, cycleId));
  await db.insert(finalResults).values(rows);
  // 이미 적용한 등급조정은 유지한다 (ADR-0016)
  await replayAdjustments(db, cycleId);
}

export type FinalRow = {
  id: string;
  name: string;
  department: string;
  position: string;
  hireDate: string;
  group: number;
  blank: boolean;
  missing: string | null;
  first: number | null;
  second: number | null;
  bonus: number | null;
  final: number | null;
  rank: number | null;
  draft: Grade | null;
  grade: Grade | null;
  tieRule: boolean;
  recalcFrom: Grade | null;
  changeKind: "none" | "adjusted" | "pushed";
};

export async function listFinal(actor: Actor, cycleId: string): Promise<FinalRow[]> {
  assert(can.manageCycle(actor));
  const rows = await getDb()
    .select({ p: cyclePeople, f: finalResults, ev: evaluations })
    .from(finalResults)
    .innerJoin(cyclePeople, eq(cyclePeople.id, finalResults.personId))
    .leftJoin(evaluations, eq(evaluations.personId, cyclePeople.id))
    .where(eq(finalResults.cycleId, cycleId));
  const num = (x: string | null) => (x === null ? null : Number(x));
  return rows
    .map(({ p, f }) => ({
      id: p.id,
      name: p.name,
      department: p.department,
      position: p.position,
      hireDate: p.hireDate,
      group: p.gradeGroup ?? 0,
      blank: f.blank,
      missing: null,
      first: num(f.firstTotal),
      second: num(f.secondTotal),
      bonus: num(f.bonusTotal),
      final: num(f.finalScore),
      rank: f.groupRank,
      draft: f.draftGrade,
      grade: f.finalGrade,
      tieRule: f.tieRule,
      recalcFrom: f.recalcFrom,
      changeKind: f.changeKind,
    }))
    .sort((a, b) => a.group - b.group || (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name, "ko"));
}

/** 2차평가 단계까지: 평가가 다 끝나지 않은 대상자 수 (초안 전 안내용) */
export async function remainingBeforeFinal(actor: Actor, cycleId: string) {
  assert(can.manageCycle(actor));
  const rows = await getDb()
    .select({ formType: cyclePeople.formType, first: evaluations.firstSubmittedAt, second: evaluations.secondSubmittedAt })
    .from(cyclePeople)
    .leftJoin(evaluations, eq(evaluations.personId, cyclePeople.id))
    .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)));
  return rows.filter((r) => !r.first || (r.formType === "member" && !r.second)).length;
}

// ── 빈 점수 대신 입력 (PRD 11, ADR-0016) ──

export async function getFillForm(actor: Actor, personId: string) {
  assert(can.manageCycle(actor));
  const db = getDb();
  const [row] = await db.select({ p: cyclePeople, ev: evaluations }).from(cyclePeople).leftJoin(evaluations, eq(evaluations.personId, cyclePeople.id)).where(eq(cyclePeople.id, personId)).limit(1);
  if (!row || !row.p.isTarget || !row.p.formType) return null;
  const scores = row.ev ? await db.select().from(evaluationScores).where(and(eq(evaluationScores.evaluationId, row.ev.id), inArray(evaluationScores.rater, ["first", "second"]))) : [];
  const emails = [...new Set(scores.map((s) => s.enteredBy).filter((x): x is string => !!x))];
  const admins = emails.length ? await db.select({ email: appUsers.email, name: appUsers.name }).from(appUsers).where(inArray(appUsers.email, emails)) : [];
  const nameOf = new Map(admins.map((a) => [a.email, a.name]));
  const cell = (rater: "first" | "second") =>
    Object.fromEntries(scores.filter((s) => s.rater === rater).map((s) => [s.itemCode, { score: s.score, proxy: s.enteredBy ? (nameOf.get(s.enteredBy) ?? s.enteredBy) : null }])) as Record<string, { score: number; proxy: string | null }>;
  return { person: { id: row.p.id, name: row.p.name, department: row.p.department, formType: row.p.formType, cycleId: row.p.cycleId }, first: cell("first"), second: cell("second") };
}

/** 빈 칸에만 넣는다. 이미 들어간 점수는 건드리지 않는다. 넣은 뒤 다시 계산 */
export async function fillBlankScores(actor: Actor, personId: string, input: { first: Record<string, number>; second: Record<string, number> }): Promise<Result<{ filled: number }>> {
  assert(can.manageCycle(actor));
  const f = await getFillForm(actor, personId);
  if (!f) return fail("not_found", "대상자를 찾을 수 없습니다.");
  const db = getDb();
  const [c] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, f.person.cycleId)).limit(1);
  if (!c || c.status !== "final_review") return fail("locked", "최종평가 단계에서 확정 전까지만 대신 입력할 수 있습니다.");
  const codes = new Set(scoreCodes(f.person.formType));
  const rows: { rater: "first" | "second"; itemCode: string; score: number }[] = [];
  for (const rater of ["first", "second"] as const) {
    if (rater === "second" && f.person.formType === "leader") continue;
    for (const [code, v] of Object.entries(input[rater] ?? {})) {
      if (!codes.has(code)) continue;
      if (f[rater][code]) return fail("filled", "이미 들어간 점수는 고칠 수 없습니다.");
      if (!Number.isInteger(v) || v < 1 || v > 10) return fail("range", "점수는 1~10 사이 숫자만 넣을 수 있습니다.");
      rows.push({ rater, itemCode: code, score: v });
    }
  }
  if (rows.length === 0) return fail("empty", "넣을 점수가 없습니다.");
  await db.transaction(async (tx) => {
    let [ev] = await tx.select().from(evaluations).where(eq(evaluations.personId, personId)).limit(1);
    if (!ev) [ev] = await tx.insert(evaluations).values({ personId, version: 1 }).returning();
    await tx.insert(evaluationScores).values(rows.map((r) => ({ evaluationId: ev!.id, ...r, enteredBy: actor.email })));
    await tx.update(evaluations).set({ version: ev!.version + 1, updatedAt: new Date() }).where(eq(evaluations.id, ev!.id));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "score.proxy", cycleId: c.id, personId, detail: { count: rows.length } });
    await recomputeFinal(tx, c.id);
  });
  return ok({ filled: rows.length });
}
