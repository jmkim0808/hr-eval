/** 서울 기준 오늘의 연도 (평가 연도) */
export function seoulYear(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(d));
}
