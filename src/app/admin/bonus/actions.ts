"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BONUS_ITEMS, checkBonusRows, rawBonusRowsSchema, type BonusCheck, type BonusValues } from "@/domain/bonus";
import { fail, ok, type Result } from "@/lib/result";
import { requireAdmin } from "@/server/authz/actor";
import { applyBonus, listBonus } from "@/server/repo/bonus";
import { getCurrentCycle } from "@/server/repo/cycles";

async function ctx() {
  const actor = await requireAdmin();
  const cycle = await getCurrentCycle(actor);
  return { actor, cycle };
}

/** 미리보기: 브라우저가 읽은 줄을 서버가 같은 규칙으로 다시 검사 */
export async function previewBonusAction(rows: unknown): Promise<Result<BonusCheck>> {
  const { actor, cycle } = await ctx();
  if (!cycle) return fail("no_cycle", "진행 중인 평가가 없습니다.");
  const p = rawBonusRowsSchema.safeParse(rows);
  if (!p.success) return fail("invalid", "가점 템플릿 형식이 다릅니다. 템플릿을 다시 내려받아 작성해 주세요.");
  return ok(checkBonusRows(p.data, await listBonus(actor, cycle.id)));
}

export async function applyBonusAction(rows: unknown): Promise<Result<{ count: number }>> {
  const { actor, cycle } = await ctx();
  if (!cycle) return fail("no_cycle", "진행 중인 평가가 없습니다.");
  const p = rawBonusRowsSchema.safeParse(rows);
  if (!p.success) return fail("invalid", "가점 템플릿 형식이 다릅니다.");
  const check = checkBonusRows(p.data, await listBonus(actor, cycle.id));
  const r = await applyBonus(actor, cycle.id, check.matched);
  if (r.ok) {
    revalidatePath("/admin/bonus");
    revalidatePath("/admin");
  }
  return r;
}

const one = z.object({ personId: z.string().uuid(), values: z.object(Object.fromEntries(BONUS_ITEMS.map((i) => [i.code, z.number().finite()]))) });

export async function setBonusAction(raw: unknown): Promise<Result> {
  const { actor, cycle } = await ctx();
  if (!cycle) return fail("no_cycle", "진행 중인 평가가 없습니다.");
  const p = one.safeParse(raw);
  if (!p.success) return fail("invalid", "숫자로 넣어 주세요.");
  const r = await applyBonus(actor, cycle.id, [{ personId: p.data.personId, values: p.data.values as BonusValues }]);
  if (!r.ok) return r;
  revalidatePath("/admin/bonus");
  revalidatePath("/admin");
  return ok();
}
