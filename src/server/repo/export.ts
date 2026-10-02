// 엑셀 내려받기용 데이터 (PRD 15, ADR-0008). 서버는 권한 검사 후 데이터만 주고, 엑셀은 브라우저가 만든다. 내려받으면 작업 기록에 남긴다.
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { BONUS_ITEMS } from "@/domain/bonus";
import { FORMS } from "@/domain/forms";
import { GROUP_LABEL } from "@/domain/grading";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { auditLogs, bonusPoints, cyclePeople, evaluations, evaluationScores, finalResults, gradeAdjustments, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

export type Sheet = { name: string; headers: string[]; rows: (string | number | null)[][] };
const CONFIRMED = ["confirmed", "results_sent", "closed"];
const num = (x: string | null) => (x === null ? null : Number(x));
const ts = (d: Date | null) => (d ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(d) : null);
const ITEM_LABEL: Record<string, string> = { ...Object.fromEntries([...FORMS.member, ...FORMS.leader].map((i) => [i.code, i.name])), achievement: "업적" };

async function people(cycleId: string) {
  return getDb().select().from(cyclePeople).where(eq(cyclePeople.cycleId, cycleId)).orderBy(cyclePeople.gradeGroup, cyclePeople.department, cyclePeople.name);
}

/** 최종결과 엑셀 (연봉조정용). 확정 뒤에만 */
export async function exportFinal(actor: Actor, cycleId: string): Promise<Result<{ year: number; sheet: Sheet }>> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const [c] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1);
  if (!c || !CONFIRMED.includes(c.status)) return fail("not_confirmed", "평가등급을 확정한 뒤에 내려받을 수 있습니다.");
  const rows = await db.select({ p: cyclePeople, f: finalResults }).from(finalResults).innerJoin(cyclePeople, eq(cyclePeople.id, finalResults.personId)).where(eq(finalResults.cycleId, cycleId));
  rows.sort((a, b) => (a.p.gradeGroup ?? 0) - (b.p.gradeGroup ?? 0) || (a.f.groupRank ?? 1e9) - (b.f.groupRank ?? 1e9));
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "export.final", cycleId, detail: { rows: rows.length } });
  return ok({
    year: c.year,
    sheet: {
      name: "최종결과",
      headers: ["그룹", "순위", "이름", "이메일", "부서", "직급", "입사일", "1차 점수", "2차 점수", "가점", "최종점수", "평가등급", "상위 %"],
      rows: rows.map(({ p, f }) => [
        GROUP_LABEL[p.gradeGroup ?? 0] ?? "",
        f.groupRank,
        p.name,
        p.email,
        p.department,
        p.position,
        p.hireDate,
        num(f.firstTotal),
        num(f.secondTotal),
        num(f.bonusTotal),
        num(f.finalScore),
        f.finalGrade,
        num(f.displayPercentile),
      ]),
    },
  });
}

/** 전체 기록 백업 (ADR-0011): 명단·평가지·점수·가점·최종평가·등급조정 이력 */
export async function exportBackup(actor: Actor, cycleId: string): Promise<Result<{ year: number; sheets: Sheet[] }>> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const [c] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1);
  if (!c) return fail("not_found", "평가를 찾을 수 없습니다.");
  const ps = await people(cycleId);
  const name = new Map(ps.map((p) => [p.id, p.name]));
  const ids = ps.map((p) => p.id);
  const evs = ids.length ? await db.select().from(evaluations).where(inArray(evaluations.personId, ids)) : [];
  const evOwner = new Map(evs.map((e) => [e.id, e.personId]));
  const scores = evs.length ? await db.select().from(evaluationScores).where(inArray(evaluationScores.evaluationId, evs.map((e) => e.id))) : [];
  const bonus = ids.length ? await db.select().from(bonusPoints).where(inArray(bonusPoints.personId, ids)) : [];
  const fin = await db.select().from(finalResults).where(eq(finalResults.cycleId, cycleId));
  const adj = await db.select().from(gradeAdjustments).where(eq(gradeAdjustments.cycleId, cycleId)).orderBy(gradeAdjustments.createdAt, gradeAdjustments.kind);
  const RATER: Record<string, string> = { self: "본인평가", first: "1차", second: "2차" };
  const bonusLabel = Object.fromEntries(BONUS_ITEMS.map((i) => [i.code, i.label]));
  const sheets: Sheet[] = [
    {
      name: "정기평가",
      headers: ["연도", "단계", "개인작성", "1차평가", "2차평가", "가점 인정 기준일", "확정 시각", "확정자"],
      rows: [[c.year, c.status, `${c.selfStart} ~ ${c.selfEnd}`, `${c.firstStart} ~ ${c.firstEnd}`, `${c.secondStart} ~ ${c.secondEnd}`, c.bonusCutoff, ts(c.confirmedAt), c.confirmedBy]],
    },
    {
      name: "명단",
      headers: ["이름", "이메일", "부서", "직급", "입사일", "팀장", "임원", "평가 대상", "제외 사유", "그룹", "평가지", "1차 평가자", "2차 평가자"],
      rows: ps.map((p) => [
        p.name, p.email, p.department, p.position, p.hireDate, p.isTeamLeader ? "예" : "아니오", p.isExecutive ? "예" : "아니오", p.isTarget ? "예" : "아니오", p.excludedReason,
        p.gradeGroup, p.formType === "leader" ? "팀장용" : p.formType === "member" ? "팀원용" : null,
        p.firstReviewerId ? (name.get(p.firstReviewerId) ?? null) : null, p.secondReviewerId ? (name.get(p.secondReviewerId) ?? null) : null,
      ]),
    },
    {
      name: "평가지",
      headers: ["이름", `${c.year}년 개인역할 및 업적`, `${c.year + 1}년 개선 및 발전`, "본인 제출", "1차 제출", "2차 제출"],
      rows: evs.map((e) => [name.get(e.personId) ?? "", e.achievementText, e.improvementText, ts(e.selfSubmittedAt), ts(e.firstSubmittedAt), ts(e.secondSubmittedAt)]),
    },
    {
      name: "점수",
      headers: ["이름", "평가", "항목", "점수", "관리자 대신 입력"],
      rows: scores.map((s) => [name.get(evOwner.get(s.evaluationId) ?? "") ?? "", RATER[s.rater] ?? s.rater, ITEM_LABEL[s.itemCode] ?? s.itemCode, s.score, s.enteredBy]),
    },
    { name: "가점", headers: ["이름", "항목", "점수", "넣은 사람"], rows: bonus.map((x) => [name.get(x.personId) ?? "", bonusLabel[x.item] ?? x.item, Number(x.points), x.updatedBy]) },
    {
      name: "최종평가",
      headers: ["이름", "그룹", "순위", "역량 점수", "업적 점수", "1차 점수", "2차 점수", "가점", "최종점수", "초안 등급", "평가등급", "표시", "상위 %", "점수 빈칸"],
      rows: fin.map((f) => [
        name.get(f.personId) ?? "", ps.find((p) => p.id === f.personId)?.gradeGroup ?? null, f.groupRank, num(f.competencyScore), num(f.achievementScore), num(f.firstTotal), num(f.secondTotal),
        num(f.bonusTotal), num(f.finalScore), f.draftGrade, f.finalGrade, f.changeKind === "adjusted" ? "조정" : f.changeKind === "pushed" ? "밀려남" : "", num(f.displayPercentile), f.blank ? "예" : "",
      ]),
    },
    {
      name: "등급조정 이력",
      headers: ["언제", "누가", "대상", "무엇을", "종류", "되돌린 시각"],
      rows: adj.map((a) => [ts(a.createdAt), a.createdBy, name.get(a.personId) ?? "", `${a.fromGrade} → ${a.toGrade}`, a.kind === "manual" ? "조정" : "밀려남", ts(a.revertedAt)]),
    },
  ];
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "export.backup", cycleId, detail: { sheets: sheets.length } });
  return ok({ year: c.year, sheets });
}

/** 마지막 백업 뒤에 단계를 넘겼거나 확정했으면 안내한다 */
export async function backupDue(actor: Actor, cycleId: string): Promise<boolean> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const [last] = await db.select({ at: max(auditLogs.createdAt) }).from(auditLogs).where(and(eq(auditLogs.cycleId, cycleId), eq(auditLogs.action, "export.backup")));
  const [ev] = await db
    .select({ at: auditLogs.createdAt })
    .from(auditLogs)
    .where(and(eq(auditLogs.cycleId, cycleId), inArray(auditLogs.action, ["cycle.advance", "cycle.confirm"])))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  return !!ev && (!last?.at || ev.at > last.at);
}
