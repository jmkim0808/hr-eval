// 직원 명단 템플릿 규칙 (PRD 02). 브라우저와 서버가 같은 규칙으로 검사한다 (ADR-0008).
import { z } from "zod";

export const ROSTER_HEADERS = ["이름", "이메일", "부서", "직급", "입사일", "팀장 여부", "담당 임원"] as const;
export const ROSTER_MAX_ROWS = 1000;
export const ROSTER_MAX_BYTES = 1024 * 1024;

/** 임원(평가 대상이 아니라 평가자) 직급 — 가정: 아래 이름을 임원으로 본다 */
export const EXECUTIVE_POSITIONS = ["이사", "상무", "전무", "부사장", "사장", "임원"] as const;
/** 직급 → 그룹 (팀장은 직급과 상관없이 1그룹) */
export const POSITION_GROUP: Record<string, 2 | 3 | 4 | 5> = {
  부장: 2,
  차장: 3,
  과장: 4,
  대리: 5,
  주임: 5,
  사원: 5,
};

export type RawRosterRow = { rowNo: number; name: string; email: string; department: string; position: string; hireDate: string; isTeamLeader: string; executiveEmail: string };

export const rawRowSchema = z.object({
  rowNo: z.number().int().min(2),
  name: z.string().max(50),
  email: z.string().max(254),
  department: z.string().max(50),
  position: z.string().max(20),
  hireDate: z.string().max(20),
  isTeamLeader: z.string().max(10),
  executiveEmail: z.string().max(254),
});
export const rawRowsSchema = z.array(rawRowSchema).max(ROSTER_MAX_ROWS);

export type RosterPerson = {
  rowNo: number;
  name: string;
  email: string;
  department: string;
  position: string;
  hireDate: string; // YYYY-MM-DD
  isTeamLeader: boolean;
  isExecutive: boolean;
  isTarget: boolean;
  excludedReason: string | null;
  gradeGroup: 1 | 2 | 3 | 4 | 5 | null;
  formType: "member" | "leader" | null;
  firstReviewerEmail: string | null;
  secondReviewerEmail: string | null;
};

export type RosterIssue = { rowNo: number; name: string; reason: string };
export type RosterCheck = { people: RosterPerson[]; issues: RosterIssue[]; counts: { applied: number; excluded: number; needsCheck: number } };

const emailOk = (s: string) => z.string().email().safeParse(s).success;

/** 엑셀 칸 값(문자·날짜·숫자)을 YYYY-MM-DD로. 실패하면 null */
export function normalizeDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return null;
  }
  m = s.match(/^\d{5}$/); // 엑셀 날짜 일련번호
  if (m) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000);
    return dt.toISOString().slice(0, 10);
  }
  return null;
}

const yes = (s: string) => ["예", "y", "yes", "o", "팀장"].includes(s.trim().toLowerCase());
const no = (s: string) => ["아니오", "아니요", "n", "no", "x", ""].includes(s.trim().toLowerCase());

/**
 * 명단 검사와 자동 채움.
 * - 그해 6월 30일 이후 입사자는 제외
 * - 팀장: 1그룹·팀장용, 1차 평가자 = 담당 임원, 2차 없음
 * - 팀원: 직급으로 그룹, 1차 평가자 = 같은 부서 팀장, 2차 평가자 = 담당 임원
 * - 임원 직급: 평가 대상이 아니고 평가자로만 명단에 남음
 */
export function checkRoster(rows: RawRosterRow[], cycleYear: number): RosterCheck {
  const issues: RosterIssue[] = [];
  const cutoff = `${cycleYear}-06-30`;
  const seen = new Map<string, number>();
  const people: RosterPerson[] = [];
  const bad = new Set<number>();
  const add = (r: { rowNo: number; name: string }, reason: string) => {
    issues.push({ rowNo: r.rowNo, name: r.name || "(이름 없음)", reason });
    bad.add(r.rowNo);
  };

  for (const r of rows) {
    const name = r.name.trim();
    const email = r.email.trim().toLowerCase();
    const department = r.department.trim();
    const position = r.position.trim();
    const isExecutive = (EXECUTIVE_POSITIONS as readonly string[]).includes(position);
    const row = { rowNo: r.rowNo, name };
    if (!name) add(row, "이름이 비어 있습니다");
    if (!email) add(row, "이메일이 비어 있습니다");
    else if (!emailOk(email)) add(row, "이메일 형식 오류");
    else if (seen.has(email)) add(row, `이메일이 ${seen.get(email)}번째 줄과 같습니다`);
    if (email) seen.set(email, r.rowNo);
    const hireDate = normalizeDate(r.hireDate);
    if (!hireDate) add(row, "입사일 형식 오류 (예: 2021-03-02)");
    let isTeamLeader = false;
    if (yes(r.isTeamLeader)) isTeamLeader = true;
    else if (!no(r.isTeamLeader)) add(row, "팀장 여부는 예 또는 아니오로 적어 주세요");
    if (!isExecutive) {
      if (!department) add(row, "부서가 비어 있습니다");
      if (!isTeamLeader && !(position in POSITION_GROUP)) add(row, `직급을 알 수 없습니다 (${position || "빈칸"})`);
    }
    const excludedReason = !isExecutive && hireDate && hireDate > cutoff ? "7월 이후 입사" : null;
    const isTarget = !isExecutive && !excludedReason;
    people.push({
      rowNo: r.rowNo,
      name,
      email,
      department,
      position,
      hireDate: hireDate ?? "",
      isTeamLeader,
      isExecutive,
      isTarget,
      excludedReason: isExecutive ? "임원 (평가자)" : excludedReason,
      gradeGroup: !isTarget ? null : isTeamLeader ? 1 : (POSITION_GROUP[position] ?? null),
      formType: !isTarget ? null : isTeamLeader ? "leader" : "member",
      firstReviewerEmail: null,
      secondReviewerEmail: null,
    });
    void r.executiveEmail;
  }

  // 평가자 자동 채움
  const byEmail = new Map(people.map((p) => [p.email, p]));
  const leaderOf = new Map<string, RosterPerson>();
  for (const p of people) if (p.isTeamLeader && !p.isExecutive && p.department && !leaderOf.has(p.department)) leaderOf.set(p.department, p);
  for (const [i, p] of people.entries()) {
    if (!p.isTarget) continue;
    const exec = rows[i]!.executiveEmail.trim().toLowerCase();
    const execP = exec ? byEmail.get(exec) : undefined;
    if (!exec) add(p, "담당 임원이 비어 있습니다");
    else if (!execP || !execP.isExecutive) add(p, "담당 임원 이메일이 명단의 임원과 맞지 않습니다");
    if (p.formType === "leader") {
      p.firstReviewerEmail = execP?.isExecutive ? execP.email : null;
    } else {
      const leader = leaderOf.get(p.department);
      p.firstReviewerEmail = leader && leader.email !== p.email ? leader.email : null;
      p.secondReviewerEmail = execP?.isExecutive ? execP.email : null;
      if (!p.firstReviewerEmail) add(p, `${p.department}에 팀장이 없습니다 (1차 평가자)`);
    }
  }

  const excluded = people.filter((p) => p.excludedReason === "7월 이후 입사" && !bad.has(p.rowNo)).length;
  const needsCheck = bad.size;
  const applied = people.filter((p) => p.isTarget && !bad.has(p.rowNo)).length;
  issues.sort((a, b) => a.rowNo - b.rowNo);
  return { people, issues, counts: { applied, excluded, needsCheck } };
}
