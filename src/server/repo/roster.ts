// 직원 명단 (PRD 02). 관리자만.
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { fail, ok, type Result } from "@/lib/result";
import type { RosterPerson } from "@/domain/roster";
import { getDb } from "@/server/db/client";
import { auditLogs, cyclePeople, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

/** 명단을 바꿀 수 있는 단계 (안내 이메일 발송 전) */
const ROSTER_EDITABLE = ["setup"] as const;
/** 평가자를 고칠 수 있는 단계 (1차평가 시작 전) */
const REVIEWER_EDITABLE = ["setup", "self_review"] as const;

export async function getOrNullCycle(actor: Actor, year: number) {
  assert(can.manageCycle(actor));
  const [c] = await getDb().select().from(reviewCycles).where(eq(reviewCycles.year, year)).limit(1);
  return c ?? null;
}

export async function replaceRoster(actor: Actor, year: number, people: RosterPerson[]): Promise<Result<{ cycleId: string }>> {
  assert(can.manageCycle(actor));
  const db = getDb();
  return db.transaction(async (tx) => {
    let [cycle] = await tx.select().from(reviewCycles).where(eq(reviewCycles.year, year)).limit(1).for("update");
    if (!cycle) [cycle] = await tx.insert(reviewCycles).values({ year }).returning();
    if (!cycle) throw new Error("cycle insert failed");
    if (!(ROSTER_EDITABLE as readonly string[]).includes(cycle.status)) {
      return fail("locked", "안내 이메일을 보낸 뒤에는 명단을 다시 올릴 수 없습니다.");
    }
    await tx.delete(cyclePeople).where(eq(cyclePeople.cycleId, cycle.id));
    const inserted = await tx
      .insert(cyclePeople)
      .values(
        people.map((p) => ({
          cycleId: cycle!.id,
          email: p.email,
          name: p.name,
          department: p.department,
          position: p.position,
          hireDate: p.hireDate,
          isTeamLeader: p.isTeamLeader,
          isExecutive: p.isExecutive,
          isTarget: p.isTarget,
          excludedReason: p.excludedReason,
          gradeGroup: p.gradeGroup,
          formType: p.formType,
          rowNo: p.rowNo,
        })),
      )
      .returning({ id: cyclePeople.id, email: cyclePeople.email });
    const idOf = new Map(inserted.map((r) => [r.email, r.id]));
    for (const p of people) {
      if (!p.isTarget) continue;
      await tx
        .update(cyclePeople)
        .set({ firstReviewerId: p.firstReviewerEmail ? idOf.get(p.firstReviewerEmail) : null, secondReviewerId: p.secondReviewerEmail ? idOf.get(p.secondReviewerEmail) : null })
        .where(eq(cyclePeople.id, idOf.get(p.email)!));
    }
    await tx.update(reviewCycles).set({ version: cycle.version + 1, updatedAt: new Date() }).where(eq(reviewCycles.id, cycle.id));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "roster.replace", cycleId: cycle.id, detail: { count: people.length } });
    return ok({ cycleId: cycle.id });
  });
}

export type TargetRow = {
  id: string;
  name: string;
  department: string;
  position: string;
  hireDate: string;
  gradeGroup: number | null;
  formType: "member" | "leader" | null;
  firstReviewerId: string | null;
  secondReviewerId: string | null;
  firstReviewerName: string | null;
  secondReviewerName: string | null;
};

export async function listTargets(actor: Actor, cycleId: string): Promise<TargetRow[]> {
  assert(can.manageCycle(actor));
  const r1 = alias(cyclePeople, "r1");
  const r2 = alias(cyclePeople, "r2");
  return getDb()
    .select({
      id: cyclePeople.id,
      name: cyclePeople.name,
      department: cyclePeople.department,
      position: cyclePeople.position,
      hireDate: cyclePeople.hireDate,
      gradeGroup: cyclePeople.gradeGroup,
      formType: cyclePeople.formType,
      firstReviewerId: cyclePeople.firstReviewerId,
      secondReviewerId: cyclePeople.secondReviewerId,
      firstReviewerName: r1.name,
      secondReviewerName: r2.name,
    })
    .from(cyclePeople)
    .leftJoin(r1, eq(r1.id, cyclePeople.firstReviewerId))
    .leftJoin(r2, eq(r2.id, cyclePeople.secondReviewerId))
    .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)))
    .orderBy(asc(cyclePeople.gradeGroup), asc(cyclePeople.department), asc(cyclePeople.name));
}

/** 평가자로 고를 수 있는 사람: 팀장과 임원 */
export async function listReviewerCandidates(actor: Actor, cycleId: string) {
  assert(can.manageCycle(actor));
  const rows = await getDb()
    .select({ id: cyclePeople.id, name: cyclePeople.name, department: cyclePeople.department, isTeamLeader: cyclePeople.isTeamLeader, isExecutive: cyclePeople.isExecutive })
    .from(cyclePeople)
    .where(eq(cyclePeople.cycleId, cycleId))
    .orderBy(desc(cyclePeople.isExecutive), asc(cyclePeople.department), asc(cyclePeople.name));
  return rows.filter((r) => r.isTeamLeader || r.isExecutive);
}

export async function updateReviewer(actor: Actor, personId: string, slot: "first" | "second", reviewerId: string | null): Promise<Result> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const [p] = await db.select().from(cyclePeople).where(eq(cyclePeople.id, personId)).limit(1);
  if (!p || !p.isTarget) return fail("not_found", "대상자를 찾을 수 없습니다.");
  const [c] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, p.cycleId)).limit(1);
  if (!c || !(REVIEWER_EDITABLE as readonly string[]).includes(c.status)) return fail("locked", "1차평가가 시작된 뒤에는 평가자를 바꿀 수 없습니다.");
  if (p.formType === "leader" && slot === "second") return fail("invalid", "팀장 평가지는 2차 평가자가 없습니다.");
  if (reviewerId) {
    const [r] = await db.select().from(cyclePeople).where(and(eq(cyclePeople.id, reviewerId), eq(cyclePeople.cycleId, p.cycleId))).limit(1);
    if (!r) return fail("invalid", "평가자를 찾을 수 없습니다.");
    if (r.id === p.id) return fail("invalid", "자기 자신을 평가자로 정할 수 없습니다.");
    const needsExec = slot === "second" || p.formType === "leader";
    if (needsExec && !r.isExecutive) return fail("invalid", "이 칸에는 임원만 정할 수 있습니다.");
    if (!needsExec && !(r.isTeamLeader || r.isExecutive)) return fail("invalid", "팀장 또는 임원만 정할 수 있습니다.");
  }
  await db
    .update(cyclePeople)
    .set(slot === "first" ? { firstReviewerId: reviewerId, updatedAt: new Date() } : { secondReviewerId: reviewerId, updatedAt: new Date() })
    .where(eq(cyclePeople.id, personId));
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "roster.reviewer", cycleId: p.cycleId, personId, detail: { slot } });
  return ok();
}
