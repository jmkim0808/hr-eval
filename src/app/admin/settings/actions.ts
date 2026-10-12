"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type Result } from "@/lib/result";
import { normalizeEmail } from "@/server/auth/service";
import { requireAdmin } from "@/server/authz/actor";
import { addAdmin, removeAdmin } from "@/server/repo/admins";

export type AddState = { ok?: boolean; message?: string; at?: number; values?: { email: string; employeeNo: string; name: string } };

export async function addAdminAction(_prev: AddState, form: FormData): Promise<AddState> {
  const actor = await requireAdmin();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const name = String(form.get("name") ?? "").slice(0, 40);
  const employeeNo = String(form.get("employeeNo") ?? "").trim();
  // 실패하면 넣은 값을 돌려줘 다시 채운다 (React가 제출 뒤 칸을 비우므로)
  const values = { email: String(form.get("email") ?? ""), employeeNo, name };
  if (!/^[A-Za-z0-9-]{1,30}$/.test(employeeNo)) return { message: "사번을 넣어 주세요 (포털 로그인 사번, 영문·숫자·-).", at: Date.now(), values };
  if (!z.string().email().safeParse(email).success) return { message: "이메일 주소 형식이 아닙니다.", at: Date.now(), values };
  const r = await addAdmin(actor, email, name, employeeNo);
  if (!r.ok) return { message: r.message, at: Date.now(), values };
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
