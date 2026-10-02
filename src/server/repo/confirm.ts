// 확정과 확정 취소 (PRD 14). 관리자만.
import { and, eq, ne, sql } from "drizzle-orm";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { appUsers, auditLogs, bonusPoints, cyclePeople, emailOutbox, finalResults, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

export async function confirmReadiness(actor: Actor, cycleId: string) {
  assert(can.manageCycle(actor));
  const db = getDb();
  const [b] = await db.select({ n: sql<number>`count(*)::int` }).from(finalResults).where(and(eq(finalResults.cycleId, cycleId), eq(finalResults.blank, true)));
  const [nb] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cyclePeople)
    .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true), sql`not exists (select 1 from ${bonusPoints} where ${bonusPoints.personId} = ${cyclePeople.id})`));
  return { blanks: b?.n ?? 0, noBonus: nb?.n ?? 0 };
}

export async function confirmGrades(actor: Actor, cycleId: string, version: number): Promise<Result> {
  assert(can.manageCycle(actor));
  const ready = await confirmReadiness(actor, cycleId);
  if (ready.blanks > 0) return fail("blanks", `점수 빈칸이 ${ready.blanks}명 남아 있어 확정할 수 없습니다. 먼저 대신 입력해 주세요.`);
  return getDb().transaction(async (tx) => {
    const [c] = await tx.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1).for("update");
    if (!c || c.status !== "final_review" || c.version !== version) return fail("stale", "다른 관리자가 먼저 처리했습니다. 화면을 새로고침해 주세요.");
    const now = new Date();
    await tx
      .update(reviewCycles)
      .set({ status: "confirmed", confirmedAt: now, confirmedBy: actor.name, bonusClosedAt: c.bonusClosedAt ?? now, version: c.version + 1, updatedAt: now })
      .where(eq(reviewCycles.id, cycleId));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "cycle.confirm", cycleId, detail: {} });
    return ok();
  });
}

/** 결과 알림 전까지만. 사유를 남기고 다른 관리자에게 알린다. 가점은 다시 열리지 않는다 */
export async function cancelConfirm(actor: Actor, cycleId: string, version: number, reason: string): Promise<Result<{ notified: number; batchId: string | null }>> {
  assert(can.manageCycle(actor));
  const why = reason.trim();
  if (why.length < 2) return fail("reason", "취소 사유를 적어 주세요.");
  return getDb().transaction(async (tx) => {
    const [c] = await tx.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1).for("update");
    if (!c) return fail("not_found", "평가를 찾을 수 없습니다.");
    if (c.status !== "confirmed") return fail("stage", c.status === "results_sent" || c.status === "closed" ? "결과 알림을 보낸 뒤에는 확정을 취소할 수 없습니다." : "확정된 상태가 아닙니다.");
    if (c.version !== version) return fail("stale", "다른 관리자가 먼저 처리했습니다. 화면을 새로고침해 주세요.");
    await tx.update(reviewCycles).set({ status: "final_review", confirmedAt: null, confirmedBy: null, version: c.version + 1, updatedAt: new Date() }).where(eq(reviewCycles.id, cycleId));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "cycle.unconfirm", cycleId, detail: { reason: why } });
    const others = await tx.select({ email: appUsers.email }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true), ne(appUsers.email, actor.email)));
    if (others.length === 0) return ok({ notified: 0, batchId: null });
    const batchId = crypto.randomUUID();
    await tx.insert(emailOutbox).values(
      others.map((o) => ({ cycleId, kind: "admin_alert" as const, toEmail: o.email, batchId, createdBy: actor.email, payload: { title: "평가등급 확정이 취소되었습니다", year: String(c.year), actor: actor.name, reason: why.slice(0, 300) } })),
    );
    return ok({ notified: others.length, batchId });
  });
}
