import { describe, expect, it } from "vitest";
import { BONUS_HEADERS, bonusTotal, checkBonusRows, parsePoints } from "@/domain/bonus";

const roster = [
  { id: "1", name: "김대리", email: "kim@x", department: "영업", isLeader: false },
  { id: "2", name: "최팀장", email: "lead@x", department: "영업", isLeader: true },
];
const row = (rowNo: number, ...v: string[]) => ({ rowNo, values: [...v, ...Array(BONUS_HEADERS.length - v.length).fill("")] });

describe("가점 (PRD 09)", () => {
  it("이메일로 찾고 이름이 다르면 불일치", () => {
    const r = checkBonusRows([row(2, "김대리", "kim@x", "영업", "1"), row(3, "김대이", "lead@x", "영업"), row(4, "누구", "no@x")], roster);
    expect(r.total).toBe(3);
    expect(r.matched).toHaveLength(1);
    expect(r.mismatched.map((m) => m.rowNo)).toEqual([3, 4]);
  });
  it("징계는 음수만, 팀원은 다면평가 불가", () => {
    expect(checkBonusRows([row(2, "김대리", "kim@x", "", "", "", "", "", "1")], roster).invalid[0]!.reason).toContain("징계");
    expect(checkBonusRows([row(2, "김대리", "kim@x", "", "", "", "", "", "", "", "2")], roster).invalid[0]!.reason).toContain("다면평가");
    expect(checkBonusRows([row(2, "최팀장", "lead@x", "", "", "", "", "", "", "", "2")], roster).matched).toHaveLength(1);
  });
  it("합계는 징계를 빼고 소수 오차가 없다", () => {
    expect(bonusTotal({ certificate: 0.1, award: 0.2, discipline: -1 })).toBe(-0.7);
    expect(parsePoints("1.234")).toBe("invalid");
    expect(parsePoints("")).toBe(0);
  });
});
