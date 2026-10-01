"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/platform/env";
import { requestCode, verifyCode } from "@/server/auth/service";
import { SESSION_COOKIE } from "@/server/authz/actor";

export type LoginState = {
  step: "email" | "code";
  email: string;
  message?: string;
  error?: string;
  sentAt?: number;
};

const emailSchema = z.string().trim().max(254).email("이메일 주소 형식이 아닙니다.");

async function clientIp() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function sendCodeAction(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { step: "email", email: String(form.get("email") ?? ""), error: parsed.error.issues[0]?.message };
  const r = await requestCode(parsed.data, await clientIp());
  if (!r.ok) {
    const back = form.get("resend") ? "code" : "email";
    return { step: back, email: parsed.data, error: r.message };
  }
  return { step: "code", email: parsed.data, message: "인증번호를 보냈습니다. 메일함을 확인하세요.", sentAt: Date.now() };
}

export type VerifyState = { error?: string; at?: number };

export async function verifyCodeAction(_: VerifyState, form: FormData): Promise<VerifyState> {
  const r = await verifyCode(String(form.get("email") ?? ""), String(form.get("code") ?? ""));
  if (!r.ok) return { error: r.message, at: Date.now() };
  (await cookies()).set(SESSION_COOKIE, r.value.token, {
    httpOnly: true,
    secure: env.appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: r.value.expiresAt,
  });
  redirect("/");
}
