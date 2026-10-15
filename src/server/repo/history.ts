// 지난 평가 기록 (2026-10-15 피드백). 결과 알림을 보낸 해(results_sent·closed)만.
// - 본인: 그 해 내 평가지(점수·업적 글)와 내 평가결과(등급·점수·가점·평가의견). 등급조정 여부는 주지 않는다.
// - 그 해 1차 평가자: 맡았던 사람의 평가지, 1차 점수·의견, 등급·최종점수·가점. 2차 점수·의견은 주지 않는다.
// - 그 해 2차 평가자: 위에 더해 2차 점수·의견.
// 사람은 해마다 명단이 새로 올라오므로 사번(없으면 이메일)으로 같은 사람을 찾는다.
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BONUS_ITEMS, type BonusCode } from "@/domain/bonus";
import { FORMS, type FormType, type Item } from "@/domain/forms";
import type { Grade } from "@/domain/grading";
import { raterTotal } from "@/domain/review";
import { getDb } from "@/server/db/client";
import { auditLogs, bonusPoints, cyclePeople, evaluations, evaluationScores, finalResults, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { dec, decNum } from "@/server/crypto/vault";
import { decFinal } from "@/server/repo/final-codec";

const PAST = ["results_sent", "closed"] as const;
export type HistoryRole = "self" | "first" | "second";

/** 지난 해 명단에서의 나 (해마다 한 줄) */
async function myPastRows(actor: Actor) {
  const who = actor.employeeNo ? or(eq(cyclePeople.employeeNo, actor.employeeNo), eq(cyclePeople.email, actor.email)) : eq(cyclePeople.email, actor.email);
  return getDb()
    .select({ id: cyclePeople.id, isTarget: cyclePeople.isTarget, cycleId: reviewCycles.id, year: reviewCycles.year, status: reviewCycles.status })
    .from(cyclePeople)
    .innerJoin(reviewCycles, eq(reviewCycles.id, cyclePeople.cycleId))
    .where(and(who, inArray(reviewCycles.status, [...PAST])))
    .orderBy(desc(reviewCycles.year));
}

export type HistoryYear = {
  year: number;
  mine: string | null;
  reviewed: { id: string; name: string; department: string; position: string; role: "first" | "second"; leader: boolean }[];
};

export async function listHistory(actor: Actor): Promise<HistoryYear[]> {
  const mine = await myPastRows(actor);
  if (!mine.length) return [];
  const ids = mine.map((m) => m.id);
  const people = await getDb()
    .select()
    .from(cyclePeople)
    .where(and(eq(cyclePeople.isTarget, true), or(inArray(cyclePeople.firstReviewerId, ids), inArray(cyclePeople.secondReviewerId, ids))))
    .orderBy(cyclePeople.department, cyclePeople.name);
  return mine.map((m) => ({
    year: m.year,
    mine: m.isTarget ? m.id : null,
    reviewed: people
      .filter((p) => p.cycleId === m.cycleId)
      .map((p) => ({ id: p.id, name: p.name, department: p.department, position: p.position, role: (p.secondReviewerId === m.id ? "second" : "first") as "first" | "second", leader: p.formType === "leader" })),
  }));
}

export type HistoryRecord = {
  role: HistoryRole;
  year: number;
  person: { id: string; name: string; department: string; position: string; formType: FormType };
  items: Item[];
  self: { scores: Record<string, number>; achievement: string; improvement: string; submitted: boolean };
  /** 평가자 항목별 점수: 본인에게는 주지 않는다(내 평가결과와 같게 합계만) */
  firstScores: Record<string, number> | null;
  secondScores: Record<string, number> | null;
  firstTotal: number | null;
  secondTotal: number | null;
  firstComment: string;
  secondComment: string | null;
  result: { grade: Grade | null; final: number | null; bonusTotal: number; bonus: { label: string; points: number }[]; percentile: number | null };
};

export async function getHistoryRecord(actor: Actor, personId: string): Promise<HistoryRecord> {
  const mine = await myPastRows(actor);
  const myIds = new Set(mine.map((m) => m.id));
  const db = getDb();
  const [row] = await db.select({ p: cyclePeople, c: reviewCycles }).from(cyclePeople).innerJoin(reviewCycles, eq(reviewCycles.id, cyclePeople.cycleId)).where(eq(cyclePeople.id, personId)).limit(1);
  if (!row || !row.p.isTarget || !row.p.formType || !(PAST as readonly string[]).includes(row.c.status)) notFound();
  const { p, c } = row;
  const role: HistoryRole | null = myIds.has(p.id) ? "self" : p.secondReviewerId && myIds.has(p.secondReviewerId) ? "second" : p.firstReviewerId && myIds.has(p.firstReviewerId) ? "first" : null;
  if (!role) notFound();
  const form = p.formType as FormType;
  const [ev] = await db.select().from(evaluations).where(eq(evaluations.personId, p.id)).limit(1);
  const raters: ("self" | "first" | "second")[] = role === "self" ? ["self"] : role === "first" ? ["self", "first"] : ["self", "first", "second"];
  const scores = ev ? await db.select().from(evaluationScores).where(and(eq(evaluationScores.evaluationId, ev.id), inArray(evaluationScores.rater, raters))) : [];
  const pick = (r: string) => Object.fromEntries(scores.filter((s) => s.rater === r).map((s) => [s.itemCode, decNum(s.score)!])) as Record<string, number>;
  const [fr] = await db.select().from(finalResults).where(eq(finalResults.personId, p.id)).limit(1);
  const f = fr ? decFinal(fr) : null;
  const bonusRows = await db.select().from(bonusPoints).where(eq(bonusPoints.personId, p.id));
  const by = new Map(bonusRows.map((b) => [b.item as BonusCode, decNum(b.points) ?? 0]));
  const seesSecond = role !== "first" && form === "member";
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "history.view", cycleId: c.id, personId: p.id, detail: { role } });
  const first = role === "self" ? null : pick("first");
  const second = role === "second" && form === "member" ? pick("second") : null;
  return {
    role,
    year: c.year,
    person: { id: p.id, name: p.name, department: p.department, position: p.position, formType: form },
    items: FORMS[form],
    self: { scores: pick("self"), achievement: dec(ev?.achievementText ?? ""), improvement: dec(ev?.improvementText ?? ""), submitted: !!ev?.selfSubmittedAt },
    firstScores: first,
    secondScores: second,
    firstTotal: f?.firstTotal ? Number(f.firstTotal) : first ? raterTotal(form, first) : null,
    secondTotal: seesSecond && f?.secondTotal ? Number(f.secondTotal) : null,
    firstComment: dec(ev?.firstComment ?? ""),
    secondComment: seesSecond ? dec(ev?.secondComment ?? "") : null,
    result: {
      grade: f?.finalGrade ?? null,
      final: f?.finalScore ? Number(f.finalScore) : null,
      bonusTotal: Number(f?.bonusTotal ?? 0),
      bonus: BONUS_ITEMS.filter((i) => !("leaderOnly" in i) || form === "leader").map((i) => ({ label: i.label, points: by.get(i.code) ?? 0 })),
      percentile: role === "self" && f?.displayPercentile ? Number(f.displayPercentile) : null,
    },
  };
}
