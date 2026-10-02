"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { fail, type Result } from "@/lib/result";
import { requireAdmin } from "@/server/authz/actor";
import { applyAdjust, previewAdjust, revertAdjust, type PreviewMove } from "@/server/repo/adjust";
import { cancelConfirm, confirmGrades } from "@/server/repo/confirm";
import { getCurrentCycle } from "@/server/repo/cycles";
import { fillBlankScores } from "@/server/repo/final";
import { drainOutbox } from "@/server/repo/outbox";

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

export async function confirmAction(raw: unknown): Promise<Result> {
  const actor = await requireAdmin();
  const p = z.object({ version: z.number().int().min(0) }).safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const cycle = await getCurrentCycle(actor);
  if (!cycle) return fail("no_cycle", "진행 중인 평가가 없습니다.");
  const r = await confirmGrades(actor, cycle.id, p.data.version);
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function cancelConfirmAction(raw: unknown): Promise<Result> {
  const actor = await requireAdmin();
  const p = z.object({ version: z.number().int().min(0), reason: z.string().max(500) }).safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const cycle = await getCurrentCycle(actor);
  if (!cycle) return fail("no_cycle", "진행 중인 평가가 없습니다.");
  const r = await cancelConfirm(actor, cycle.id, p.data.version, p.data.reason);
  if (!r.ok) return r;
  if (r.value.batchId) after(() => drainOutbox().catch(() => 0));
  revalidatePath("/admin", "layout");
  return { ok: true, value: undefined };
}
