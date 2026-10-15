// 관리자 전체 현황 (2026-10-15 피드백): 사람마다 1차·2차 역량·업적, 가점, 최종점수를 지금 들어간 점수로 바로 계산해 보인다.
// 가점을 넣으면 그 즉시 반영된다 (최종평가 단계 전에도). 관리자만 — 평가자·직원에게는 가점이 보이지 않는다.
import { and, eq, inArray } from "drizzle-orm";
import { bonusTotal, type BonusCode } from "@/domain/bonus";
import { FORMS, type FormType } from "@/domain/forms";
import { computeScores, GROUP_LABEL } from "@/domain/grading";
import { ACHIEVEMENT, raterTotal } from "@/domain/review";
import { getDb } from "@/server/db/client";
import { bonusPoints, cyclePeople, evaluations, evaluationScores } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";
import { decNum } from "@/server/crypto/vault";

export type RaterView = { competency: number | null; achievement: number | null; total: number | null };
export type OverviewPerson = {
  id: string;
  name: string;
  department: string;
  position: string;
  group: number;
  groupLabel: string;
  isLeader: boolean;
  selfSubmitted: boolean;
  first: RaterView;
  second: RaterView | null;
  bonus: number | null;
  /** 점수가 다 들어갔으면 최종점수(가점 포함), 아니면 null */
  final: number | null;
};

const view = (form: FormType, s: Record<string, number>): RaterView => {
  const codes = FORMS[form].map((i) => i.code);
  return {
    competency: codes.every((c) => s[c] !== undefined) ? Math.round(codes.reduce((a, c) => a + s[c]! * 10, 0)) / 10 : null,
    achievement: s[ACHIEVEMENT] ?? null,
    total: raterTotal(form, s),
  };
};

export async function adminOverview(actor: Actor, cycleId: string): Promise<OverviewPerson[]> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const people = await db.select().from(cyclePeople).where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true))).orderBy(cyclePeople.department, cyclePeople.name);
  if (!people.length) return [];
  const ids = people.map((p) => p.id);
  const evs = await db.select({ id: evaluations.id, personId: evaluations.personId, self: evaluations.selfSubmittedAt }).from(evaluations).where(inArray(evaluations.personId, ids));
  const scores = evs.length ? await db.select().from(evaluationScores).where(and(inArray(evaluationScores.evaluationId, evs.map((e) => e.id)), inArray(evaluationScores.rater, ["first", "second"]))) : [];
  const bonus = await db.select().from(bonusPoints).where(inArray(bonusPoints.personId, ids));
  const sc = new Map<string, { first: Record<string, number>; second: Record<string, number> }>();
  for (const s of scores) {
    const e = sc.get(s.evaluationId) ?? { first: {}, second: {} };
    e[s.rater as "first" | "second"][s.itemCode] = decNum(s.score)!;
    sc.set(s.evaluationId, e);
  }
  const bn = new Map<string, Partial<Record<BonusCode, number>>>();
  for (const b of bonus) bn.set(b.personId, { ...(bn.get(b.personId) ?? {}), [b.item]: decNum(b.points) ?? 0 });
  const evOf = new Map(evs.map((e) => [e.personId, e]));
  return people.map((p) => {
    const form = p.formType as FormType;
    const ev = evOf.get(p.id);
    const s = (ev && sc.get(ev.id)) || { first: {}, second: {} };
    const b = bn.get(p.id);
    const bonusSum = b ? bonusTotal(b) : null;
    const r = computeScores(form, s.first, s.second, bonusSum ?? 0);
    return {
      id: p.id,
      name: p.name,
      department: p.department,
      position: p.position,
      group: p.gradeGroup ?? 0,
      groupLabel: GROUP_LABEL[p.gradeGroup ?? 0] ?? "",
      isLeader: form === "leader",
      selfSubmitted: !!ev?.self,
      first: view(form, s.first),
      second: form === "member" ? view(form, s.second) : null,
      bonus: bonusSum,
      final: r.blank ? null : r.final,
    };
  });
}
