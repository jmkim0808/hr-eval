// 화면 확인용 도우미. 로컬 DB와 `next start` 로그(MAIL_MODE=log)를 사용한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { chromium, type Page } from "playwright-core";
import { signPortalToken } from "../../src/server/auth/portal-token";
import { dec, enc, newDataKey, openWith, unwrapKey, wrapKey } from "../../src/server/crypto/vault";

export const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3000/hr-eval";
export const LOG = process.env.E2E_SERVER_LOG ?? "/tmp/hr-eval-server.log";
export const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

export async function browser() {
  return chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
}

/**
 * 시험 데이터도 서버와 같은 열쇠로 암호화해 넣는다 (ADR-0021).
 * 개발용 비밀 문구(HR_DEV_PASSPHRASE)로 열쇠 칸을 열고, 칸이 없으면 서버와 같은 방법으로 만든다.
 */
async function openDevVault() {
  const pass = process.env.HR_DEV_PASSPHRASE;
  if (!pass) throw new Error("HR_DEV_PASSPHRASE가 없습니다 (.env.local)");
  for (const s of await sql`select salt, iterations, wrapped from key_slots order by created_at`) {
    const dek = unwrapKey({ salt: s.salt, iterations: s.iterations, wrapped: s.wrapped }, pass);
    if (dek) return openWith(dek);
  }
  const dek = newDataKey();
  const w = wrapKey(dek, pass);
  await sql`insert into key_slots (label, salt, iterations, wrapped, created_by) values ('개발용', ${w.salt}, ${w.iterations}, ${w.wrapped}, 'system')`;
  openWith(dek);
}
await openDevVault();
/** 점수·글·가점을 암호문으로 */
export const E = (v: string | number) => enc(String(v));
/** DB의 암호문을 풀어 본다 (시험 확인용) */
export const D = (v: string) => dec(v);

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

/** 그 이메일의 사번 (없으면 시험용 사번을 붙인다 — 포털 로그인은 사번으로 사람을 찾는다) */
export async function employeeNoOf(email: string): Promise<string> {
  const rows = await sql`select employee_no from app_users where email = ${email} and employee_no is not null union all select employee_no from cycle_people where email = ${email} and employee_no is not null limit 1`;
  if (rows[0]?.employee_no) return rows[0].employee_no as string;
  const no = `T${createHash("md5").update(email).digest("hex").slice(0, 8).toUpperCase()}`;
  await sql`update app_users set employee_no = ${no} where email = ${email}`;
  await sql`update cycle_people set employee_no = ${no} where email = ${email}`;
  return no;
}

/** 포털 로그인 토큰 (포털이 브라우저 저장소에 넣는 것과 같은 형식) */
export function portalTokenFor(sub: string, extra: Record<string, unknown> = {}) {
  return signPortalToken({ sub, name: "시험", exp: Math.floor(Date.now() / 1000) + 8 * 3600, ...extra }, process.env.JWT_SECRET_KEY!);
}

/** 포털에 로그인한 상태로 만든다 (이 창과 이 창에서 여는 새 창 모두) */
export async function setPortalToken(page: Page, token: string | null) {
  await page.context().addInitScript((t) => {
    if (t === null) localStorage.removeItem("ax_access_token");
    else localStorage.setItem("ax_access_token", t);
  }, token);
}

/** 1차 포털 로그인 + 2차 메일 인증번호 */
export async function login(page: Page, email: string) {
  await sql`delete from auth_codes where email = ${email}`;
  await setPortalToken(page, portalTokenFor(await employeeNoOf(email)));
  await page.goto(`${BASE}/login`);
  const mark = logSize();
  await page.click('button:has-text("인증번호 받기")');
  await page.waitForSelector('input[name="code"]');
  const code = await codeSince(mark);
  if (!code) throw new Error("인증번호 메일이 기록되지 않았습니다");
  await page.fill('input[name="code"]', code);
  await page.click('button:has-text("인증하기")');
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
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
