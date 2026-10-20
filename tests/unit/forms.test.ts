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
  it("범위 밖 숫자는 저장하지 않는다 (0.1점 단위는 허용, 2026-10-15)", () => {
    expect(parseScore("11")).toBe("invalid");
    expect(parseScore("0")).toBe("invalid");
    expect(parseScore("0.9")).toBe("invalid");
    expect(parseScore("3.5")).toBe(3.5);
    expect(parseScore("7.3")).toBe(7.3);
    expect(parseScore("7.35")).toBe("invalid");
    expect(parseScore("10.1")).toBe("invalid");
    expect(parseScore("10")).toBe(10);
    expect(parseScore("")).toBeNull();
  });
});

import { averageAdvice, averageGuide, checkAverage, raterTotal } from "@/domain/review";

describe("평가자 평균 80점", () => {
  const all = (v: number, ach: number) => ({ ...Object.fromEntries(["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust"].map((c) => [c, v])), achievement: ach });
  it("평가자 점수 = 역량 합×0.3 + 업적×7", () => {
    expect(raterTotal("member", all(8, 8))).toBe(80);
    expect(raterTotal("member", all(9, 8))).toBe(83);
    expect(raterTotal("member", { ...all(8, 8), trust: 0 })).toBeNull();
  });
  it("80 ± 0.2 안이면 통과, 1명은 적용하지 않음 (2026-10-20)", () => {
    expect(checkAverage(3, [80, 79.7, 80.6]).ok).toBe(true); // 80.10
    expect(checkAverage(3, [80, 79.4, 80.6]).ok).toBe(true); // 80.00
    expect(checkAverage(3, [80.9, 80, 80]).ok).toBe(false); // 80.30
    expect(checkAverage(2, [95, 90]).applies).toBe(true);
    expect(checkAverage(2, [95, 90]).ok).toBe(false);
    expect(checkAverage(1, [95]).applies).toBe(false);
  });
  it("조정 안내: 따라 하면 허용 범위에 들어간다", () => {
    for (const totals of [[87, 83, 81], [70, 75, 72, 78], [90, 90, 90, 90, 90], [80.9, 80.9, 80.9]]) {
      const c = checkAverage(totals.length, totals);
      const m = c.advice!.match(/평균 ([\d.]+)점이 됩니다/);
      expect(Math.abs(Number(m![1]) - 80)).toBeLessThanOrEqual(0.2);
    }
    expect(averageAdvice(83, 3)).toContain("낮추면");
    expect(averageAdvice(82, 3)).toContain("업적 점수 합계를 0.9점 낮추면 평균 79.90점");
  });
});

describe("평균 안내 — 사람별 구체 제안 (2026-10-15)", () => {
  const row = (id: string, total: number | null, ach: number | null) => ({ id, name: id, total, ach });
  it("다 넣기 전에는 남은 사람에게 평균 몇 점을 주면 되는지", () => {
    const g = averageGuide([row("a", 90, 9), row("b", 80, 8), row("c", null, null), row("d", null, null)], "a");
    expect(g).toMatchObject({ kind: "pending", filled: 2, n: 4, perPerson: 75 });
  });
  it("다 넣었는데 87.5점이면: 지금 사람 업적만 고치기와 모두 고르게 고치기 두 가지", () => {
    const g = averageGuide([row("a", 90, 9), row("b", 80, 8), row("c", 80, 8), row("d", 100, 10)], "d");
    if (g.kind !== "off") throw new Error(g.kind);
    expect(g.options[0]).toMatchObject({ changes: [{ id: "d", from: 10, to: 5.7 }] });
    expect(Math.abs(g.options[0]!.after - 80)).toBeLessThanOrEqual(0.5);
    expect(g.options[1]!.changes.every((c) => Math.abs(c.to - c.from + 1.1) < 1e-9)).toBe(true);
    expect(Math.abs(g.options[1]!.after - 80)).toBeLessThanOrEqual(0.5);
  });
  it("기준 안이면 ok, 1명이면 적용 안 함 (2026-10-20)", () => {
    expect(averageGuide([row("a", 80, 8), row("b", 80.3, 8), row("c", 79.9, 8)], "a").kind).toBe("ok");
    expect(averageGuide([row("a", 90, 9), row("b", 75, 7)], "a").kind).toBe("off");
    expect(averageGuide([row("a", 90, 9)], "a").kind).toBe("na");
  });
});
