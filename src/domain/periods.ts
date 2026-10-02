// 기간 규칙 (PRD 03)
import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요");

export const periodsSchema = z.object({
  selfStart: day,
  selfEnd: day,
  firstStart: day,
  firstEnd: day,
  secondStart: day,
  secondEnd: day,
  bonusCutoff: day,
});
export type Periods = z.infer<typeof periodsSchema>;

export type PeriodErrors = Partial<Record<keyof Periods, string>>;

/** 순서 검사: 각 기간은 시작 ≤ 끝, 1차는 개인작성이 끝난 뒤, 2차는 1차가 끝난 뒤 */
export function checkPeriods(p: Periods): PeriodErrors {
  const e: PeriodErrors = {};
  if (p.selfStart > p.selfEnd) e.selfEnd = "끝나는 날이 시작하는 날보다 앞입니다";
  if (p.firstStart > p.firstEnd) e.firstEnd = "끝나는 날이 시작하는 날보다 앞입니다";
  if (p.secondStart > p.secondEnd) e.secondEnd = "끝나는 날이 시작하는 날보다 앞입니다";
  if (p.firstStart <= p.selfEnd) e.firstStart = "1차평가 기간은 개인작성 기간이 끝난 뒤로 정해 주세요";
  if (p.secondStart <= p.firstEnd) e.secondStart = "2차평가 기간은 1차평가 기간이 끝난 뒤로 정해 주세요";
  return e;
}

export const fmtDay = (d: string | null | undefined) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "—");
export const fmtRange = (a: string | null | undefined, b: string | null | undefined) => `${fmtDay(a)} ~ ${fmtDay(b)}`;
