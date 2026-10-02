"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { fail, type Result } from "@/lib/result";
import { requireAdmin } from "@/server/authz/actor";
import { advanceStage, getCurrentCycle } from "@/server/repo/cycles";
import { drainOutbox } from "@/server/repo/outbox";
import { queueReminders } from "@/server/repo/progress";

export async function sendRemindersAction(personIds: unknown): Promise<Result<{ batchId: string; count: number }>> {
  const actor = await requireAdmin();
  const ids = z.array(z.string().uuid()).max(1000).safeParse(personIds);
  if (!ids.success) return fail("invalid", "잘못된 요청입니다.");
  const cycle = await getCurrentCycle(actor);
  if (!cycle) return fail("no_cycle", "진행 중인 평가가 없습니다.");
  const r = await queueReminders(actor, cycle.id, ids.data);
  if (r.ok) {
    after(() => drainOutbox().catch(() => 0));
    revalidatePath("/admin");
  }
  return r;
}

const advanceSchema = z.object({ from: z.enum(["self_review", "first_review", "second_review"]), version: z.number().int().min(0) });

export async function advanceStageAction(raw: unknown): Promise<Result<{ to: string }>> {
  const actor = await requireAdmin();
  const p = advanceSchema.safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const cycle = await getCurrentCycle(actor);
  if (!cycle) return fail("no_cycle", "진행 중인 평가가 없습니다.");
  const r = await advanceStage(actor, cycle.id, p.data.from, p.data.version);
  if (!r.ok) return r;
  if (r.value.batchId) after(() => drainOutbox().catch(() => 0));
  revalidatePath("/admin", "layout");
  revalidatePath("/me", "layout");
  return { ok: true, value: { to: r.value.to } };
}
