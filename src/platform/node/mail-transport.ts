// SMTP 발송 (다우오피스 등). 사내 서버에서 바로 보낸다. 설정은 관리자 화면 값 또는 서버 환경 값 (2026-10-26)
import nodemailer from "nodemailer";
import type { MailMessage } from "@/server/mail/types";

export type SmtpConfig = { host: string; port: number; user: string; pass: string };

const transport = (c: SmtpConfig) =>
  nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });

export async function smtpSend(c: SmtpConfig, msg: MailMessage & { from: string }) {
  await transport(c).sendMail({ from: msg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
}

/** 연결·로그인만 확인 (메일은 안 보냄) */
export async function smtpVerify(c: SmtpConfig) {
  await transport(c).verify();
}

/** 설정 문제(연결·로그인·주소)인지 — 이때만 다른 설정으로 다시 보내 본다 */
export function isSetupError(e: unknown) {
  const c = (e as { code?: string })?.code ?? "";
  return ["EAUTH", "ECONNECTION", "ETIMEDOUT", "EDNS", "ESOCKET", "ETLS"].includes(c);
}

/** 관리자에게 보여 줄 실패 이유 (비밀번호·받는 사람은 담지 않는다) */
export function smtpWhy(e: unknown, port: number): string {
  const c = (e as { code?: string })?.code ?? "";
  const m = String((e as { message?: string })?.message ?? "");
  if (c === "EAUTH") return "계정 또는 비밀번호가 틀렸거나, 이 계정에 외부 프로그램 발송(SMTP)이 허용되지 않았습니다. 메일 관리자 화면에서 SMTP 허용·앱 전용 비밀번호가 필요한지 확인하세요.";
  if (c === "EDNS" || /ENOTFOUND/.test(m)) return "메일 서버 주소를 찾지 못했습니다. 주소 철자를 확인하세요.";
  if (/closed unexpectedly/i.test(m)) return "서버에 연결은 됐지만 도중에 끊겼습니다. 계정·비밀번호와 포트(465/587)를 확인하세요.";
  if (["ETIMEDOUT", "ECONNECTION", "ESOCKET"].includes(c) || /ECONNREFUSED|timeout/i.test(m)) return `메일 서버에 연결하지 못했습니다. 포트(${port})가 맞는지(보통 465 또는 587), 서버 방화벽이 막는지 확인하세요.`;
  if (/certificate|TLS|SSL|wrong version/i.test(m)) return "보안 연결(TLS) 방식이 맞지 않습니다. 465가 안 되면 587로, 587이 안 되면 465로 해 보세요.";
  if (c === "EENVELOPE" || /sender|from/i.test(m)) return "보내는 주소가 계정과 달라 거부됐을 수 있습니다. 보내는 주소를 계정 주소와 같게 해 보세요.";
  return "메일을 보내지 못했습니다. 설정 값을 다시 확인해 주세요.";
}
