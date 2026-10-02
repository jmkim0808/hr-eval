"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { periodsSchema, type PeriodErrors, type Periods } from "@/domain/periods";
import { checkRoster, rawRowsSchema, type RosterCheck } from "@/domain/roster";
import { fail, ok, type Result } from "@/lib/result";
import { seoulYear } from "@/lib/time";
import { requireAdmin } from "@/server/authz/actor";
import { getCycleDetail, savePeriods, startInvites } from "@/server/repo/cycles";
import { batchProgress, drainOutbox, retryFailed, type BatchProgress } from "@/server/repo/outbox";
import { replaceRoster, updateReviewer } from "@/server/repo/roster";

const PERIOD_KEYS = ["selfStart", "selfEnd", "firstStart", "firstEnd", "secondStart", "secondEnd", "bonusCutoff"] as const;

export type RosterPreview = Pick<RosterCheck, "issues" | "counts">;

/** 미리보기: 브라우저가 읽은 줄을 서버가 같은 규칙으로 다시 검사 */
export async function previewRosterAction(rows: unknown): Promise<Result<RosterPreview>> {
  await requireAdmin();
  const parsed = rawRowsSchema.safeParse(rows);
  if (!parsed.success) return fail("invalid", "명단 형식이 템플릿과 다릅니다. 템플릿을 다시 내려받아 작성해 주세요.");
  const r = checkRoster(parsed.data, seoulYear());
  return ok({ issues: r.issues, counts: r.counts });
}

export async function applyRosterAction(rows: unknown): Promise<Result<RosterPreview>> {
  const actor = await requireAdmin();
  const parsed = rawRowsSchema.safeParse(rows);
  if (!parsed.success) return fail("invalid", "명단 형식이 템플릿과 다릅니다.");
  const year = seoulYear();
  const r = checkRoster(parsed.data, year);
  if (r.counts.needsCheck > 0) return fail("needs_check", `확인 필요 ${r.counts.needsCheck}명을 고쳐 다시 올려 주세요.`);
  const saved = await replaceRoster(actor, year, r.people);
  if (!saved.ok) return saved;
  revalidatePath("/admin/setup");
  revalidatePath("/admin");
  return ok({ issues: [], counts: r.counts });
}

const reviewerSchema = z.object({ personId: z.string().uuid(), slot: z.enum(["first", "second"]), reviewerId: z.string().uuid().nullable() });

export async function updateReviewerAction(input: unknown): Promise<Result> {
  const actor = await requireAdmin();
  const p = reviewerSchema.safeParse(input);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await updateReviewer(actor, p.data.personId, p.data.slot, p.data.reviewerId);
  if (r.ok) revalidatePath("/admin/setup");
  return r;
}

// ── 기간과 안내 이메일 (PRD 03) ──

export type PeriodsState = { ok?: boolean; message?: string; errors?: PeriodErrors; values?: Partial<Periods> };

export async function savePeriodsAction(_prev: PeriodsState, form: FormData): Promise<PeriodsState> {
  const actor = await requireAdmin();
  const values = Object.fromEntries(PERIOD_KEYS.map((k) => [k, String(form.get(k) ?? "")])) as Periods;
  const parsed = periodsSchema.safeParse(values);
  if (!parsed.success) {
    const errors: PeriodErrors = {};
    for (const i of parsed.error.issues) errors[i.path[0] as keyof Periods] = "날짜를 골라 주세요";
    return { message: "비어 있는 날짜가 있습니다.", errors, values };
  }
  const r = await savePeriods(actor, seoulYear(), parsed.data);
  if (!r.ok) return { message: r.message, errors: "errors" in r ? r.errors : undefined, values };
  revalidatePath("/admin/setup");
  revalidatePath("/admin");
  return { ok: true, message: "기간을 저장했습니다.", values };
}

/** 메일 목록을 바로 조금 비운다 (나머지는 1분마다 예약 실행이 보낸다) */
function kickDrain() {
  after(async () => {
    try {
      await drainOutbox();
    } catch {
      // 실패해도 예약 실행이 다시 보낸다
    }
  });
}

export async function sendInvitesAction(version: number): Promise<Result<{ batchId: string; count: number }>> {
  const actor = await requireAdmin();
  const cycle = await getCycleDetail(actor, seoulYear());
  if (!cycle) return fail("no_roster", "직원 명단을 먼저 올려 주세요.");
  const r = await startInvites(actor, cycle.id, version);
  if (r.ok) {
    kickDrain();
    revalidatePath("/admin/setup");
    revalidatePath("/admin");
  }
  return r;
}

export async function inviteProgressAction(batchId: string): Promise<Result<BatchProgress>> {
  const actor = await requireAdmin();
  if (!z.string().uuid().safeParse(batchId).success) return fail("invalid", "잘못된 요청입니다.");
  let p = await batchProgress(actor, batchId);
  if (p.pending > 0) {
    // 보고 있는 동안에는 이 요청이 직접 10통씩 보내 숫자가 바로 오른다 (안 보면 1분마다 예약 실행이 보낸다)
    await drainOutbox().catch(() => 0);
    p = await batchProgress(actor, batchId);
  }
  return ok(p);
}

export async function retryBatchAction(batchId: string): Promise<Result> {
  const actor = await requireAdmin();
  if (!z.string().uuid().safeParse(batchId).success) return fail("invalid", "잘못된 요청입니다.");
  await retryFailed(actor, batchId);
  kickDrain();
  return ok();
}
