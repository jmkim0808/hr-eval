"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type Result } from "@/lib/result";
import { requireAdmin } from "@/server/authz/actor";
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
