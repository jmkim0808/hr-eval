// 회사 서버(Node.js)용 SMTP 발송. Cloudflare 빌드에서는 platform/cloudflare/mail-transport.ts로 바뀐다.
import nodemailer from "nodemailer";
import { env } from "@/platform/env";
import type { MailTransport } from "@/server/mail/types";

export const smtpTransport: MailTransport = async (msg) => {
  const s = env.smtp;
  const t = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.port === 465, auth: { user: s.user, pass: s.pass } });
  await t.sendMail({ from: msg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
};
