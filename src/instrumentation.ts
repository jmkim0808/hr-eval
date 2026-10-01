// 예상 못 한 실패를 error_logs에 남긴다 (ADR-0013). 화면에는 요청 번호(digest)만 보인다.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  try {
    const e = err as Error & { digest?: string };
    const { logError } = await import("@/server/repo/logs");
    await logError(`${context.routeType}:${context.routePath}`, e.message ?? "unknown", e.digest ?? "none");
  } catch {
    // 기록 실패는 무시 (기록 때문에 화면이 또 실패하지 않게)
  }
};
