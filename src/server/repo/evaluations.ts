// 평가지 (PRD 04). 본인 평가지는 주인만 읽고 쓴다.
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { checkSelfSubmit, cleanScores, FORM_VERSION, type SelfDraft, type SubmitIssues } from "@/domain/forms";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { auditLogs, cyclePeople, evaluations, evaluationScores, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { can } from "@/server/authz/policy";
import { dec, decNum, enc, encNum } from "@/server/crypto/vault";

export type SelfStatus = "not_started" | "writing" | "submitted";

/** 내 평가지를 읽는다. 남의 것이면 없는 주소처럼 보인다. */
export async function getSelfForm(actor: Actor, personId: string) {
  if (!can.writeSelfForm(actor, personId)) notFound();
  return loadForm(personId);
}

/** 관리자가 보기 전용으로 연다 (진행 현황의 미제출자 이름 → 평가지). 고치는 함수는 없다. */
export async function getFormForAdmin(actor: Actor, personId: string) {
  if (!can.manageCycle(actor)) notFound();
  const f = await loadForm(personId);
  return { ...f, editable: false };
}

async function loadForm(personId: string) {
  const db = getDb();
  const [row] = await db
    .select({ person: cyclePeople, cycle: reviewCycles })
    .from(cyclePeople)
    .innerJoin(reviewCycles, eq(reviewCycles.id, cyclePeople.cycleId))
    .where(eq(cyclePeople.id, personId))
    .limit(1);
  if (!row || !row.person.isTarget || !row.person.formType) notFound();
  const [ev] = await db.select().from(evaluations).where(eq(evaluations.personId, personId)).limit(1);
  const scores: Record<string, number> = {};
  if (ev) {
    const rows = await db
      .select({ item: evaluationScores.itemCode, score: evaluationScores.score })
      .from(evaluationScores)
      .where(and(eq(evaluationScores.evaluationId, ev.id), eq(evaluationScores.rater, "self")));
    for (const r of rows) scores[r.item] = decNum(r.score)!;
  }
  const { person, cycle } = row;
  const status: SelfStatus = ev?.selfSubmittedAt ? "submitted" : ev && (ev.achievementText || ev.improvementText || Object.keys(scores).length) ? "writing" : "not_started";
  return {
    person: { id: person.id, name: person.name, department: person.department, formType: person.formType! },
    cycle: { year: cycle.year, status: cycle.status, selfStart: cycle.selfStart, selfEnd: cycle.selfEnd },
    editable: cycle.status === "self_review",
    status,
    submittedAt: ev?.selfSubmittedAt ?? null,
    updatedAt: ev?.updatedAt ?? null,
    version: ev?.version ?? 0,
    draft: { scores, achievement: dec(ev?.achievementText ?? ""), improvement: dec(ev?.improvementText ?? "") } satisfies SelfDraft,
    proxyBy: ev?.selfProxyBy ?? null,
  };
}

export type SaveResult = Result<{ version: number; savedAt: string }> | { ok: false; code: "incomplete"; message: string; issues: SubmitIssues };

/** 임시저장(submit=false) 또는 제출. 판본 번호가 다르면 다른 창에서 고친 것이다 (ADR-0012). */
export async function saveSelf(actor: Actor, personId: string, version: number, draft: SelfDraft, submit: boolean): Promise<SaveResult> {
  const form = await getSelfForm(actor, personId);
  if (!form.editable) return fail("locked", "개인작성 기간이 끝나 고칠 수 없습니다.");
  const clean: SelfDraft = {
    scores: cleanScores(form.person.formType, draft.scores),
    achievement: draft.achievement,
    improvement: draft.improvement,
  };
  if (submit) {
    const issues = checkSelfSubmit(form.person.formType, clean, form.cycle.year);
    if (issues) return { ok: false, code: "incomplete", message: "빠진 칸이 있습니다. 빨간 테두리 칸을 채워 주세요.", issues };
  }
  return writeSelf(actor, personId, version, clean, submit, null);
}

/** 관리자 대신 입력 (2026-10-15): 출장 등으로 직접 못 쓴 평가지를 받아서 넣는다. 2차평가가 끝나기 전까지 */
export const SELF_PROXY_STAGES = ["self_review", "first_review", "second_review"];
export async function saveSelfByAdmin(actor: Actor, personId: string, version: number, draft: SelfDraft, submit: boolean): Promise<SaveResult> {
  const form = await getFormForAdmin(actor, personId);
  if (!SELF_PROXY_STAGES.includes(form.cycle.status)) return fail("locked", "2차평가가 끝난 뒤에는 평가지를 대신 입력할 수 없습니다.");
  const clean: SelfDraft = { scores: cleanScores(form.person.formType, draft.scores), achievement: draft.achievement, improvement: draft.improvement };
  if (submit) {
    const issues = checkSelfSubmit(form.person.formType, clean, form.cycle.year);
    if (issues) return { ok: false, code: "incomplete", message: "빠진 칸이 있습니다. 빨간 테두리 칸을 채워 주세요.", issues };
  }
  return writeSelf(actor, personId, version, clean, submit, actor.email);
}

async function writeSelf(actor: Actor, personId: string, version: number, clean: SelfDraft, submit: boolean, proxyBy: string | null): Promise<SaveResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const now = new Date();
    let evId: string;
    const [ev] = await tx.select().from(evaluations).where(eq(evaluations.personId, personId)).limit(1).for("update");
    if (!ev) {
      if (version !== 0) return fail("conflict", "다른 창에서 고친 내용이 있습니다.");
      const [ins] = await tx
        .insert(evaluations)
        .values({ personId, formVersion: FORM_VERSION, achievementText: enc(clean.achievement), improvementText: enc(clean.improvement), version: 1, selfSubmittedAt: submit ? now : null, selfProxyBy: proxyBy })
        .returning({ id: evaluations.id });
      evId = ins!.id;
    } else {
      if (ev.version !== version) return fail("conflict", "다른 창에서 고친 내용이 있습니다.");
      evId = ev.id;
      await tx
        .update(evaluations)
        .set({
          achievementText: enc(clean.achievement),
          improvementText: enc(clean.improvement),
          version: ev.version + 1,
          updatedAt: now,
          ...(submit ? { selfSubmittedAt: now } : {}),
          ...(proxyBy ? { selfProxyBy: proxyBy } : {}),
        })
        .where(eq(evaluations.id, ev.id));
    }
    await tx.delete(evaluationScores).where(and(eq(evaluationScores.evaluationId, evId), eq(evaluationScores.rater, "self")));
    const entries = Object.entries(clean.scores);
    if (entries.length) await tx.insert(evaluationScores).values(entries.map(([itemCode, score]) => ({ evaluationId: evId, rater: "self" as const, itemCode, score: encNum(score)! })));
    if (submit || proxyBy) await tx.insert(auditLogs).values({ actorEmail: actor.email, action: proxyBy ? (submit ? "self.proxy_submit" : "self.proxy_save") : "self.submit", personId, detail: {} });
    return ok({ version: version + 1, savedAt: now.toISOString() });
  });
}

/** 내 할 일 (S01). 지금은 내 평가지 한 줄 — 평가자 할 일은 07·08번에서 더한다. */
export async function getMyTasks(actor: Actor & { personId: string }) {
  const db = getDb();
  const [row] = await db
    .select({ person: cyclePeople, cycle: reviewCycles })
    .from(cyclePeople)
    .innerJoin(reviewCycles, eq(reviewCycles.id, cyclePeople.cycleId))
    .where(eq(cyclePeople.id, actor.personId))
    .limit(1);
  if (!row) notFound();
  const { person, cycle } = row;
  let self: { personId: string; status: SelfStatus; editable: boolean; submittedAt: string | null } | null = null;
  if (person.isTarget && person.formType) {
    const f = await getSelfForm(actor, person.id);
    self = { personId: person.id, status: f.status, editable: f.editable, submittedAt: f.submittedAt?.toISOString() ?? null };
  }
  const { year, status, selfStart, selfEnd, firstStart, firstEnd, secondStart, secondEnd } = cycle;
  return { cycle: { year, status, selfStart, selfEnd, firstStart, firstEnd, secondStart, secondEnd }, self };
}
