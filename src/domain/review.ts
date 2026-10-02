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
