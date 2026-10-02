// 등급조정 (PRD 12). 관리자만, 최종평가 단계에서. 최종점수는 건드리지 않고 등급만 바꾼다.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { displayPercentile, planAdjust, type Grade, type Move, type Placed } from "@/domain/grading";
import { fail, ok, type Result } from "@/lib/result";
import { getDb, type Db } from "@/server/db/client";
import { auditLogs, cyclePeople, finalResults, gradeAdjustments, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type State = Map<string, { id: string; group: number; rank: number; draft: Grade; grade: Grade; manual: boolean; percentile: number }>;

async function loadState(db: Db | Tx, cycleId: string): Promise<State> {
  const rows = await db
    .select({ id: finalResults.personId, group: cyclePeople.gradeGroup, rank: finalResults.groupRank, draft: finalResults.draftGrade, grade: finalResults.finalGrade, kind: finalResults.changeKind, pct: finalResults.displayPercentile })
    .from(finalResults)
    .innerJoin(cyclePeople, eq(cyclePeople.id, finalResults.personId))
    .where(and(eq(finalResults.cycleId, cycleId), eq(finalResults.blank, false)));
  return new Map(
    rows
      .filter((r) => r.draft && r.rank)
      .map((r) => [r.id, { id: r.id, group: r.group ?? 0, rank: r.rank!, draft: r.draft!, grade: r.grade ?? r.draft!, manual: r.kind === "adjusted", percentile: 0 }]),
  );
}

const placedOf = (s: State, group: number): Placed[] => [...s.values()].filter((p) => p.group === group).map((p) => ({ id: p.id, rank: p.rank, grade: p.grade, manual: p.manual, percentile: p.percentile }));

/**
 * 초안 등급에서 시작해 되돌리지 않은 조정을 차례로 다시 적용하고 final_results에 저장한다.
 * 다시 계산(대신 입력·가점) 뒤에도 조정이 유지된다. 더는 적용할 수 없는 조정은 되돌린 것으로 표시한다.
 */
export async function replayAdjustments(db: Db | Tx, cycleId: string) {
  const s = await loadState(db, cycleId);
  for (const p of s.values()) {
    p.grade = p.draft;
    p.manual = false;
  }
  // 상위 % = 그룹 내 순위 ÷ 그룹 인원 (빈칸인 사람도 인원에 넣는다)
  const groupSize = new Map<number, number>();
  for (const r of await db.select({ g: cyclePeople.gradeGroup }).from(finalResults).innerJoin(cyclePeople, eq(cyclePeople.id, finalResults.personId)).where(eq(finalResults.cycleId, cycleId)))
    groupSize.set(r.g ?? 0, (groupSize.get(r.g ?? 0) ?? 0) + 1);
  for (const p of s.values()) p.percentile = Math.round((p.rank / (groupSize.get(p.group) ?? 1)) * 1000) / 10;

  const manuals = await db.select().from(gradeAdjustments).where(and(eq(gradeAdjustments.cycleId, cycleId), eq(gradeAdjustments.kind, "manual"), isNull(gradeAdjustments.revertedAt))).orderBy(asc(gradeAdjustments.createdAt));
  for (const m of manuals) {
    const p = s.get(m.personId);
    const plan = p ? planAdjust(placedOf(s, p.group), m.personId, m.toGrade) : { ok: false as const, message: "" };
    await db.delete(gradeAdjustments).where(and(eq(gradeAdjustments.batchId, m.batchId), eq(gradeAdjustments.kind, "push")));
    if (!plan.ok) {
      await db.update(gradeAdjustments).set({ revertedAt: new Date() }).where(eq(gradeAdjustments.batchId, m.batchId));
      continue;
    }
    applyMoves(s, plan.moves);
    const pushes = plan.moves.filter((x) => x.kind === "push");
    if (pushes.length)
      await db.insert(gradeAdjustments).values(pushes.map((x) => ({ cycleId, personId: x.id, fromGrade: x.from, toGrade: x.to, kind: "push" as const, batchId: m.batchId, createdBy: m.createdBy, createdAt: m.createdAt })));
  }
  for (const p of s.values()) {
    const list = [...s.values()].filter((x) => x.group === p.group).map((x) => ({ ...x }));
    const shown = displayPercentile(list, p);
    await db
      .update(finalResults)
      .set({ finalGrade: p.grade, changeKind: p.manual ? "adjusted" : p.grade !== p.draft ? "pushed" : "none", displayPercentile: shown.toFixed(1), updatedAt: new Date() })
      .where(eq(finalResults.personId, p.id));
  }
}

function applyMoves(s: State, moves: Move[]) {
  for (const m of moves) {
    const p = s.get(m.id)!;
    p.grade = m.to;
    if (m.kind === "manual") p.manual = true;
  }
}

export type PreviewMove = Move & { name: string; final: number };

async function ctx(db: Db | Tx, personId: string) {
  const [r] = await db.select({ cycleId: finalResults.cycleId, status: reviewCycles.status, version: reviewCycles.version }).from(finalResults).innerJoin(reviewCycles, eq(reviewCycles.id, finalResults.cycleId)).where(eq(finalResults.personId, personId)).limit(1);
  return r ?? null;
}

async function named(db: Db | Tx, moves: Move[]): Promise<PreviewMove[]> {
  const rows = await db.select({ id: cyclePeople.id, name: cyclePeople.name, final: finalResults.finalScore }).from(cyclePeople).innerJoin(finalResults, eq(finalResults.personId, cyclePeople.id)).where(inArray(cyclePeople.id, moves.map((m) => m.id)));
  const by = new Map(rows.map((r) => [r.id, r]));
  return moves.map((m) => ({ ...m, name: by.get(m.id)?.name ?? "", final: Number(by.get(m.id)?.final ?? 0) }));
}

/** "이렇게 바뀝니다" 미리보기. 저장하지 않는다 */
export async function previewAdjust(actor: Actor, personId: string, to: Grade): Promise<Result<PreviewMove[]>> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const c = await ctx(db, personId);
  if (!c || c.status !== "final_review") return fail("locked", "최종평가 단계에서만 등급을 조정할 수 있습니다.");
  const s = await loadState(db, c.cycleId);
  const p = s.get(personId);
  if (!p) return fail("blank", "점수 빈칸인 사람은 조정할 수 없습니다.");
  const plan = planAdjust(placedOf(s, p.group), personId, to);
  if (!plan.ok) return fail("plan", plan.message);
  return ok(await named(db, plan.moves));
}

export async function applyAdjust(actor: Actor, personId: string, to: Grade, version: number): Promise<Result<PreviewMove[]>> {
  assert(can.manageCycle(actor));
  return getDb().transaction(async (tx) => {
    const c = await ctx(tx, personId);
    if (!c || c.status !== "final_review") return fail("locked", "최종평가 단계에서만 등급을 조정할 수 있습니다.");
    const [cy] = await tx.select().from(reviewCycles).where(eq(reviewCycles.id, c.cycleId)).limit(1).for("update");
    if (!cy || cy.version !== version) return fail("stale", "다른 관리자가 먼저 처리했습니다. 화면을 새로고침해 주세요.");
    const s = await loadState(tx, c.cycleId);
    const p = s.get(personId);
    if (!p) return fail("blank", "점수 빈칸인 사람은 조정할 수 없습니다.");
    const plan = planAdjust(placedOf(s, p.group), personId, to);
    if (!plan.ok) return fail("plan", plan.message);
    const batchId = crypto.randomUUID();
    const m = plan.moves[0]!;
    await tx.insert(gradeAdjustments).values({ cycleId: c.cycleId, personId, fromGrade: m.from, toGrade: m.to, kind: "manual", batchId, createdBy: actor.email });
    await replayAdjustments(tx, c.cycleId);
    await tx.update(reviewCycles).set({ version: cy.version + 1, updatedAt: new Date() }).where(eq(reviewCycles.id, cy.id));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "grade.adjust", cycleId: c.cycleId, personId, detail: { from: m.from, to: m.to, moved: plan.moves.length - 1 } });
    return ok(await named(tx, plan.moves));
  });
}

/** 그 사람이 들어간 조정(직접 조정 또는 밀려남)을 통째로 되돌린다 */
export async function revertAdjust(actor: Actor, personId: string, version: number): Promise<Result> {
  assert(can.manageCycle(actor));
  return getDb().transaction(async (tx) => {
    const c = await ctx(tx, personId);
    if (!c || c.status !== "final_review") return fail("locked", "최종평가 단계에서만 되돌릴 수 있습니다.");
    const [cy] = await tx.select().from(reviewCycles).where(eq(reviewCycles.id, c.cycleId)).limit(1).for("update");
    if (!cy || cy.version !== version) return fail("stale", "다른 관리자가 먼저 처리했습니다. 화면을 새로고침해 주세요.");
    const [last] = await tx
      .select()
      .from(gradeAdjustments)
      .where(and(eq(gradeAdjustments.personId, personId), isNull(gradeAdjustments.revertedAt)))
      .orderBy(asc(gradeAdjustments.createdAt))
      .limit(1);
    if (!last) return fail("none", "되돌릴 조정이 없습니다.");
    await tx.update(gradeAdjustments).set({ revertedAt: new Date() }).where(eq(gradeAdjustments.batchId, last.batchId));
    await replayAdjustments(tx, c.cycleId);
    await tx.update(reviewCycles).set({ version: cy.version + 1, updatedAt: new Date() }).where(eq(reviewCycles.id, cy.id));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "grade.revert", cycleId: c.cycleId, personId, detail: {} });
    return ok();
  });
}
