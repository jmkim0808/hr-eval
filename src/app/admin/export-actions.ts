"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { fail, type Result } from "@/lib/result";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle } from "@/server/repo/cycles";
import { exportBackup, exportFinal, type Sheet } from "@/server/repo/export";
import { drainOutbox } from "@/server/repo/outbox";
import { closeCycle, sendResultNotices } from "@/server/repo/results";

export async function exportFinalAction(): Promise<Result<{ year: number; sheet: Sheet }>> {
  const actor = await requireAdmin();
  const c = await getCurrentCycle(actor);
  if (!c) return fail("no_cycle", "진행 중인 평가가 없습니다.");
  return exportFinal(actor, c.id);
}

export async function exportBackupAction(): Promise<Result<{ year: number; sheets: Sheet[] }>> {
  const actor = await requireAdmin();
  const c = await getCurrentCycle(actor);
  if (!c) return fail("no_cycle", "진행 중인 평가가 없습니다.");
  return exportBackup(actor, c.id);
}

export async function sendResultsAction(version: number): Promise<Result<{ batchId: string; count: number }>> {
  const actor = await requireAdmin();
  const c = await getCurrentCycle(actor);
  if (!c) return fail("no_cycle", "진행 중인 평가가 없습니다.");
  const r = await sendResultNotices(actor, c.id, version);
  if (r.ok) {
    after(() => drainOutbox().catch(() => 0));
    revalidatePath("/admin", "layout");
  }
  return r;
}

export async function closeCycleAction(version: number): Promise<Result> {
  const actor = await requireAdmin();
  const c = await getCurrentCycle(actor);
  if (!c) return fail("no_cycle", "진행 중인 평가가 없습니다.");
  const r = await closeCycle(actor, c.id, version);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
