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
  if (kind === "reminder") return reminderMail(to, payload);
  if (kind === "stage_notice") return stageNoticeMail(to, payload);
  if (kind === "admin_alert") return adminAlertMail(to, payload);
  if (kind === "result_notice") return resultNoticeMail(to, payload);
  throw new Error(`unknown mail kind ${kind}`);
}

/** 독촉 이메일: 할 일·기한·링크만 (점수 없음) */
export function reminderMail(to: string, p: Record<string, string>): MailMessage {
  const link = `${env.appUrl}/login?email=${encodeURIComponent(to)}`;
  const subject = `[파워넷 인사평가] ${p.task} 기한은 ${p.due}입니다`;
  const lines = [`${p.name} 님, ${p.year}년 정기평가의 ${p.task}이(가) 아직 제출되지 않았습니다.`, `${p.due}까지 아래 링크로 들어와 제출해 주세요.`];
  return {
    to,
    subject,
    text: `${lines.join("\n")}\n${link}\n\n㈜파워넷 인사평가 · 대외비`,
    html: wrap(`${p.task} 안내`, [...lines.map(esc), `<a href="${esc(link)}">${esc(link)}</a>`]),
  };
}

/** 단계 안내: 다음 단계 평가자에게 할 일·기간·링크만 (점수 없음) */
export function stageNoticeMail(to: string, p: Record<string, string>): MailMessage {
  const link = `${env.appUrl}/login?email=${encodeURIComponent(to)}`;
  const subject = `[파워넷 인사평가] ${p.task} 기간이 시작되었습니다 (${p.range})`;
  const lines = [`${p.name} 님, ${p.year}년 정기평가의 ${p.task} 기간이 시작되었습니다.`, `기간 ${p.range} 안에 ${p.who} ${p.count}명의 평가를 마쳐 주세요.`, "아래 링크로 들어와 이메일 인증을 하면 내 할 일이 열립니다."];
  return {
    to,
    subject,
    text: `${lines.join("\n")}\n${link}\n\n㈜파워넷 인사평가 · 대외비`,
    html: wrap(`${p.task} 안내`, [...lines.map(esc), `<a href="${esc(link)}">${esc(link)}</a>`]),
  };
}

/** 관리자 알림 (확정 취소 등). 점수·등급은 담지 않는다 */
export function adminAlertMail(to: string, p: Record<string, string>): MailMessage {
  const link = `${env.appUrl}/admin/final`;
  const subject = `[파워넷 인사평가] ${p.title}`;
  const lines = [`${p.year}년 정기평가: ${p.title}`, `처리한 사람: ${p.actor}`, ...(p.reason ? [`사유: ${p.reason}`] : [])];
  return { to, subject, text: `${lines.join("\n")}\n${link}\n\n㈜파워넷 인사평가 · 대외비`, html: wrap(p.title!, [...lines.map(esc), `<a href="${esc(link)}">${esc(link)}</a>`]) };
}

/** 평가결과 알림: "결과가 나왔습니다"와 링크만 (점수·등급 없음, ADR-0007) */
export function resultNoticeMail(to: string, p: Record<string, string>): MailMessage {
  const link = `${env.appUrl}/login?email=${encodeURIComponent(to)}`;
  const subject = `[파워넷 인사평가] ${p.year}년 정기평가 결과가 나왔습니다`;
  const lines = [`${p.name} 님, ${p.year}년 정기평가 결과가 나왔습니다.`, "아래 링크로 들어와 이메일 인증을 하면 내 평가결과를 볼 수 있습니다."];
  return { to, subject, text: `${lines.join("\n")}\n${link}\n\n㈜파워넷 인사평가 · 대외비`, html: wrap("평가결과 알림", [...lines.map(esc), `<a href="${esc(link)}">${esc(link)}</a>`]) };
}
