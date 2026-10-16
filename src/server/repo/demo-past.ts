// 시험 모드 전용: "지난 평가 기록"을 시험해 볼 수 있게, 올해 명단을 그대로 써서 작년 정기평가(마감)를 만든다.
// 점수·업적 글·의견·가점은 모두 가짜이고 암호화해 저장한다(실제와 같은 길). 운영에서는 부르지 않는다(isDemo 확인은 화면 쪽).
import { desc, eq } from "drizzle-orm";
import { FORMS, type FormType } from "@/domain/forms";
import { scoreCodes } from "@/domain/review";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { bonusPoints, cyclePeople, evaluations, evaluationScores, reviewCycles } from "@/server/db/schema";
import { enc, encNum, isOpen } from "@/server/crypto/vault";
import { recomputeFinal } from "@/server/repo/final";

const ACH = [
  "신규 거래처 3곳 확보, 연간 수주 12억 달성. 주요 고객사 품질 이슈 2건을 2주 안에 해결.",
  "어댑터 신모델 2종 양산 이관을 일정대로 마침. 불량률 0.8% → 0.5%로 낮춤.",
  "사내 업무 자동화 3건(재고 보고·출장 정산·근태 집계)으로 월 20시간 절감.",
  "해외 인증(UL·CE) 갱신 5건을 기한 안에 완료, 고객 감사 지적 0건.",
  "협력사 단가 협상으로 원가 3% 절감, 납기 준수율 97% 유지.",
];

export async function makeDemoPastYear(): Promise<Result<{ year: number; people: number }>> {
  if (!isOpen()) return fail("locked", "보안 열쇠를 먼저 열어 주세요(관리자로 들어가면 열 수 있습니다).");
  const db = getDb();
  const [cur] = await db.select().from(reviewCycles).orderBy(desc(reviewCycles.year)).limit(1);
  if (!cur || cur.status === "setup") return fail("stage", "먼저 올해 명단을 올리고 안내 이메일을 보내 주세요.");
  const year = cur.year - 1;
  const [dup] = await db.select({ id: reviewCycles.id }).from(reviewCycles).where(eq(reviewCycles.year, year)).limit(1);
  if (dup) return fail("exists", `${year}년 기록이 이미 있습니다. 처음부터 하려면 [시험-초기화]를 쓰세요.`);
  const people = await db.select().from(cyclePeople).where(eq(cyclePeople.cycleId, cur.id));

  let count = 0;
  await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(reviewCycles)
      .values({ year, status: "second_review", selfStart: `${year}-11-03`, selfEnd: `${year}-11-07`, firstStart: `${year}-11-10`, firstEnd: `${year}-11-14`, secondStart: `${year}-11-17`, secondEnd: `${year}-11-21`, bonusCutoff: `${year}-11-14`, invitedAt: new Date() })
      .returning();
    const idMap = new Map<string, string>();
    for (const p of people) {
      const { id, cycleId, createdAt, updatedAt, firstReviewerId, secondReviewerId, ...rest } = p;
      void cycleId;
      void createdAt;
      void updatedAt;
      void firstReviewerId;
      void secondReviewerId;
      const [n] = await tx.insert(cyclePeople).values({ ...rest, cycleId: c!.id }).returning({ id: cyclePeople.id });
      idMap.set(id, n!.id);
    }
    for (const p of people) {
      const nid = idMap.get(p.id)!;
      await tx
        .update(cyclePeople)
        .set({ firstReviewerId: p.firstReviewerId ? (idMap.get(p.firstReviewerId) ?? null) : null, secondReviewerId: p.secondReviewerId ? (idMap.get(p.secondReviewerId) ?? null) : null })
        .where(eq(cyclePeople.id, nid));
    }
    const targets = people.filter((p) => p.isTarget && p.formType);
    for (const [k, p] of targets.entries()) {
      const nid = idMap.get(p.id)!;
      const form = p.formType as FormType;
      const base = [8.6, 8.1, 7.8, 7.4, 8.3, 7.1][k % 6]!;
      const [ev] = await tx
        .insert(evaluations)
        .values({
          personId: nid,
          achievementText: enc(`${year}년 ${ACH[k % ACH.length]}`),
          improvementText: enc(`${year + 1}년에는 담당 업무 표준화와 후배 육성에 힘쓰겠습니다.`),
          selfSubmittedAt: new Date(),
          firstSubmittedAt: new Date(),
          secondSubmittedAt: form === "member" ? new Date() : null,
          firstComment: enc(form === "leader" ? "팀 목표를 안정적으로 이끌었습니다. 내년엔 팀원 육성 계획을 구체화해 주세요." : "맡은 일을 끝까지 책임지고 해냈습니다. 협업 범위를 넓혀 보세요."),
          secondComment: form === "member" ? enc("성과가 꾸준합니다. 보고 시 근거 자료를 조금 더 보강하면 좋겠습니다.") : null,
          version: 1,
        })
        .returning({ id: evaluations.id });
      const rows: { evaluationId: string; rater: "self" | "first" | "second"; itemCode: string; score: string }[] = [];
      for (const [i, it] of FORMS[form].entries()) rows.push({ evaluationId: ev!.id, rater: "self", itemCode: it.code, score: encNum(Math.min(10, Math.round(base) + (i % 2)))! });
      for (const [i, code] of scoreCodes(form).entries()) {
        rows.push({ evaluationId: ev!.id, rater: "first", itemCode: code, score: encNum(Math.round((base + ((i % 3) - 1) * 0.3) * 10) / 10)! });
        if (form === "member") rows.push({ evaluationId: ev!.id, rater: "second", itemCode: code, score: encNum(Math.round((base - 0.2 + ((i % 2) - 0.5) * 0.4) * 10) / 10)! });
      }
      await tx.insert(evaluationScores).values(rows);
      if (k % 2 === 0) await tx.insert(bonusPoints).values({ personId: nid, item: "certificate", points: encNum(1)! });
      if (k % 3 === 0) await tx.insert(bonusPoints).values({ personId: nid, item: "education", points: encNum(0.5)! });
      count++;
    }
    await recomputeFinal(tx, c!.id);
    const now = new Date();
    await tx.update(reviewCycles).set({ status: "closed", confirmedAt: now, confirmedBy: "시험", bonusClosedAt: now, closedAt: now, closedBy: "시험" }).where(eq(reviewCycles.id, c!.id));
  });
  return ok({ year, people: count });
}
