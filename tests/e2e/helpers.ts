// 화면 확인용 도우미. 로컬 DB와 `next start` 로그(MAIL_MODE=log)를 사용한다.
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { chromium, type Page } from "playwright-core";

export const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
export const LOG = process.env.E2E_SERVER_LOG ?? "/tmp/hr-eval-server.log";
export const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

export async function browser() {
  return chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
}

export function logSize() {
  try {
    return readFileSync(LOG, "utf8").length;
  } catch {
    return 0;
  }
}

/** from 이후 로그에서 마지막 인증번호 */
export async function codeSince(from: number): Promise<string | null> {
  for (let i = 0; i < 20; i++) {
    const text = readFileSync(LOG, "utf8").slice(from);
    const m = [...text.matchAll(/인증번호: (\d{6})/g)].pop();
    if (m) return m[1]!;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

export async function login(page: Page, email: string) {
  await sql`delete from auth_codes where email = ${email}`;
  await page.goto(`${BASE}/login`);
  const mark = logSize();
  await page.fill('input[name="email"]', email);
  await page.click('button:has-text("인증번호 받기")');
  await page.waitForSelector('input[name="code"]');
  const code = await codeSince(mark);
  if (!code) throw new Error("인증번호 메일이 기록되지 않았습니다");
  await page.fill('input[name="code"]', code);
  await page.click('button:has-text("인증하기")');
  await page.waitForLoadState("networkidle");
}

const results: { ok: boolean; text: string }[] = [];
export async function check(text: string, fn: () => Promise<boolean>) {
  let ok = false;
  try {
    ok = await fn();
  } catch (e) {
    console.error(e);
  }
  results.push({ ok, text });
  console.log(`${ok ? "✔" : "✘"} ${text}`);
}
export function summary() {
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} 통과`);
  return bad;
}
