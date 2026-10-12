// SMTP 발송 (다우오피스). 사내 서버에서 바로 보낸다.
import nodemailer from "nodemailer";
import { env } from "@/platform/env";
import type { MailTransport } from "@/server/mail/types";

export const smtpTransport: MailTransport = async (msg) => {
  const s = env.smtp;
  const t = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.port === 465, auth: { user: s.user, pass: s.pass } });
  await t.sendMail({ from: msg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
};
