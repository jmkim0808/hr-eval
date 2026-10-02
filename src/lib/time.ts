/** 서울 기준 오늘의 연도 (평가 연도) */
export function seoulYear(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(d));
}

/** 서울 기준 오늘 날짜 YYYY-MM-DD */
export function seoulToday(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** 서울 기준 시:분 */
export function seoulTime(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** 오늘부터 마감일까지 남은 날 (지났으면 음수) */
export function daysLeft(end: string, today = seoulToday()): number {
  return Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000);
}
