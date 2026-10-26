// 관리자 대신 입력 (2026-10-15 피드백): 평가자가 출장·외근·개인 사정으로 못 넣은 점수를 받아서 넣는다.
// 1차는 1차평가 단계, 2차·팀장 평가는 2차평가 단계에. 넣은 칸에는 넣은 관리자가 남고 작업 기록에도 남는다.
// (최종평가 단계의 빈칸 대신 입력은 final.ts의 fillBlankScores — 빈칸에만)
import { and, eq } from "drizzle-orm";
import { scoreCodes, isScore, missingScores } from "@/domain/review";
import type { FormType } from "@/domain/forms";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { auditLogs, cyclePeople, evaluations, evaluationScores, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";
import { dec, enc, encNum } from "@/server/crypto/vault";
import { COMMENT_MAX } from "@/server/repo/reviews";
import { selfMark } from "@/server/repo/self-record";

export type ProxyRater = "first" | "second";

/** 그 평가자 칸을 지금 대신 입력할 수 있는 단계 */
export const proxyWindow = (form: FormType, rater: ProxyRater) => (form === "leader" || rater === "second" ? "second_review" : "first_review");

export async function proxyScores(actor: Actor, personId: string, rater: ProxyRater, raw: Record<string, number>, submit: boolean, comment?: string): Promise<Result<{ count: number }> | { ok: false; code: "incomplete"; message: string; missing: string[] }> {
  assert(can.manageCycle(actor));
  if (comment !== undefined && comment.length > COMMENT_MAX) return fail("long", `평가의견은 ${COMMENT_MAX.toLocaleString()}자까지 쓸 수 있습니다.`);
  const db = getDb();
  const [row] = await db.select({ p: cyclePeople, c: reviewCycles }).from(cyclePeople).innerJoin(reviewCycles, eq(reviewCycles.id, cyclePeople.cycleId)).where(eq(cyclePeople.id, personId)).limit(1);
  if (!row || !row.p.isTarget || !row.p.formType) return fail("not_found", "대상자를 찾을 수 없습니다.");
  const form = row.p.formType as FormType;
  if (form === "leader" && rater === "second") return fail("invalid", "팀장은 2차 평가가 없습니다.");
  if (row.c.status !== proxyWindow(form, rater)) return fail("locked", `${proxyWindow(form, rater) === "first_review" ? "1차평가" : "2차평가"} 단계에서만 대신 입력할 수 있습니다.`);
  const codes = new Set(scoreCodes(form));
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!codes.has(k)) continue;
    if (!isScore(v)) return fail("range", "점수는 1~10 사이, 소수 첫째 자리까지 넣을 수 있습니다.");
    scores[k] = v;
  }
  if (submit) {
    const missing = missingScores(form, scores);
    if (missing.length) return { ok: false, code: "incomplete", message: `빈 점수 칸이 ${missing.length}개 있습니다.`, missing };
  }
  return db.transaction(async (tx) => {
    const now = new Date();
    let [ev] = await tx.select().from(evaluations).where(eq(evaluations.personId, personId)).limit(1).for("update");
    if (!ev) [ev] = await tx.insert(evaluations).values({ personId, version: 0 }).returning();
    await tx.delete(evaluationScores).where(and(eq(evaluationScores.evaluationId, ev!.id), eq(evaluationScores.rater, rater)));
    const entries = Object.entries(scores);
    if (entries.length) await tx.insert(evaluationScores).values(entries.map(([itemCode, v]) => ({ evaluationId: ev!.id, rater, itemCode, score: encNum(v)!, enteredBy: actor.email })));
    const stamp = {
      ...(submit ? (rater === "first" ? { firstSubmittedAt: now } : { secondSubmittedAt: now }) : {}),
      ...(comment === undefined ? {} : rater === "first" ? { firstComment: comment.trim() ? enc(comment) : null } : { secondComment: comment.trim() ? enc(comment) : null }),
    };
    await tx.update(evaluations).set({ version: ev!.version + 1, updatedAt: now, ...stamp }).where(eq(evaluations.id, ev!.id));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: submit ? "score.proxy_submit" : "score.proxy_save", cycleId: row.c.id, personId, detail: { rater, count: entries.length, ...(await selfMark(tx, actor, [personId])) } });
    return ok({ count: entries.length });
  });
}

/** 대신 입력 화면에 미리 채울 평가의견 (2026-10-15) */
export async function proxyComments(actor: Actor, personId: string) {
  assert(can.manageCycle(actor));
  const [ev] = await getDb().select({ a: evaluations.firstComment, b: evaluations.secondComment }).from(evaluations).where(eq(evaluations.personId, personId)).limit(1);
  return { first: dec(ev?.a ?? ""), second: dec(ev?.b ?? "") };
}
