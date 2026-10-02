"use server";

import { fail, type Result } from "@/lib/result";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle } from "@/server/repo/cycles";
import { exportBackup, exportFinal, type Sheet } from "@/server/repo/export";

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
