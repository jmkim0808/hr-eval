// 메일은 여기로만 보낸다 (docs/tech/03-규칙.md 18~20). 본문에 점수·등급·업적 글을 넣지 않는다.
import { smtpTransport } from "@platform/mail-transport";
import { env } from "@/platform/env";
import type { MailMessage } from "./types";

/** 개발용 확인을 위해 log 모드에서 보낸 메일을 잠시 들고 있는다 (테스트·화면 확인용). */
export const sentInLogMode: MailMessage[] = [];

export async function sendMail(msg: MailMessage): Promise<"sent" | "logged" | "blocked"> {
  const to = msg.to.toLowerCase();
  const allow = env.mailAllowlist;
  if (env.mailMode === "log") {
    sentInLogMode.push(msg);
    if (sentInLogMode.length > 50) sentInLogMode.shift();
    // log 모드는 개발용(가짜 명단)에서만 쓴다. 받는 사람 주소는 남기지 않는다.
    console.info(`[mail:log] ${msg.subject}\n${msg.text}`);
    return "logged";
  }
  if (allow && !allow.includes(to)) return "blocked";
  await smtpTransport({ ...msg, from: env.mailFrom });
  return "sent";
}
