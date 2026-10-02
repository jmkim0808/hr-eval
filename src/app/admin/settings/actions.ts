"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type Result } from "@/lib/result";
import { normalizeEmail } from "@/server/auth/service";
import { requireAdmin } from "@/server/authz/actor";
import { addAdmin, removeAdmin } from "@/server/repo/admins";

export type AddState = { ok?: boolean; message?: string; at?: number };

export async function addAdminAction(_prev: AddState, form: FormData): Promise<AddState> {
  const actor = await requireAdmin();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const name = String(form.get("name") ?? "").slice(0, 40);
  if (!z.string().email().safeParse(email).success) return { message: "이메일 주소 형식이 아닙니다.", at: Date.now() };
  const r = await addAdmin(actor, email, name);
  if (!r.ok) return { message: r.message, at: Date.now() };
  revalidatePath("/admin/settings");
  return { ok: true, message: `${email}을(를) 관리자로 추가했습니다.`, at: Date.now() };
}

export async function removeAdminAction(email: unknown): Promise<Result> {
  const actor = await requireAdmin();
  const e = z.string().email().safeParse(email);
  if (!e.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await removeAdmin(actor, e.data);
  if (r.ok) revalidatePath("/admin/settings");
  return r;
}
