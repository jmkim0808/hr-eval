// 대표이사 등급 결과 (PRD 13). 이름·부서·직급·최종점수·등급·조정 표시만 읽는다 (docs/tech/02 2-3).
import { desc, eq } from "drizzle-orm";
import type { Grade } from "@/domain/grading";
import { getDb } from "@/server/db/client";
import { cyclePeople, finalResults, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

const OPEN = ["final_review", "confirmed", "results_sent", "closed"];

export type ReportRow = { id: string; group: number; rank: number | null; name: string; department: string; position: string; final: number | null; grade: Grade | null; draft: Grade | null; change: "none" | "adjusted" | "pushed" };

export async function getReport(actor: Actor) {
  assert(can.viewReport(actor));
  const db = getDb();
  const [cycle] = await db.select({ id: reviewCycles.id, year: reviewCycles.year, status: reviewCycles.status }).from(reviewCycles).orderBy(desc(reviewCycles.year)).limit(1);
  if (!cycle || !OPEN.includes(cycle.status)) return { cycle: cycle ?? null, rows: null };
  const rows = await db
    .select({
      id: cyclePeople.id,
      group: cyclePeople.gradeGroup,
      rank: finalResults.groupRank,
      name: cyclePeople.name,
      department: cyclePeople.department,
      position: cyclePeople.position,
      final: finalResults.finalScore,
      grade: finalResults.finalGrade,
      draft: finalResults.draftGrade,
      change: finalResults.changeKind,
    })
    .from(finalResults)
    .innerJoin(cyclePeople, eq(cyclePeople.id, finalResults.personId))
    .where(eq(finalResults.cycleId, cycle.id));
  return {
    cycle,
    rows: rows
      .map((r) => ({ ...r, group: r.group ?? 0, final: r.final === null ? null : Number(r.final) }))
      .sort((a, b) => a.group - b.group || (a.rank ?? 1e9) - (b.rank ?? 1e9)) as ReportRow[],
  };
}
