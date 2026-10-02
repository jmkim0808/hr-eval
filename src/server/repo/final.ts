// 최종평가 (PRD 10). 관리자만. 계산은 domain/grading, 여기서는 읽고 저장만 한다.
import { and, eq, inArray } from "drizzle-orm";
import { bonusTotal, type BonusCode } from "@/domain/bonus";
import { computeScores, draftGrades, type Grade } from "@/domain/grading";
import { getDb, type Db } from "@/server/db/client";
import { bonusPoints, cyclePeople, evaluations, evaluationScores, finalResults } from "@/server/db/schema";
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
        updatedAt: new Date(),
      });
    }
  }
  await db.delete(finalResults).where(eq(finalResults.cycleId, cycleId));
  await db.insert(finalResults).values(rows);
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
