// 가점 (PRD 09). 관리자만, 평가등급 확정 전까지.
import { and, eq, inArray, sql } from "drizzle-orm";
import { BONUS_ITEMS, bonusTotal, checkValues, type BonusCode, type BonusRow, type BonusValues } from "@/domain/bonus";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { recomputeFinal } from "@/server/repo/final";
import { auditLogs, bonusPoints, cyclePeople, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

const LOCKED = ["confirmed", "results_sent", "closed"];
/** 확정 전까지. 한 번 확정했으면 확정을 취소해도 다시 열리지 않는다 */
export const bonusEditable = (c: { status: string; bonusClosedAt: Date | null }) => !LOCKED.includes(c.status) && !c.bonusClosedAt;


export async function listBonus(actor: Actor, cycleId: string): Promise<BonusRow[]> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const people = await db
    .select({ id: cyclePeople.id, name: cyclePeople.name, email: cyclePeople.email, department: cyclePeople.department, formType: cyclePeople.formType })
    .from(cyclePeople)
    .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)))
    .orderBy(cyclePeople.gradeGroup, cyclePeople.department, cyclePeople.name);
  const points = people.length ? await db.select().from(bonusPoints).where(inArray(bonusPoints.personId, people.map((p) => p.id))) : [];
  const by = new Map<string, Partial<BonusValues>>();
  for (const p of points) by.set(p.personId, { ...(by.get(p.personId) ?? {}), [p.item]: Number(p.points) });
  return people.map((p) => {
    const v = by.get(p.id);
    const values = v ? (Object.fromEntries(BONUS_ITEMS.map((i) => [i.code, v[i.code] ?? 0])) as BonusValues) : null;
    return { id: p.id, name: p.name, email: p.email, department: p.department, isLeader: p.formType === "leader", values, total: values ? bonusTotal(values) : null };
  });
}

async function cycleOf(cycleId: string) {
  const [c] = await getDb().select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1);
  return c ?? null;
}

/** 여러 사람의 가점을 한 번에 반영 (템플릿). 항목 7개를 모두 덮어쓴다 */
export async function applyBonus(actor: Actor, cycleId: string, rows: { personId: string; values: BonusValues }[]): Promise<Result<{ count: number }>> {
  assert(can.manageCycle(actor));
  const c = await cycleOf(cycleId);
  if (!c || !bonusEditable(c)) return fail("locked", "평가등급이 확정되어 가점을 더 이상 인정하지 않습니다.");
  const roster = await listBonus(actor, cycleId);
  const ref = new Map(roster.map((r) => [r.id, r]));
  for (const r of rows) {
    const p = ref.get(r.personId);
    if (!p) return fail("invalid", "명단에 없는 사람이 있습니다.");
    const err = checkValues(r.values, p.isLeader);
    if (err) return fail("invalid", `${p.name}: ${err}`);
  }
  if (rows.length === 0) return ok({ count: 0 });
  await getDb().transaction(async (tx) => {
    await tx.delete(bonusPoints).where(inArray(bonusPoints.personId, rows.map((r) => r.personId)));
    await tx.insert(bonusPoints).values(
      rows.flatMap((r) => BONUS_ITEMS.map((i) => ({ personId: r.personId, item: i.code, points: (r.values[i.code as BonusCode] ?? 0).toFixed(2), updatedBy: actor.email }))),
    );
    if (c.status === "final_review") await recomputeFinal(tx, cycleId);
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: rows.length === 1 ? "bonus.set" : "bonus.upload", cycleId, personId: rows.length === 1 ? rows[0]!.personId : null, detail: { count: rows.length } });
  });
  return ok({ count: rows.length });
}

export async function bonusCount(actor: Actor, cycleId: string) {
  assert(can.manageCycle(actor));
  const [r] = await getDb()
    .select({ n: sql<number>`count(distinct ${bonusPoints.personId})::int` })
    .from(bonusPoints)
    .innerJoin(cyclePeople, eq(cyclePeople.id, bonusPoints.personId))
    .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)));
  return r?.n ?? 0;
}
