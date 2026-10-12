// 서버가 켜질 때 한 번: 앱 안 예약 실행 시작 (ADR-0019), 보안 열쇠 상태 확인 (ADR-0021).
// 예상 못 한 실패는 error_logs에 남긴다 (ADR-0013). 화면에는 요청 번호(digest)만 보인다.
import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("@/server/jobs/scheduler");
  startScheduler();
  // 보안 열쇠: 개발 모드면 자동으로 열고, 운영에서 잠긴 채 평가 중이면 관리자에게 알린다 (ADR-0021)
  const { alertIfLockedOnStart } = await import("@/server/repo/vault");
  await alertIfLockedOnStart().catch((e) => console.error("[vault] 시작 확인 실패:", e instanceof Error ? e.message.slice(0, 120) : "unknown"));
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  try {
    const e = err as Error & { digest?: string };
    const { logError } = await import("@/server/repo/logs");
    await logError(`${context.routeType}:${context.routePath}`, e.message ?? "unknown", e.digest ?? "none");
  } catch {
    // 기록 실패는 무시 (기록 때문에 화면이 또 실패하지 않게)
  }
};
