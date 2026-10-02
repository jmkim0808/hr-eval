"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type Result } from "@/lib/result";
import { requireAdmin } from "@/server/authz/actor";
import { applyAdjust, previewAdjust, revertAdjust, type PreviewMove } from "@/server/repo/adjust";
import { fillBlankScores } from "@/server/repo/final";

const input = z.object({
  personId: z.string().uuid(),
  first: z.record(z.string(), z.number()),
  second: z.record(z.string(), z.number()),
});

export async function fillBlankAction(raw: unknown): Promise<Result<{ filled: number }>> {
  const actor = await requireAdmin();
  const p = input.safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await fillBlankScores(actor, p.data.personId, { first: p.data.first, second: p.data.second });
  if (r.ok) revalidatePath("/admin/final", "layout");
  return r;
}

const adjustInput = z.object({ personId: z.string().uuid(), to: z.enum(["S", "A", "B", "C", "D"]), version: z.number().int().min(0) });

export async function previewAdjustAction(raw: unknown): Promise<Result<PreviewMove[]>> {
  const actor = await requireAdmin();
  const p = adjustInput.omit({ version: true }).safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  return previewAdjust(actor, p.data.personId, p.data.to);
}

export async function applyAdjustAction(raw: unknown): Promise<Result<PreviewMove[]>> {
  const actor = await requireAdmin();
  const p = adjustInput.safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await applyAdjust(actor, p.data.personId, p.data.to, p.data.version);
  if (r.ok) revalidatePath("/admin/final", "layout");
  return r;
}

export async function revertAdjustAction(raw: unknown): Promise<Result> {
  const actor = await requireAdmin();
  const p = adjustInput.omit({ to: true }).safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await revertAdjust(actor, p.data.personId, p.data.version);
  if (r.ok) revalidatePath("/admin/final", "layout");
  return r;
}
