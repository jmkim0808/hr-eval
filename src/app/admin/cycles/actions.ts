"use server";

import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/result";
import { requireAdmin } from "@/server/authz/actor";
import { createCycle } from "@/server/repo/cycles";

export async function createCycleAction(year: unknown): Promise<Result<{ id: string }>> {
  const actor = await requireAdmin();
  const r = await createCycle(actor, Number(year));
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}
