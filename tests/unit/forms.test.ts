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
