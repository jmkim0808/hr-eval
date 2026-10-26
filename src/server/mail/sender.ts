// 메일은 여기로만 보낸다 (docs/tech/03-규칙.md 18~20). 본문에 점수·등급·업적 글을 넣지 않는다.
import { isSetupError, smtpSend } from "@/platform/node/mail-transport";
import { env } from "@/platform/env";
import { adminSender, serverSender } from "@/server/repo/mail-settings";
import type { MailMessage } from "./types";

/** 개발용 확인을 위해 log 모드에서 보낸 메일을 잠시 들고 있는다 (시험 모드 메일함·화면 확인용). 서버 메모리에만 */
const g = globalThis as unknown as { __hrMailLog?: (MailMessage & { at: number })[] };
export const sentInLogMode = (g.__hrMailLog ??= []);
/** 관리자 설정이 실패해 서버 기본 설정으로 보낸 마지막 시각 (설정 화면 경고용, 서버 메모리) */
const gf = globalThis as unknown as { __hrMailFallback?: { at: number | null } };
export const mailFallback = (gf.__hrMailFallback ??= { at: null });

export async function sendMail(msg: MailMessage): Promise<"sent" | "logged" | "blocked"> {
  const to = msg.to.toLowerCase();
  const allow = env.mailAllowlist;
  if (env.mailMode === "log") {
    sentInLogMode.push({ ...msg, at: Date.now() });
    if (sentInLogMode.length > 50) sentInLogMode.shift();
    // log 모드는 개발용(가짜 명단)에서만 쓴다. 받는 사람 주소는 남기지 않는다.
    console.info(`[mail:log] ${msg.subject}\n${msg.text}`);
    return "logged";
  }
  if (allow && !allow.includes(to)) return "blocked";
  // 관리자 화면 설정이 먼저, 없으면 서버 기본 설정. 관리자 설정이 연결·로그인에서 실패하면 서버 기본 설정으로 한 번 더 (2026-10-26)
  const admin = await adminSender();
  const server = serverSender();
  const first = admin ?? server;
  if (!first) throw new Error("메일 설정이 없습니다 (관리자 화면 또는 서버 환경 값)");
  try {
    await smtpSend(first.cfg, { ...msg, from: first.from });
  } catch (e) {
    if (!(admin && server && isSetupError(e))) throw e;
    console.warn("[mail] 관리자 메일 설정으로 보내지 못해 서버 기본 설정으로 보냅니다");
    mailFallback.at = Date.now();
    await smtpSend(server.cfg, { ...msg, from: server.from });
  }
  return "sent";
}
