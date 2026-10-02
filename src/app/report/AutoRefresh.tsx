"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const EVERY_MS = 10_000; // ADR-0017

/** 10초마다 새로 읽는다. 화면이 숨겨져 있으면 쉬고, 다시 보이면 바로 읽는다 */
export function AutoRefresh() {
  const router = useRouter();
  const [at, setAt] = useState(() => new Date());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setAt(new Date());
    };
    const t = setInterval(tick, EVERY_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);
  return (
    <span className="flex items-center gap-1.5 text-caption text-muted-foreground" aria-live="off">
      <RefreshCw className="size-3.5" aria-hidden="true" />
      10초마다 새로 고침 · 마지막 {at.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
    </span>
  );
}
