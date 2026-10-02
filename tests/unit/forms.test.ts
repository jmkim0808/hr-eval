import { describe, expect, it } from "vitest";
import { checkSelfSubmit, cleanScores, FORMS } from "@/domain/forms";

describe("평가지 양식 (PRD 04)", () => {
  it("팀원용·팀장용 모두 10개 항목, 팀장용에는 리더쉽·소통·계획", () => {
    expect(FORMS.member).toHaveLength(10);
    expect(FORMS.leader).toHaveLength(10);
    expect(FORMS.leader.filter((i) => i.group === "팀장역량").map((i) => i.name)).toEqual(["리더쉽", "소통", "계획"]);
    expect(FORMS.member.map((i) => i.name)).not.toContain("리더쉽");
  });
  it("양식에 없는 항목과 범위 밖 점수는 버린다", () => {
    expect(cleanScores("member", { trust: 7, leadership: 9, teamwork: 11, discipline: 0 })).toEqual({ trust: 7 });
  });
  it("업적 칸이 비면 제출할 수 없다", () => {
    const scores = Object.fromEntries(FORMS.member.map((i) => [i.code, 5]));
    const r = checkSelfSubmit("member", { scores, achievement: " ", improvement: "개선" }, 2026);
    expect(r?.achievement).toContain("2026년 개인역할 및 업적");
    expect(r?.improvement).toBeUndefined();
    expect(checkSelfSubmit("member", { scores, achievement: "업적", improvement: "개선" }, 2026)).toBeNull();
  });
});

import { canSeeForm, canScore, parseScore, reviewKindOf, seesFirstScores } from "@/domain/review";

describe("평가하기 권한 (PRD 07)", () => {
  const member = { formType: "member" as const, firstReviewerId: "lead", secondReviewerId: "exec", isTarget: true };
  const leader = { formType: "leader" as const, firstReviewerId: "exec", secondReviewerId: null, isTarget: true };
  it("팀장은 자기 팀원만 1차, 임원은 맡은 사람 2차와 팀장 평가", () => {
    expect(reviewKindOf("lead", member)).toBe("first");
    expect(reviewKindOf("exec", member)).toBe("second");
    expect(reviewKindOf("exec", leader)).toBe("leader");
    expect(reviewKindOf("other", member)).toBeNull();
    expect(reviewKindOf("lead", leader)).toBeNull();
  });
  it("점수는 그 단계에서만, 팀장 평가는 2차평가 기간에", () => {
    expect(canScore("first", "self_review")).toBe(false);
    expect(canScore("first", "first_review")).toBe(true);
    expect(canScore("second", "first_review")).toBe(false);
    expect(canScore("leader", "second_review")).toBe(true);
    expect(canScore("leader", "first_review")).toBe(false);
  });
  it("평가지는 제출 뒤부터 보인다", () => {
    expect(canSeeForm("self_review", false)).toBe(false);
    expect(canSeeForm("self_review", true)).toBe(true);
    expect(canSeeForm("first_review", false)).toBe(true);
  });
  it("1차 평가자는 다른 평가자 점수를 보지 않는다", () => {
    expect(seesFirstScores("first")).toBe(false);
    expect(seesFirstScores("second")).toBe(true);
  });
  it("범위 밖 숫자는 저장하지 않는다", () => {
    expect(parseScore("11")).toBe("invalid");
    expect(parseScore("0")).toBe("invalid");
    expect(parseScore("3.5")).toBe("invalid");
    expect(parseScore("10")).toBe(10);
    expect(parseScore("")).toBeNull();
  });
});

import { averageAdvice, checkAverage, raterTotal } from "@/domain/review";

describe("평가자 평균 80점", () => {
  const all = (v: number, ach: number) => ({ ...Object.fromEntries(["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust"].map((c) => [c, v])), achievement: ach });
  it("평가자 점수 = 역량 합×0.3 + 업적×7", () => {
    expect(raterTotal("member", all(8, 8))).toBe(80);
    expect(raterTotal("member", all(9, 8))).toBe(83);
    expect(raterTotal("member", { ...all(8, 8), trust: 0 })).toBeNull();
  });
  it("80 ± 0.5 안이면 통과, 2명 이하는 적용하지 않음", () => {
    expect(checkAverage(3, [80, 79.7, 80.6]).ok).toBe(true);
    expect(checkAverage(3, [83, 80, 80]).ok).toBe(false);
    expect(checkAverage(2, [95, 90]).applies).toBe(false);
  });
  it("조정 안내: 따라 하면 허용 범위에 들어간다", () => {
    for (const totals of [[87, 83, 81], [70, 75, 72, 78], [90, 90, 90, 90, 90], [80.9, 80.9, 80.9]]) {
      const c = checkAverage(totals.length, totals);
      const m = c.advice!.match(/평균 ([\d.]+)점이 됩니다/);
      expect(Math.abs(Number(m![1]) - 80)).toBeLessThanOrEqual(0.5);
    }
    expect(averageAdvice(83, 3)).toContain("낮추면");
    expect(averageAdvice(82, 3)).toContain("업적 점수 1점은 평균을 2.33점, 역량 항목 1점은 0.10점");
  });
});
