import { describe, expect, it } from "vitest";
import { FORMS } from "@/domain/forms";
import { computeScores, draftGrades, gradeCounts } from "@/domain/grading";

const fill = (form: "member" | "leader", v: number[] | number, ach: number) => {
  const codes = FORMS[form].map((i) => i.code);
  return { ...Object.fromEntries(codes.map((c, i) => [c, Array.isArray(v) ? v[i]! : v])), achievement: ach };
};

describe("등급 인원 (ADR-0015)", () => {
  it("10명 → S1 A2 B4 C2 D1", () => expect(gradeCounts(10)).toEqual({ S: 1, A: 2, B: 4, C: 2, D: 1 }));
  it("3명 → A1 B2", () => expect(gradeCounts(3)).toEqual({ S: 0, A: 1, B: 2, C: 0, D: 0 }));
  it("42명 → S2 A8 B24 C6 D2", () => expect(gradeCounts(42)).toEqual({ S: 2, A: 8, B: 24, C: 6, D: 2 }));
  it("합계는 언제나 그룹 인원", () => {
    for (let n = 1; n <= 200; n++) {
      const c = gradeCounts(n);
      expect(c.S + c.A + c.B + c.C + c.D).toBe(n);
      expect(c.B).toBeGreaterThanOrEqual(0);
    }
  });
});

// 엑셀 양식 수식(N4=SUM(R12:R21), R=P×60%+Q×40%, N5=(O25×60%+Q25×40%)×10, Q4=N4×O4+N5×O5+P4)으로 손계산한 값
describe("최종점수 = 엑셀 양식 계산 (샘플 3명)", () => {
  it("팀원 A: 1차 8·2차 7 고르게, 업적 8/7, 가점 1.5", () => {
    const r = computeScores("member", fill("member", 8, 8), fill("member", 7, 7), 1.5);
    // 역량 = 10×(4.8+2.8)=76, 업적 = 7.6×10=76, 76×0.3+76×0.7+1.5 = 77.5
    expect(r).toMatchObject({ blank: false, competency: 76, achievement: 76, final: 77.5, firstTotal: 80, secondTotal: 70 });
  });
  it("팀원 B: 항목마다 다른 점수, 징계 -1", () => {
    const f = [9, 8, 7, 6, 9, 8, 7, 6, 9, 8];
    const s = [8, 8, 8, 7, 7, 7, 6, 6, 9, 9];
    const r = computeScores("member", fill("member", f, 9), fill("member", s, 6), -1);
    // R = 8.6, 8.0, 7.4, 6.4, 8.2, 7.6, 6.6, 6.0, 9.0, 8.4 → 합 76.2
    // 업적 = (5.4+2.4)×10 = 78 → 76.2×0.3 + 78×0.7 − 1 = 22.86 + 54.6 − 1 = 76.46
    expect(r).toMatchObject({ competency: 76.2, achievement: 78, final: 76.46 });
  });
  it("팀장: 임원 점수만, 다면평가 가점 2", () => {
    const r = computeScores("leader", fill("leader", [9, 9, 8, 8, 9, 8, 7, 9, 8, 8], 9), {}, 2);
    // 역량 83, 업적 90 → 24.9 + 63 + 2 = 89.9
    expect(r).toMatchObject({ competency: 83, achievement: 90, final: 89.9, secondTotal: null });
  });
  it("평가자 점수가 하나라도 비면 빈칸", () => {
    const f = fill("member", 8, 8);
    delete (f as Record<string, number>).trust;
    expect(computeScores("member", f, fill("member", 7, 7), 0)).toEqual({ blank: true, missing: ["first"] });
  });
});

describe("초안 등급과 동점", () => {
  it("경계 동점은 입사일이 늦은 사람이 아래 등급, 동점 표시", () => {
    const g = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `p${i}`, final: 90 - i, hireDate: "2015-01-01" }));
    // 10명: S1 A2 → 순위 2·3이 A, 4부터 B. 순위 3·4가 88점 동점
    g[2]!.final = 88;
    g[3]!.final = 88;
    g[2]!.hireDate = "2020-01-01"; // p2가 늦게 입사 → p3이 위
    const d = new Map(draftGrades(g).map((r) => [r.id, r]));
    expect(d.get("p3")!.grade).toBe("A");
    expect(d.get("p2")!.grade).toBe("B");
    expect(d.get("p2")!.tieRule).toBe(true);
    expect(d.get("p3")!.tieRule).toBe(false);
    expect(d.get("p0")!.grade).toBe("S");
    expect(d.get("p9")!.grade).toBe("D");
  });
  it("빈칸인 사람은 순위·등급 없음", () => {
    const d = draftGrades([{ id: "a", name: "a", final: 80, hireDate: "2020-01-01" }, { id: "b", name: "b", final: null, hireDate: "2020-01-01" }]);
    expect(d[1]).toMatchObject({ rank: null, grade: null });
  });
});

import { displayPercentile, planAdjust, type Placed } from "@/domain/grading";

describe("등급조정 (PRD 12)", () => {
  // 10명: S1 A2 B4 C2 D1
  const base = (): Placed[] =>
    ["S", "A", "A", "B", "B", "B", "B", "C", "C", "D"].map((g, i) => ({ id: `p${i + 1}`, rank: i + 1, grade: g as Placed["grade"], manual: false, percentile: (i + 1) * 10 }));
  it("A를 S로 → S 최하단이 A로 밀려난다", () => {
    const r = planAdjust(base(), "p3", "S");
    expect(r).toEqual({ ok: true, moves: [{ id: "p3", from: "A", to: "S", kind: "manual" }, { id: "p1", from: "S", to: "A", kind: "push" }] });
  });
  it("S를 A로 → A 최상단이 S로 올라간다", () => {
    const r = planAdjust(base(), "p1", "A");
    expect(r).toEqual({ ok: true, moves: [{ id: "p1", from: "S", to: "A", kind: "manual" }, { id: "p2", from: "A", to: "S", kind: "push" }] });
  });
  it("B를 S로 → S 최하단은 A로, A 최하단은 B로 연쇄", () => {
    const r = planAdjust(base(), "p6", "S");
    expect(r.ok && r.moves.map((m) => `${m.id}:${m.from}${m.to}`)).toEqual(["p6:BS", "p1:SA", "p3:AB"]);
  });
  it("이미 조정된 사람은 밀어내지 않는다", () => {
    const l = base();
    l[0]!.manual = true; // p1은 조정된 S
    const r = planAdjust(l, "p2", "S");
    expect(r.ok).toBe(false);
  });
  it("조정된 사람의 상위 %는 새 등급 기준", () => {
    const l = base().map((p) => ({ ...p, draft: p.grade }));
    const up = { ...l[2]!, grade: "S" as const, manual: true }; // A(30%)→S
    const list = [up, { ...l[0]!, grade: "A" as const }, ...l.slice(1, 2), ...l.slice(3)];
    expect(displayPercentile(list, up)).toBe(30); // S 안에 조정 안 된 사람이 없으면 자기 값
    const down = { ...l[0]!, grade: "A" as const, manual: true }; // S(10%)→A: A 최상위자(p2 20%)
    expect(displayPercentile([down, ...l.slice(1)], down)).toBe(20);
  });
});
