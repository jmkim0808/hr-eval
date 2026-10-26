"use server";

import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/result";
import { requireAdmin } from "@/server/authz/actor";
import { clearMailSettings, saveMailSettings } from "@/server/repo/mail-settings";

export type MailState = { ok?: boolean; message?: string; at?: number; values?: { host: string; port: string; username: string; fromName: string; fromAddress: string } };

export async function saveMailSettingsAction(_prev: MailState, form: FormData): Promise<MailState> {
  const actor = await requireAdmin();
  const str = (k: string) => String(form.get(k) ?? "").trim();
  // 실패하면 넣은 값을 돌려줘 다시 채운다 (비밀번호는 돌려주지 않는다)
  const values = { host: str("host"), port: str("port"), username: str("username"), fromName: str("fromName"), fromAddress: str("fromAddress") };
  const r = await saveMailSettings(actor, { ...values, port: Number(values.port), password: String(form.get("password") ?? "") });
  if (!r.ok) return { message: r.message, at: Date.now(), values };
  revalidatePath("/admin/mail");
  return {
    ok: true,
    at: Date.now(),
    message: r.value.tested ? `저장했습니다. ${actor.email}로 시험 메일을 보냈습니다 — 받은편지함(없으면 스팸함)을 확인해 주세요.` : "저장했습니다. (시험 모드라 실제 메일 서버 연결은 확인하지 않았습니다)",
  };
}

export async function clearMailSettingsAction(): Promise<Result> {
  const actor = await requireAdmin();
  const r = await clearMailSettings(actor);
  if (r.ok) revalidatePath("/admin/mail");
  return r;
}
