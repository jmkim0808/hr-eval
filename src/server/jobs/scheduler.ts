// 앱 안 예약 실행 (포털에는 cron이 없다, ADR-0019). 서버가 켜지면 1분마다:
//  - 보낼 메일 목록 비우기(10통씩) — ADR-0006
//  - 아침 8시 이후 하루 한 번 오류 요약 — ADR-0013
// 한 번에 하나만 돌고, 실패해도 다음 분에 다시 한다. 받는 사람·내용은 기록하지 않는다.
import { runErrorDigest } from "@/server/jobs/error-digest";
import { drainOutbox } from "@/server/repo/outbox";

const EVERY_MS = 60_000;
const g = globalThis as unknown as { __hrScheduler?: NodeJS.Timeout };

export function startScheduler() {
  if (g.__hrScheduler || process.env.HR_SCHEDULER === "off") return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runErrorDigest();
      await drainOutbox();
    } catch (e) {
      console.error("[scheduler] 실패:", e instanceof Error ? e.message.slice(0, 120) : "unknown");
    } finally {
      running = false;
    }
  };
  g.__hrScheduler = setInterval(tick, EVERY_MS);
  g.__hrScheduler.unref?.();
}
