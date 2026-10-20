import { describe, expect, it } from "vitest";
import { checkRoster, normalizeDate, type RawRosterRow } from "@/domain/roster";

let n = 1;
const row = (p: Partial<RawRosterRow>): RawRosterRow => ({
  rowNo: ++n, employeeNo: `E${n}`, name: "이름", email: `p${n}@x.test`, department: "영업1팀", position: "대리", hireDate: "2021-03-02", isTeamLeader: "아니오", executiveEmail: "exec@x.test", ...p,
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

describe("사번 (포털 로그인용, ADR-0020)", () => {
  it("사번이 비거나 겹치면 확인 필요", () => {
    const r = checkRoster([exec(), leader(), row({ employeeNo: "" }), row({ employeeNo: "DUP" }), row({ employeeNo: "DUP" })], 2026);
    expect(r.issues.filter((i) => i.reason.includes("사번")).map((i) => i.reason)).toEqual(["사번이 비어 있습니다", expect.stringContaining("번째 줄과 같습니다")]);
  });
});

describe("평가자 직접 지정 (2026-10-15)", () => {
  it("1차·2차 평가자 사번을 적으면 부서 팀장·담당 임원 대신 그 사람으로", () => {
    const other = row({ employeeNo: "L2", name: "다른팀장", email: "lead2@x.test", department: "품질팀", position: "부장", isTeamLeader: "예" });
    const m = row({ email: "m@x.test", department: "없는팀", executiveEmail: "", firstReviewerNo: "L2", secondReviewerNo: "X1" });
    const r = checkRoster([{ ...exec(), employeeNo: "X1" }, leader(), other, m], 2026);
    const p = r.people.find((q) => q.email === "m@x.test")!;
    expect([p.firstReviewerEmail, p.secondReviewerEmail]).toEqual(["lead2@x.test", "exec@x.test"]);
    expect(r.issues.filter((i) => i.name === p.name)).toEqual([]);
  });
  it("명단에 없는 사번·본인·1차=2차·팀장의 1차·2차 동시 지정은 확인 필요", () => {
    const r = checkRoster(
      [
        { ...exec(), employeeNo: "X1" },
        row({ employeeNo: "A1", email: "a@x.test", firstReviewerNo: "NOPE" }),
        row({ employeeNo: "A2", email: "b@x.test", firstReviewerNo: "A2" }),
        row({ employeeNo: "A3", email: "c@x.test", firstReviewerNo: "X1", secondReviewerNo: "X1" }),
        row({ employeeNo: "A4", email: "d@x.test", position: "부장", isTeamLeader: "예", firstReviewerNo: "X1", secondReviewerNo: "X1" }),
      ],
      2026,
    );
    const reasons = r.issues.map((i) => i.reason).join("|");
    expect(reasons).toContain("사번 NOPE이(가) 명단에 없습니다");
    expect(reasons).toContain("본인으로 지정할 수 없습니다");
    expect(reasons).toContain("1차 평가자와 2차 평가자가 같은 사람입니다");
    expect(reasons).toContain("1차·2차 평가자 사번 중 한 칸만");
  });
  it("팀장 평가 임원은 2차 칸에 적어도 된다, 호봉·승진연한·생년월일을 읽는다 (2026-10-20)", () => {
    const r = checkRoster(
      [
        { ...exec(), employeeNo: "X1" },
        row({ employeeNo: "A4", email: "d@x.test", position: "부장", isTeamLeader: "예", executiveEmail: "", secondReviewerNo: "X1", payStep: "2", promoYears: "5", birthDate: "1980-09-03" }),
        row({ employeeNo: "A5", email: "e@x.test", payStep: "삼", birthDate: "1990-13-40" }),
      ],
      2026,
    );
    const lead = r.people.find((p) => p.employeeNo === "A4")!;
    expect(r.issues.filter((i) => i.rowNo === lead.rowNo)).toEqual([]);
    expect(lead.firstReviewerEmail).toBe(r.people.find((p) => p.employeeNo === "X1")!.email);
    expect([lead.payStep, lead.promoYears, lead.birthDate]).toEqual([2, 5, "1980-09-03"]);
    const reasons = r.issues.map((i) => i.reason).join("|");
    expect(reasons).toContain("호봉은 숫자로");
    expect(reasons).toContain("생년월일 형식 오류");
  });
});
