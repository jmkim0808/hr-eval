// 보안 열쇠 (ADR-0021). 처음 설정·열기·잠그기·관리자 열쇠 칸 추가/삭제.
// 비밀 문구는 어디에도 저장하지 않고, 작업 기록에도 남기지 않는다.
import { and, asc, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { newRecoveryCode, normalizeRecoveryCode } from "@/domain/recovery";
import { fail, ok, type Result } from "@/lib/result";
import { env } from "@/platform/env";
import { getDb } from "@/server/db/client";
import { appUsers, auditLogs, emailOutbox, keySlots, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";
import { close, isOpen, newDataKey, openWith, PASSPHRASE_MIN, unwrapKey, wrapCurrent, wrapKey } from "@/server/crypto/vault";

export type VaultState = "unset" | "locked" | "open";

export async function vaultState(): Promise<VaultState> {
  if (isOpen()) return "open";
  const [r] = await getDb().select({ n: count() }).from(keySlots);
  return (r?.n ?? 0) === 0 ? "unset" : "locked";
}

const tooShort = (p: string) => p.normalize("NFC").length < PASSPHRASE_MIN;

/** 처음 한 번: 데이터 열쇠를 만들고 내 비밀 문구로 잠가 둔다 */
export async function setupVault(actor: Actor, passphrase: string): Promise<Result> {
  assert(can.manageCycle(actor));
  if (tooShort(passphrase)) return fail("short", `비밀 문구는 ${PASSPHRASE_MIN}자 이상이어야 합니다.`);
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`lock table key_slots in exclusive mode`);
    const [r] = await tx.select({ n: count() }).from(keySlots);
    if ((r?.n ?? 0) > 0) return fail("exists", "이미 설정되어 있습니다. 화면을 새로고침해 주세요.");
    const dek = newDataKey();
    await tx.insert(keySlots).values({ label: actor.name, createdBy: actor.email, ...wrapKey(dek, passphrase) });
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "vault.setup", detail: {} });
    openWith(dek);
    return ok();
  });
}

// 비밀 문구 맞히기 막기: 연속 5번 틀리면 15분 쉼 (서버 전체 기준)
const g = globalThis as unknown as { __hrVaultFail?: { n: number; until: number } };
const FAIL_MAX = 5;
const FAIL_WAIT_MS = 15 * 60_000;

/** 맞으면 연 열쇠 칸 종류. 비밀 문구 칸을 먼저, 복구 코드 형식이면 확인된 복구 코드 칸도 본다 */
async function tryUnlock(passphrase: string): Promise<"passphrase" | "recovery" | null> {
  const db = getDb();
  const slots = await db.select().from(keySlots).where(eq(keySlots.kind, "passphrase")).orderBy(asc(keySlots.createdAt));
  for (const s of slots) {
    const dek = unwrapKey(s, passphrase);
    if (dek) {
      openWith(dek);
      return "passphrase";
    }
  }
  const code = normalizeRecoveryCode(passphrase);
  if (!code) return null;
  const rec = await db.select().from(keySlots).where(and(eq(keySlots.kind, "recovery"), isNotNull(keySlots.confirmedAt)));
  for (const s of rec) {
    const dek = unwrapKey(s, code);
    if (dek) {
      openWith(dek);
      await db.update(keySlots).set({ usedAt: new Date() }).where(eq(keySlots.id, s.id));
      return "recovery";
    }
  }
  return null;
}

export async function unlockVault(actor: Actor, passphrase: string): Promise<Result> {
  assert(can.manageCycle(actor));
  if (isOpen()) return ok();
  const f = (g.__hrVaultFail ??= { n: 0, until: 0 });
  if (f.until > Date.now()) return fail("wait", "여러 번 틀려 15분 동안 열 수 없습니다. 잠시 뒤 다시 해 주세요.");
  const db = getDb();
  const how = await tryUnlock(passphrase);
  if (how) {
    f.n = 0;
    await db.insert(auditLogs).values({ actorEmail: actor.email, action: how === "recovery" ? "vault.unlock_recovery" : "vault.unlock", detail: {} });
    return ok();
  }
  f.n += 1;
  if (f.n >= FAIL_MAX) {
    f.n = 0;
    f.until = Date.now() + FAIL_WAIT_MS;
  }
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "vault.unlock_fail", detail: {} });
  return fail("wrong", "비밀 문구(또는 복구 코드)가 맞지 않습니다.");
}

export async function lockVault(actor: Actor): Promise<Result> {
  assert(can.manageCycle(actor));
  close();
  await getDb().insert(auditLogs).values({ actorEmail: actor.email, action: "vault.lock", detail: {} });
  return ok();
}

export async function listSlots(actor: Actor) {
  assert(can.manageCycle(actor));
  return getDb()
    .select({ id: keySlots.id, label: keySlots.label, kind: keySlots.kind, confirmedAt: keySlots.confirmedAt, usedAt: keySlots.usedAt, createdBy: keySlots.createdBy, createdAt: keySlots.createdAt })
    .from(keySlots)
    .where(sql`not (${keySlots.kind} = 'recovery' and ${keySlots.confirmedAt} is null)`)
    .orderBy(asc(keySlots.createdAt));
}

/** 다른 관리자(또는 예비용) 열쇠 칸 추가. 열려 있을 때만 — 지금 열쇠를 새 비밀 문구로 한 번 더 잠근다 */
export async function addSlot(actor: Actor, label: string, passphrase: string): Promise<Result> {
  assert(can.manageCycle(actor));
  if (!isOpen()) return fail("locked", "먼저 보안 열쇠를 열어 주세요.");
  const name = label.trim();
  if (!name || name.length > 40) return fail("label", "이름을 1~40자로 넣어 주세요.");
  if (tooShort(passphrase)) return fail("short", `비밀 문구는 ${PASSPHRASE_MIN}자 이상이어야 합니다.`);
  const db = getDb();
  await db.insert(keySlots).values({ label: name, createdBy: actor.email, ...wrapCurrent(passphrase) });
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "vault.slot_add", detail: {} });
  return ok();
}

/** 열쇠 칸 삭제. 마지막 하나는 지울 수 없다 (지우면 아무도 열 수 없다) */
export async function removeSlot(actor: Actor, id: string): Promise<Result> {
  assert(can.manageCycle(actor));
  if (!isOpen()) return fail("locked", "먼저 보안 열쇠를 열어 주세요.");
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`lock table key_slots in exclusive mode`);
    const [target] = await tx.select({ kind: keySlots.kind }).from(keySlots).where(eq(keySlots.id, id)).limit(1);
    if (!target) return fail("not_found", "이미 지워진 열쇠 칸입니다.");
    if (target.kind === "recovery") return fail("recovery", "복구 코드는 지우지 않고 [복구 코드 다시 만들기]로 바꿉니다.");
    const [r] = await tx.select({ n: count() }).from(keySlots).where(eq(keySlots.kind, "passphrase"));
    if ((r?.n ?? 0) <= 1) return fail("last", "마지막 비밀 문구 열쇠 칸은 지울 수 없습니다.");
    const del = await tx.delete(keySlots).where(eq(keySlots.id, id)).returning({ id: keySlots.id });
    if (!del.length) return fail("not_found", "이미 지워진 열쇠 칸입니다.");
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "vault.slot_remove", detail: {} });
    return ok();
  });
}

// ── 복구 코드 (2026-10-26): 비밀 문구를 잊거나 담당자가 바뀌어도 열 수 있게. 인쇄해 금고에 보관 ──

export type RecoveryStatus = { ready: boolean; confirmedAt: string | null; usedAt: string | null };

/** 확인된(다시 입력해 맞힌) 복구 코드가 있고, 아직 쓰지 않았으면 ready */
export async function recoveryStatus(): Promise<RecoveryStatus> {
  const [r] = await getDb().select().from(keySlots).where(and(eq(keySlots.kind, "recovery"), isNotNull(keySlots.confirmedAt))).orderBy(desc(keySlots.confirmedAt)).limit(1);
  return { ready: !!r && !r.usedAt, confirmedAt: r?.confirmedAt?.toISOString() ?? null, usedAt: r?.usedAt?.toISOString() ?? null };
}

/** 개발·시험 서버(자동 열기)에서는 복구 코드 없이도 평가를 시작할 수 있다 */
export const recoveryRequired = () => !(env.mailMode === "log" && !!process.env.HR_DEV_PASSPHRASE);

/** 새 복구 코드를 만들어 한 번만 돌려준다. 확인 전까지는 쓸 수 없고, 확인하면 예전 복구 코드는 지워진다 */
export async function createRecoveryCode(actor: Actor): Promise<Result<{ code: string }>> {
  assert(can.manageCycle(actor));
  if (!isOpen()) return fail("locked", "먼저 보안 열쇠를 열어 주세요.");
  const code = newRecoveryCode();
  const db = getDb();
  await db.delete(keySlots).where(and(eq(keySlots.kind, "recovery"), isNull(keySlots.confirmedAt)));
  await db.insert(keySlots).values({ label: "복구 코드", kind: "recovery", createdBy: actor.email, ...wrapCurrent(code) });
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "vault.recovery_create", detail: {} });
  return ok({ code });
}

/** 옮겨 적은 복구 코드를 다시 넣어 맞으면 확정 (적어 둔 것이 정확한지 확인) */
export async function confirmRecoveryCode(actor: Actor, input: string): Promise<Result> {
  assert(can.manageCycle(actor));
  const code = normalizeRecoveryCode(input);
  if (!code) return fail("format", "복구 코드는 5글자씩 6묶음(30글자)입니다. 다시 확인해 주세요.");
  const db = getDb();
  const [pending] = await db.select().from(keySlots).where(and(eq(keySlots.kind, "recovery"), isNull(keySlots.confirmedAt))).orderBy(desc(keySlots.createdAt)).limit(1);
  if (!pending) return fail("none", "확인할 복구 코드가 없습니다. [복구 코드 만들기]부터 해 주세요.");
  if (!unwrapKey(pending, code)) return fail("wrong", "적어 둔 복구 코드와 다릅니다. 인쇄본을 다시 확인해 주세요.");
  await db.transaction(async (tx) => {
    await tx.delete(keySlots).where(and(eq(keySlots.kind, "recovery"), isNotNull(keySlots.confirmedAt)));
    await tx.update(keySlots).set({ confirmedAt: new Date() }).where(eq(keySlots.id, pending.id));
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "vault.recovery_confirm", detail: {} });
  });
  return ok();
}

/**
 * 개발·시험용 자동 열기: 메일을 실제로 보내지 않는 모드(MAIL_MODE=log)에서만 HR_DEV_PASSPHRASE로 연다.
 * 실제 운영(MAIL_MODE=smtp)에서는 이 값이 있어도 쓰지 않는다 (ADR-0018과 같은 원칙).
 */
const dev = globalThis as unknown as { __hrDevTried?: boolean };
export async function devAutoUnlock() {
  // 서버가 켜진 뒤 한 번만 시도한다 — 관리자가 [지금 잠그기]를 누른 뒤에는 저절로 열리지 않는다
  if (isOpen() || dev.__hrDevTried) return;
  dev.__hrDevTried = true;
  const pass = process.env.HR_DEV_PASSPHRASE;
  if (!pass || env.mailMode !== "log") return;
  if (await tryUnlock(pass)) return;
  const [r] = await getDb().select({ n: count() }).from(keySlots);
  if ((r?.n ?? 0) === 0) {
    const dek = newDataKey();
    await getDb().insert(keySlots).values({ label: "개발용", createdBy: "system", ...wrapKey(dek, pass) });
    openWith(dek);
  }
}

/** 서버가 다시 켜졌는데 평가가 진행 중이고 잠겨 있으면 관리자에게 알린다 (서버 시작 때 한 번) */
export async function alertIfLockedOnStart() {
  await devAutoUnlock();
  if ((await vaultState()) !== "locked") return;
  const db = getDb();
  const [c] = await db.select().from(reviewCycles).orderBy(desc(reviewCycles.year)).limit(1);
  if (!c || c.status === "closed") return;
  const admins = await db.select({ email: appUsers.email }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)));
  if (!admins.length) return;
  const batchId = crypto.randomUUID();
  await db.insert(emailOutbox).values(
    admins.map((a) => ({
      batchId,
      createdBy: "system",
      cycleId: c.id,
      kind: "admin_alert" as const,
      toEmail: a.email,
      payload: { year: String(c.year), title: "서버가 다시 켜져 보안 열쇠를 열어야 합니다", actor: "시스템", reason: "열기 전까지 직원들이 평가 화면을 쓸 수 없습니다", path: "/admin/vault" },
    })),
  );
}
