// 이메일 인증 규칙 (ADR-0005). 숫자를 바꾸면 PRD 01의 확인 문장도 함께 본다.
export const AUTH = {
  codeTtlMs: 10 * 60_000,
  maxAttempts: 5,
  resendAfterMs: 60_000,
  perEmailPerHour: 5,
  perIpPerHour: 30,
  idleMs: 30 * 60_000,
  absoluteMs: 12 * 60 * 60_000,
} as const;
