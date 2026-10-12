// 포털 로그인 토큰 확인 (사내 앱 사양 5장, ADR-0020). HS256, 비밀값은 환경변수 JWT_SECRET_KEY.
// 1차 인증은 포털 로그인, 2차 인증은 우리 메일 인증번호다. 이 함수는 1차만 확인한다.
import { createHmac, timingSafeEqual } from "node:crypto";

export type PortalClaims = { sub: string; name?: string; dept_code?: string; title?: string; role?: string; exp: number; must_change_password?: boolean };
export type PortalCheck = { ok: true; claims: PortalClaims } | { ok: false; reason: "missing" | "invalid" | "expired" | "must_change_password" };

const SKEW_SEC = 30;
const b64url = (b: Buffer) => b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const parse = (s: string) => JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));

export function verifyPortalToken(token: string | null | undefined, secret: string, nowMs = Date.now()): PortalCheck {
  if (!token) return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "invalid" };
  const [h, p, sig] = parts as [string, string, string];
  try {
    const header = parse(h);
    if (header.alg !== "HS256") return { ok: false, reason: "invalid" }; // 서명 없는 토큰(none) 등은 받지 않는다
    const expect = b64url(createHmac("sha256", secret).update(`${h}.${p}`).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
    const claims = parse(p) as PortalClaims;
    if (typeof claims.sub !== "string" || !claims.sub.trim()) return { ok: false, reason: "invalid" };
    if (typeof claims.exp !== "number" || claims.exp * 1000 < nowMs - SKEW_SEC * 1000) return { ok: false, reason: "expired" };
    if (claims.must_change_password) return { ok: false, reason: "must_change_password" };
    return { ok: true, claims: { ...claims, sub: claims.sub.trim() } };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/** 테스트·개발용: 같은 형식의 토큰을 만든다 (운영 코드에서는 쓰지 않음) */
export function signPortalToken(claims: Record<string, unknown>, secret: string): string {
  const enc = (o: unknown) => b64url(Buffer.from(JSON.stringify(o)));
  const h = enc({ alg: "HS256", typ: "JWT" });
  const p = enc(claims);
  return `${h}.${p}.${b64url(createHmac("sha256", secret).update(`${h}.${p}`).digest())}`;
}

/** 화면에 보여 줄 메일 주소 가리기: kim@powernet.co.kr → k***@powernet.co.kr */
export const maskEmail = (e: string) => {
  const [u, d] = e.split("@");
  return `${(u ?? "").slice(0, 1)}***@${d ?? ""}`;
};
