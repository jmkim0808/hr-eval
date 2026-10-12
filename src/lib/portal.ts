"use client";
// 사내 앱 포털과 맞물리는 브라우저 쪽 도구 (사양 5장)

/** 포털 로그인 토큰 (포털이 브라우저 저장소에 넣어 둔다) */
export function portalToken(): string | null {
  try {
    return localStorage.getItem("ax_access_token");
  } catch {
    return null;
  }
}

/** 토큰 안의 사번(sub). 서명 확인은 서버가 한다 — 여기서는 "사람이 바뀌었는지"만 본다 */
export function portalSub(): string | null {
  const t = portalToken();
  const p = t?.split(".")[1];
  if (!p) return null;
  try {
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))).sub ?? null;
  } catch {
    return null;
  }
}

/** 내보내기·다운로드 기록 (사양 5장). 실패해도 내보내기는 그대로 진행한다 */
export function logExport(target: string, sizeBytes: number, rows: number) {
  const token = portalToken();
  fetch("/api/dlp/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ app: "hr-eval", target, size_bytes: sizeBytes, rows }),
  }).catch(() => {});
}
