import { describe, expect, it } from "vitest";
import { checkRoster, normalizeDate, type RawRosterRow } from "@/domain/roster";

let n = 1;
const row = (p: Partial<RawRosterRow>): RawRosterRow => ({
  rowNo: ++n, name: "이름", email: `p${n}@x.test`, department: "영업1팀", position: "대리", hireDate: "2021-03-02", isTeamLeader: "아니오", executiveEmail: "exec@x.test", ...p,
});
const exec = () => row({ name: "정임원", email: "exec@x.test", department: "", position: "상무", executiveEmail: "" });
const leader = () => row({ name: "최팀장", email: "lead@x.test", position: "부장", isTeamLeader: "예" });

describe("직원 명단 검사 (PRD 02)", () => {
  it("팀장은 1그룹·팀장용, 1차 평가자는 담당 임원, 2차 없음", () => {
    const r = checkRoster([exec(), leader()], 2026);
    const l = r.people.find((p) => p.email === "lead@x.test")!;
    expect([l.gradeGroup, l.formType, l.firstReviewerEmail, l.secondReviewerEmail]).toEqual([1, "leader", "exec@x.test", null]);
    expect(r.issues).toEqual([]);
  });
  it("팀원은 직급으로 그룹, 1차 = 같은 부서 팀장, 2차 = 담당 임원", () => {
    const r = checkRoster([exec(), leader(), row({ email: "m@x.test", position: "대리" })], 2026);
    const m = r.people.find((p) => p.email === "m@x.test")!;
    expect([m.gradeGroup, m.formType, m.firstReviewerEmail, m.secondReviewerEmail]).toEqual([5, "member", "lead@x.test", "exec@x.test"]);
  });
  it("7월 1일 이후 입사자는 제외, 6월 30일 입사자는 대상", () => {
    const r = checkRoster([exec(), leader(), row({ email: "a@x.test", hireDate: "2026-07-01" }), row({ email: "b@x.test", hireDate: "2026-06-30" })], 2026);
    expect(r.people.find((p) => p.email === "a@x.test")!.isTarget).toBe(false);
    expect(r.people.find((p) => p.email === "b@x.test")!.isTarget).toBe(true);
    expect(r.counts.excluded).toBe(1);
  });
  it("이메일이 빈 줄은 확인 필요", () => {
    const r = checkRoster([exec(), leader(), row({ email: "" })], 2026);
    expect(r.counts.needsCheck).toBe(1);
    expect(r.issues[0]!.reason).toContain("이메일");
  });
  it("임원은 평가 대상이 아니다", () => {
    const r = checkRoster([exec()], 2026);
    expect(r.people[0]!.isTarget).toBe(false);
  });
  it("엑셀 날짜 일련번호도 날짜로 읽는다", () => {
    expect(normalizeDate("44257")).toBe("2021-03-02");
    expect(normalizeDate("2021.3.2")).toBe("2021-03-02");
    expect(normalizeDate("2021-02-30")).toBeNull();
  });
});
