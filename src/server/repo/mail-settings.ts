// 메일 발송 설정 (관리자 화면, 2026-10-26). 담당자가 바뀌어도 화면에서 보내는 계정을 바꿀 수 있다.
// 저장 전에 시험 메일을 보내 보고, 성공해야 저장한다 — 틀린 설정으로 로그인 인증번호가 막히지 않게.
// 화면에는 비밀번호를 돌려주지 않는다. 작업 기록에는 서버 주소·포트만 남긴다.
import { eq } from "drizzle-orm";
import { fail, ok, type Result } from "@/lib/result";
import { env } from "@/platform/env";
import { smtpSend, smtpVerify, smtpWhy, type SmtpConfig } from "@/platform/node/mail-transport";
import { getDb } from "@/server/db/client";
import { auditLogs, mailSettings } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";
import { seal, unseal } from "@/server/crypto/server-secret";

export type MailSender = { cfg: SmtpConfig; from: string; source: "admin" | "server" };

const fromHeader = (name: string, address: string) => `"${name}" <${address}>`;

/** 관리자 화면 설정 (없거나 풀 수 없으면 null) */
export async function adminSender(): Promise<MailSender | null> {
  const [r] = await getDb().select().from(mailSettings).where(eq(mailSettings.id, "main")).limit(1);
  if (!r) return null;
  try {
    return { cfg: { host: r.host, port: r.port, user: r.username, pass: unseal(r.password) }, from: fromHeader(r.fromName, r.fromAddress), source: "admin" };
  } catch {
    console.warn("[mail] 관리자 메일 설정을 풀 수 없습니다 (서버 비밀값이 바뀌었을 수 있음) — 서버 기본 설정을 씁니다");
    return null;
  }
}

/** 서버 기본 설정 (전산이 넣은 환경 값) */
export function serverSender(): MailSender | null {
  const s = env.smtp;
  return s ? { cfg: s, from: env.mailFrom, source: "server" } : null;
}

export type MailSettingsView = {
  saved: { host: string; port: number; username: string; fromName: string; fromAddress: string; updatedBy: string; updatedAt: string } | null;
  serverDefault: { host: string; port: number } | null;
  testMode: boolean;
};

export async function getMailSettingsView(actor: Actor): Promise<MailSettingsView> {
  assert(can.manageCycle(actor));
  const [r] = await getDb().select().from(mailSettings).where(eq(mailSettings.id, "main")).limit(1);
  const s = env.smtp;
  return {
    saved: r ? { host: r.host, port: r.port, username: r.username, fromName: r.fromName, fromAddress: r.fromAddress, updatedBy: r.updatedBy, updatedAt: r.updatedAt.toISOString() } : null,
    serverDefault: s ? { host: s.host, port: s.port } : null,
    testMode: env.mailMode === "log",
  };
}

export type MailSettingsInput = { host: string; port: number; username: string; password: string; fromName: string; fromAddress: string };

const HOST = /^[A-Za-z0-9.-]{1,253}$/;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function validateMailSettings(i: MailSettingsInput, hasSaved: boolean): string | null {
  if (!HOST.test(i.host)) return "메일 서버 주소를 확인해 주세요 (예: smtp.회사도메인).";
  if (!Number.isInteger(i.port) || i.port < 1 || i.port > 65535) return "포트는 숫자로 넣어 주세요 (보통 465 또는 587).";
  if (!i.username || i.username.length > 200) return "보내는 계정을 넣어 주세요.";
  if (!i.password && !hasSaved) return "비밀번호를 넣어 주세요.";
  if (i.password.length > 200) return "비밀번호가 너무 깁니다.";
  if (!i.fromName.trim() || i.fromName.length > 40 || /[<>"\r\n]/.test(i.fromName)) return "보내는 사람 이름을 확인해 주세요 (40자 이내, < > \" 제외).";
  if (!EMAIL.test(i.fromAddress)) return "보내는 메일 주소 형식이 아닙니다.";
  return null;
}

/** 시험 메일을 내 메일로 보내 보고, 성공하면 저장한다. 비밀번호 칸이 비면 저장된 비밀번호를 그대로 쓴다 */
export async function saveMailSettings(actor: Actor, i: MailSettingsInput): Promise<Result<{ tested: boolean }>> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const [cur] = await db.select().from(mailSettings).where(eq(mailSettings.id, "main")).limit(1);
  const bad = validateMailSettings(i, !!cur);
  if (bad) return fail("invalid", bad);
  let pass = i.password;
  if (!pass) {
    try {
      pass = unseal(cur!.password);
    } catch {
      return fail("invalid", "저장된 비밀번호를 읽을 수 없습니다. 비밀번호를 다시 넣어 주세요.");
    }
  }
  const cfg: SmtpConfig = { host: i.host, port: i.port, user: i.username, pass };
  const tested = env.mailMode === "smtp";
  if (tested) {
    try {
      await smtpVerify(cfg);
      await smtpSend(cfg, {
        from: fromHeader(i.fromName.trim(), i.fromAddress),
        to: actor.email,
        subject: "[인사평가] 메일 발송 설정 시험",
        text: "인사평가 시스템의 메일 발송 설정 시험입니다. 이 메일이 보이면 설정이 맞습니다. 답장하지 않아도 됩니다.",
        html: "<p>인사평가 시스템의 메일 발송 설정 시험입니다. 이 메일이 보이면 설정이 맞습니다. 답장하지 않아도 됩니다.</p>",
      });
    } catch (e) {
      return fail("smtp", `저장하지 않았습니다 — ${smtpWhy(e, i.port)}`);
    }
  }
  const row = { host: i.host, port: i.port, username: i.username, password: seal(pass), fromName: i.fromName.trim(), fromAddress: i.fromAddress, updatedBy: actor.email, updatedAt: new Date() };
  await db.insert(mailSettings).values({ id: "main", ...row }).onConflictDoUpdate({ target: mailSettings.id, set: row });
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "mail.settings.save", detail: { host: i.host, port: i.port, tested } });
  return ok({ tested });
}

/** 관리자 설정을 지우고 서버 기본 설정으로 돌아간다 (서버 기본 설정이 있을 때만 — 메일이 아예 안 나가는 일을 막는다) */
export async function clearMailSettings(actor: Actor): Promise<Result> {
  assert(can.manageCycle(actor));
  if (!env.smtp && env.mailMode === "smtp") return fail("no_default", "서버 기본 메일 설정이 없어 지울 수 없습니다. 지우면 메일이 나가지 않습니다.");
  const db = getDb();
  await db.delete(mailSettings).where(eq(mailSettings.id, "main"));
  await db.insert(auditLogs).values({ actorEmail: actor.email, action: "mail.settings.clear", detail: {} });
  return ok();
}
