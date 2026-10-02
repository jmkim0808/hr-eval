// 평가하기 규칙 (PRD 07·08, docs/tech/02 2-3)
import { FORMS, type FormType } from "./forms";

/** 평가 묶음: 1차(팀장→팀원), 2차(임원→팀원), 팀장 평가(임원→팀장, 2차평가 기간) */
export type ReviewKind = "first" | "second" | "leader";

export const REVIEW = {
  first: { label: "1차 평가", column: "1차", rater: "first", window: "first_review", windowLabel: "1차평가", who: "팀원" },
  second: { label: "2차 평가", column: "2차", rater: "second", window: "second_review", windowLabel: "2차평가", who: "" },
  leader: { label: "팀장 평가", column: "임원", rater: "first", window: "second_review", windowLabel: "2차평가", who: "팀장" },
} as const;

export const ACHIEVEMENT = "achievement";

export type Target = { formType: FormType | null; firstReviewerId: string | null; secondReviewerId: string | null; isTarget: boolean };

/** 나(평가자)와 이 사람의 관계. 맡은 사람이 아니면 null */
export function reviewKindOf(me: string | null, t: Target): ReviewKind | null {
  if (!me || !t.isTarget || !t.formType) return null;
  if (t.formType === "member" && t.firstReviewerId === me) return "first";
  if (t.formType === "member" && t.secondReviewerId === me) return "second";
  if (t.formType === "leader" && t.firstReviewerId === me) return "leader";
  return null;
}

/** 점수를 넣을 수 있는 단계인가 (기간이 지나도 관리자가 넘기기 전까지는 열려 있다) */
export const canScore = (kind: ReviewKind, status: string) => status === REVIEW[kind].window;

/** 평가지 내용을 볼 수 있는가: 본인이 제출했거나, 개인작성 단계가 끝났을 때 */
export const canSeeForm = (status: string, selfSubmitted: boolean) => status !== "setup" && (selfSubmitted || status !== "self_review");

/** 2차 평가자만 1차 점수를 본다. 팀장은 2차 점수를 언제나 볼 수 없다 (이 함수에 2차를 보는 경우가 없다) */
export const seesFirstScores = (kind: ReviewKind) => kind === "second";

export const scoreCodes = (form: FormType) => [...FORMS[form].map((i) => i.code), ACHIEVEMENT];

export function parseScore(raw: string): number | null | "invalid" {
  const v = raw.trim();
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return "invalid";
  const n = Number(v);
  return n >= 1 && n <= 10 ? n : "invalid";
}

export function missingScores(form: FormType, scores: Record<string, number>): string[] {
  return scoreCodes(form).filter((c) => !scores[c]);
}

// ── 평가자 평균 80점 (2026-10-02 추가 요구) ──
// 평가자 한 명이 묶음(1차·2차·팀장 평가)에서 매긴 점수의 평균이 80 ± 0.5 여야 한다. 맡은 사람이 2명 이하면 적용하지 않는다.
// 한 사람에 대한 평가자 점수 = 역량(정성) 10개 합 × 0.3 + 업적(정량) × 10 × 0.7 (100점 만점, 통보용 1차·2차 점수와 같은 식)

export const AVG_TARGET = 80;
export const AVG_TOLERANCE = 0.5;
export const AVG_MIN_PEOPLE = 3;

/** 평가자 한 명의 점수(100점 만점). 칸이 비어 있으면 null. 1/100점 정수로 계산 */
export function raterTotal(form: FormType, s: Record<string, number>): number | null {
  const codes = FORMS[form].map((i) => i.code);
  if ([...codes, ACHIEVEMENT].some((c) => !s[c])) return null;
  const sum = codes.reduce((t, c) => t + s[c]!, 0);
  return (sum * 30 + s[ACHIEVEMENT]! * 700) / 100;
}

export type AverageCheck = { applies: boolean; count: number; avg: number | null; ok: boolean; advice: string | null };

/** 묶음 인원(n)과 지금까지 점수가 다 들어간 사람들의 점수로 평균을 본다 */
export function checkAverage(n: number, totals: number[]): AverageCheck {
  const count = totals.length;
  const avg = count ? Math.round((totals.reduce((a, b) => a + b, 0) / count) * 100) / 100 : null;
  if (n < AVG_MIN_PEOPLE) return { applies: false, count, avg, ok: true, advice: null };
  const ok = avg !== null && Math.abs(avg - AVG_TARGET) <= AVG_TOLERANCE + 1e-9;
  return { applies: true, count, avg, ok, advice: avg === null || ok ? null : averageAdvice(avg, count) };
}

/**
 * 몇 점을 어떻게 고치면 되는지. 업적 1점 = 평가자 점수 7점, 역량 항목 1점 = 0.3점.
 * 합계를 (80 − 평균) × 인원만큼 옮기면 평균이 80이 된다.
 */
export function averageAdvice(avg: number, count: number): string {
  const need = Math.round((AVG_TARGET - avg) * count * 100) / 100; // 옮겨야 할 합계(점)
  const dir = need < 0 ? "낮추면" : "높이면";
  const abs = Math.abs(need);
  let ach = Math.floor(abs / 7);
  let comp = Math.round((abs - ach * 7) / 0.3);
  // 허용 범위(±0.5×인원) 안이면 업적만으로도 충분한지 확인
  if (Math.abs(abs - Math.round(abs / 7) * 7) <= AVG_TOLERANCE * count) {
    ach = Math.round(abs / 7);
    comp = 0;
  }
  const after = Math.round((avg + ((need < 0 ? -1 : 1) * (ach * 7 + comp * 0.3)) / count) * 100) / 100;
  const parts = [ach ? `업적 점수 합계를 ${ach}점` : null, comp ? `역량 항목 점수 합계를 ${comp}점` : null].filter(Boolean).join(", ");
  return `지금 평균 ${avg.toFixed(2)}점입니다. 80점(허용 79.5~80.5)에 맞추려면 ${parts} ${dir} 평균 ${after.toFixed(2)}점이 됩니다. ${count}명 기준으로 업적 점수 1점은 평균을 ${(7 / count).toFixed(2)}점, 역량 항목 1점은 ${(0.3 / count).toFixed(2)}점 바꿉니다. 여러 사람에게 나눠 고쳐도 됩니다.`;
}
