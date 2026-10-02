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

/** 안내 이메일: 기간과 링크만 (점수 없음) */
export function inviteMail(to: string, p: Record<string, string>): MailMessage {
  const link = `${env.appUrl}/login?email=${encodeURIComponent(to)}`;
  const subject = `[파워넷 인사평가] ${p.year}년 정기평가가 시작되었습니다`;
  const lines = [
    `${p.name} 님, ${p.year}년 정기평가가 시작되었습니다.`,
    `개인작성 기간 ${p.selfRange} 안에 평가지를 작성해 제출해 주세요. 기간 안에서는 제출한 뒤에도 고칠 수 있습니다.`,
    `가점 인정 기준일은 ${p.bonusCutoff}입니다.`,
    `아래 링크로 들어와 이메일 인증을 하면 내 할 일이 열립니다.`,
  ];
  return {
    to,
    subject,
    text: `${lines.join("\n")}\n${link}\n\n㈜파워넷 인사평가 · 대외비`,
    html: wrap(`${p.year}년 정기평가 안내`, [...lines.map(esc), `<a href="${esc(link)}">${esc(link)}</a>`]),
  };
}

export function renderOutbox(kind: string, to: string, payload: Record<string, string>): MailMessage {
  if (kind === "invite") return inviteMail(to, payload);
  throw new Error(`unknown mail kind ${kind}`);
}
