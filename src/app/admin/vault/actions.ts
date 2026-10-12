"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type Result } from "@/lib/result";
import { requireAdmin } from "@/server/authz/actor";
import { addSlot, lockVault, removeSlot, setupVault, unlockVault } from "@/server/repo/vault";

// 비밀 문구는 받은 즉시 열쇠 계산에만 쓰고 저장·기록하지 않는다 (ADR-0021)
export type VaultFormState = { ok?: boolean; message?: string; at?: number };
const res = (r: Result, done: string): VaultFormState => ({ ok: r.ok, message: r.ok ? done : r.message, at: Date.now() });
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function setupAction(_p: VaultFormState, f: FormData): Promise<VaultFormState> {
  const a = await requireAdmin({ allowLocked: true });
  if (str(f, "passphrase") !== str(f, "confirm")) return { message: "두 번 넣은 비밀 문구가 다릅니다.", at: Date.now() };
  if (f.get("ack") !== "on") return { message: "잃어버리면 복구할 수 없다는 안내에 동의해 주세요.", at: Date.now() };
  const r = await setupVault(a, str(f, "passphrase"));
  revalidatePath("/admin/vault");
  return res(r, "보안 열쇠를 만들고 열었습니다.");
}

export async function unlockAction(_p: VaultFormState, f: FormData): Promise<VaultFormState> {
  const a = await requireAdmin({ allowLocked: true });
  const r = await unlockVault(a, str(f, "passphrase"));
  revalidatePath("/", "layout");
  return res(r, "보안 열쇠를 열었습니다. 이제 모든 화면을 쓸 수 있습니다.");
}

export async function addSlotAction(_p: VaultFormState, f: FormData): Promise<VaultFormState> {
  const a = await requireAdmin({ allowLocked: true });
  if (str(f, "passphrase") !== str(f, "confirm")) return { message: "두 번 넣은 비밀 문구가 다릅니다.", at: Date.now() };
  const r = await addSlot(a, str(f, "label"), str(f, "passphrase"));
  revalidatePath("/admin/vault");
  return res(r, "열쇠 칸을 추가했습니다. 그 사람의 비밀 문구로도 열 수 있습니다.");
}

export async function lockAction(): Promise<Result> {
  const a = await requireAdmin({ allowLocked: true });
  const r = await lockVault(a);
  revalidatePath("/", "layout");
  return r;
}

export async function removeSlotAction(id: unknown): Promise<Result> {
  const a = await requireAdmin({ allowLocked: true });
  const v = z.string().uuid().safeParse(id);
  if (!v.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await removeSlot(a, v.data);
  revalidatePath("/admin/vault");
  return r;
}
