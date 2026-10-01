import { env } from "@/platform/env";
import type { MailMessage } from "./types";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function wrap(title: string, lines: string[]): string {
  return `<!doctype html><html lang="ko"><body style="font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#1B1F2A;line-height:1.6">
<p style="font-weight:700;font-size:16px">${esc(title)}</p>${lines.map((l) => `<p>${l}</p>`).join("")}
<p style="color:#5A6170;font-size:13px">㈜파워넷 인사평가 · 대외비 메일입니다. 다른 사람에게 전달하지 마세요.</p></body></html>`;
}

export function otpMail(to: string, code: string): MailMessage {
  const subject = `[파워넷 인사평가] 인증번호 ${code}`;
  const text = `인증번호: ${code}\n10분 안에 입력해 주세요. 요청하지 않았다면 이 메일을 무시하세요.\n\n㈜파워넷 인사평가 · 대외비`;
  const html = wrap("이메일 인증번호", [
    `<span style="font-size:22px;font-weight:700;letter-spacing:4px">${esc(code)}</span>`,
    "10분 안에 입력해 주세요. 요청하지 않았다면 이 메일을 무시하세요.",
    `<a href="${esc(env.appUrl)}/login">${esc(env.appUrl)}/login</a>`,
  ]);
  return { to, subject, text, html };
}
