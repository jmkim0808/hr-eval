// 가점 (PRD 09). 산정 규칙은 시스템이 계산하지 않는다 — 개별담당자가 낸 점수를 받기만 한다.
import { z } from "zod";

export const BONUS_ITEMS = [
  { code: "certificate", label: "자격증" },
  { code: "award", label: "포상" },
  { code: "invention", label: "직무발명보상" },
  { code: "education", label: "교육참여도" },
  { code: "discipline", label: "징계사항", negative: true },
  { code: "internal_control", label: "내부회계관리제도" },
  { code: "multi_rater", label: "다면평가", leaderOnly: true },
] as const;
export type BonusCode = (typeof BONUS_ITEMS)[number]["code"];
export type BonusValues = Record<BonusCode, number>;

export const BONUS_HEADERS = ["이름", "이메일", "부서", ...BONUS_ITEMS.map((i) => ("leaderOnly" in i ? `${i.label}(팀장만)` : i.label))];
export const BONUS_MAX_ROWS = 1000;
export const BONUS_MAX = 100;

export const rawBonusRowsSchema = z.array(z.object({ rowNo: z.number().int(), values: z.array(z.string().max(100)).length(BONUS_HEADERS.length) })).max(BONUS_MAX_ROWS);
export type RawBonusRow = z.infer<typeof rawBonusRowsSchema>[number];

/** 소수 둘째 자리까지 숫자. 빈칸은 0 */
export function parsePoints(raw: string): number | "invalid" {
  const v = raw.trim();
  if (v === "" || v === "-" || v === "—") return 0;
  if (!/^-?\d+(\.\d{1,2})?$/.test(v)) return "invalid";
  const n = Number(v);
  return Math.abs(n) > BONUS_MAX ? "invalid" : n;
}

/** 한 사람 값 검사. 문제 없으면 null */
export function checkValues(values: Partial<Record<BonusCode, number | "invalid">>, isLeader: boolean): string | null {
  for (const it of BONUS_ITEMS) {
    const v = values[it.code] ?? 0;
    if (v === "invalid") return `${it.label}: 소수 둘째 자리까지의 숫자로 넣어 주세요`;
    if ("negative" in it && v > 0) return `${it.label}은 감점이라 0 이하(예: -1)로 넣어 주세요`;
    if (!("negative" in it) && v < 0) return `${it.label}은 0 이상으로 넣어 주세요`;
    if ("leaderOnly" in it && !isLeader && v !== 0) return "팀원은 다면평가를 넣을 수 없습니다";
  }
  return null;
}

/** 합계: 징계(음수)는 빠진다. 부동소수 오차를 피하려 1/100 단위 정수로 더한다 */
export const bonusTotal = (v: Partial<Record<BonusCode, number>>) => Object.values(v).reduce((s, x) => s + Math.round((x ?? 0) * 100), 0) / 100;

export type RosterRef = { id: string; name: string; email: string; department: string; isLeader: boolean };
export type BonusCheck = {
  total: number;
  matched: { personId: string; name: string; values: BonusValues }[];
  mismatched: { rowNo: number; name: string; email: string; reason: string }[];
  invalid: { rowNo: number; name: string; reason: string }[];
};

export function checkBonusRows(rows: RawBonusRow[], roster: RosterRef[]): BonusCheck {
  const byEmail = new Map(roster.map((r) => [r.email.toLowerCase(), r]));
  const out: BonusCheck = { total: 0, matched: [], mismatched: [], invalid: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    const [name = "", email = "", , ...vals] = r.values.map((v) => v.trim());
    if (!name && !email && vals.every((v) => !v)) continue;
    out.total++;
    const p = byEmail.get(email.toLowerCase());
    if (!p) {
      out.mismatched.push({ rowNo: r.rowNo, name, email, reason: "명단에 없는 이메일" });
      continue;
    }
    if (p.name !== name) {
      out.mismatched.push({ rowNo: r.rowNo, name, email, reason: `명단의 이름은 ${p.name}` });
      continue;
    }
    if (seen.has(p.id)) {
      out.invalid.push({ rowNo: r.rowNo, name, reason: "같은 사람이 두 줄 있습니다" });
      continue;
    }
    seen.add(p.id);
    const parsed = Object.fromEntries(BONUS_ITEMS.map((it, i) => [it.code, parsePoints(vals[i] ?? "")])) as Record<BonusCode, number | "invalid">;
    const err = checkValues(parsed, p.isLeader);
    if (err) {
      out.invalid.push({ rowNo: r.rowNo, name, reason: err });
      continue;
    }
    out.matched.push({ personId: p.id, name: p.name, values: parsed as BonusValues });
  }
  return out;
}

/** 가점 표 한 줄 */
export type BonusRow = RosterRef & { values: BonusValues | null; total: number | null };
