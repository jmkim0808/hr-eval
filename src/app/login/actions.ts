"use server";

// 로그인 = 1차 포털 로그인(토큰) + 2차 메일 인증번호 (ADR-0020).
// 토큰은 브라우저 저장소(ax_access_token)에 있어 요청마다 화면이 넘겨 주고, 서버가 매번 다시 확인한다.
import { cookies, headers } from "next/headers";
import { env } from "@/platform/env";
import { BASE_PATH } from "@/lib/base-path";
import { maskEmail, verifyPortalToken } from "@/server/auth/portal-token";
import { requestCode, sessionHash, verifyCode } from "@/server/auth/service";
import { SESSION_COOKIE } from "@/server/authz/actor";
import { getDb } from "@/server/db/client";
import * as repo from "@/server/repo/login";

export type PortalState =
  | { kind: "ready"; name: string; maskedEmail: string }
  | { kind: "error"; code: "missing" | "invalid" | "expired" | "must_change_password" | "not_registered"; message: string };

const MESSAGES = {
  missing: "포털에 로그인한 뒤 다시 열어 주세요.",
  invalid: "포털 로그인 정보를 확인할 수 없습니다. 포털에 다시 로그인한 뒤 열어 주세요.",
  expired: "포털 로그인이 만료되었습니다. 포털에 다시 로그인한 뒤 열어 주세요.",
  must_change_password: "포털에서 비밀번호를 바꾼 뒤 다시 열어 주세요.",
  not_registered: "인사평가에 등록되지 않은 사번입니다. 평가 대상이라면 인사 담당자에게 문의해 주세요.",
} as const;

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** 1차(포털 토큰) 확인 → 등록된 사람이면 메일 주소(가린 것)를 돌려준다 */
async function resolve(token: unknown): Promise<{ ok: true; email: string; name: string } | { ok: false; state: PortalState }> {
  const r = verifyPortalToken(typeof token === "string" ? token : null, env.jwtSecret);
  if (!r.ok) return { ok: false, state: { kind: "error", code: r.reason, message: MESSAGES[r.reason] } };
  const who = await repo.findEmailByEmployeeNo(getDb(), r.claims.sub);
  if (!who) return { ok: false, state: { kind: "error", code: "not_registered", message: MESSAGES.not_registered } };
  return { ok: true, email: who.email, name: who.name };
}

export async function portalCheckAction(token: unknown): Promise<PortalState> {
  const r = await resolve(token);
  return r.ok ? { kind: "ready", name: r.name, maskedEmail: maskEmail(r.email) } : r.state;
}

export type SendResult = { ok: true; sentAt: number } | { ok: false; message: string };

export async function portalSendCodeAction(token: unknown): Promise<SendResult> {
  const r = await resolve(token);
  if (!r.ok) return { ok: false, message: r.state.kind === "error" ? r.state.message : "" };
  const s = await requestCode(r.email, await clientIp());
  return s.ok ? { ok: true, sentAt: Date.now() } : { ok: false, message: s.message };
}

export async function portalVerifyAction(token: unknown, code: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await resolve(token);
  if (!r.ok) return { ok: false, message: r.state.kind === "error" ? r.state.message : "" };
  const v = await verifyCode(r.email, String(code ?? ""));
  if (!v.ok) return { ok: false, message: v.message };
  (await cookies()).set(SESSION_COOKIE, v.value.token, {
    httpOnly: true,
    secure: env.appUrl.startsWith("https://"),
    sameSite: "lax",
    path: BASE_PATH || "/", // 포털의 다른 앱에는 이 쿠키가 가지 않게
    expires: v.value.expiresAt,
  });
  return { ok: true };
}

/** 로그아웃 (포털에서 다른 사람으로 바뀌었을 때도 화면이 부른다) */
export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await repo.deleteSession(getDb(), await sessionHash(token));
  jar.set(SESSION_COOKIE, "", { path: BASE_PATH || "/", expires: new Date(0) });
}
