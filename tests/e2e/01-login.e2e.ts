// PRD 01 확인 문장을 화면에서 점검한다 — 1차 포털 로그인(토큰) + 2차 메일 인증번호 (ADR-0020).
import { BASE, browser, check, codeSince, employeeNoOf, login, logSize, portalTokenFor, setPortalToken, sql, summary } from "./helpers";

const ADMIN = "part@powernet.test";
const adminNo = await employeeNoOf(ADMIN);
const b = await browser();
const fresh = async () => (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

await sql`delete from sessions`;
await sql`delete from auth_codes`;

// ── 1차: 포털 로그인 토큰 확인 ──
async function portalError(token: string | null) {
  const p = await fresh();
  await setPortalToken(p, token);
  await p.goto(`${BASE}/login`);
  await p.waitForSelector('[data-testid="portal-error"]', { timeout: 8000 }).catch(() => null);
  const t = (await p.locator('[data-testid="portal-error"]').innerText().catch(() => "")) ?? "";
  const noButton = (await p.locator('button:has-text("인증번호 받기")').count()) === 0;
  await p.context().close();
  return { t, noButton };
}
await check("포털 로그인 없이 열면 \"포털에 로그인한 뒤 다시 열어 주세요\"가 보이고 인증번호를 받을 수 없다", async () => {
  const r = await portalError(null);
  return r.t.includes("포털에 로그인한 뒤") && r.noButton;
});
await check("포털 로그인이 만료됐으면 \"만료되었습니다\"가 보인다", async () => {
  const r = await portalError(portalTokenFor(adminNo, { exp: Math.floor(Date.now() / 1000) - 600 }));
  return r.t.includes("만료되었습니다") && r.noButton;
});
await check("포털에서 비밀번호를 바꿔야 하는 사람은 \"비밀번호를 바꾼 뒤\"가 보인다", async () => {
  const r = await portalError(portalTokenFor(adminNo, { must_change_password: true }));
  return r.t.includes("비밀번호를 바꾼 뒤") && r.noButton;
});
await check("서명이 틀린(위조한) 토큰은 받아 주지 않는다", async () => {
  const good = portalTokenFor(adminNo);
  const [h, , s] = good.split(".");
  const forged = `${h}.${Buffer.from(JSON.stringify({ sub: adminNo, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.${s!.slice(0, -2)}xx`;
  const r = await portalError(forged);
  return r.t.includes("확인할 수 없습니다") && r.noButton;
});
await check("인사평가에 등록되지 않은 사번이면 \"등록되지 않은 사번\"이 보이고 메일은 보내지 않는다", async () => {
  const mark = logSize();
  const r = await portalError(portalTokenFor("NOBODY-999"));
  return r.t.includes("등록되지 않은 사번") && r.noButton && (await codeSince(mark)) === null;
});

// ── 2차: 메일 인증번호 ──
const page = await fresh();
await setPortalToken(page, portalTokenFor(adminNo));
await page.goto(`${BASE}/`);
await page.waitForURL(/\/login/);
await page.waitForSelector('button:has-text("인증번호 받기")');
await check("포털에서 열면 내 이름과 가린 회사 메일(p***@…)이 보이고 이메일을 직접 넣는 칸은 없다", async () =>
  (await page.getByText("p***@powernet.test").count()) >= 1 && (await page.locator('input[name="email"]').count()) === 0,
);
let mark = logSize();
await page.click('button:has-text("인증번호 받기")');
await page.waitForSelector('input[name="code"]');
const code = await codeSince(mark);
await check("[인증번호 받기]를 누르면 등록된 회사 메일로 인증번호가 온다", async () => !!code);
await check("인증번호 메일에는 링크가 없다 (가짜 메일 링크 클릭 유도 방지)", async () => {
  const one = (await import("node:fs")).readFileSync(process.env.E2E_SERVER_LOG ?? "/tmp/hr-eval-server.log", "utf8").slice(mark).split("[mail:log]").find((m) => m.includes("인증번호:"))!;
  return !/https?:\/\//.test(one);
});
await check("[다시 보내기]는 60초가 지나야 눌린다", async () => {
  const btn = page.locator('button:has-text("다시 보내기")');
  return (await btn.isDisabled()) && /초 뒤/.test((await btn.textContent()) ?? "");
});
await page.fill('input[name="code"]', code === "000000" ? "111111" : "000000");
await page.click('button:has-text("인증하기")');
await check("틀린 번호를 넣으면 \"번호가 맞지 않습니다\"가 보인다", async () => {
  await page.waitForSelector("text=번호가 맞지 않습니다");
  return true;
});
await page.fill('input[name="code"]', code!);
await page.click('button:has-text("인증하기")');
await page.waitForURL((u) => !u.pathname.endsWith("/login"));
await page.waitForLoadState("networkidle");
await check("인증번호를 넣으면 관리자는 진행 현황(/admin)이 열린다", async () => page.url().startsWith(`${BASE}/admin`));
await check("오른쪽 위에 \"대외비 · 열람자 (내 이름)\"이 보인다", async () => (await page.getByText("대외비 · 열람자 김파트장").count()) === 1);
await check("로그인 쿠키는 httpOnly이고 이 앱 경로(/hr-eval)에만 간다 — 포털의 다른 앱에는 가지 않는다", async () => {
  const c = (await page.context().cookies()).find((x) => x.name === "hr_session");
  return !!c && c.httpOnly && c.path === "/hr-eval";
});

// 같은 PC에서 포털 사용자가 바뀌면
await setPortalToken(page, portalTokenFor("SOMEONE-ELSE")); // 나중에 넣은 것이 먼저 것을 덮는다
await page.goto(`${BASE}/admin/settings`);
await page.waitForURL(/\/login/, { timeout: 8000 }).catch(() => null);
await check("포털에서 다른 사람으로 바뀌면 인사평가도 바로 로그아웃된다", async () => {
  const [s] = await sql`select count(*)::int n from sessions`;
  return page.url().includes("/login") && s!.n === 0;
});

// 30분 미사용
const p1 = await fresh();
await login(p1, ADMIN);
await sql`update sessions set last_seen_at = now() - interval '31 minutes'`;
await p1.goto(`${BASE}/admin`);
await check("30분 동안 아무것도 하지 않고 다시 누르면 2차 인증 화면으로 가고 이유가 보인다", async () =>
  p1.url().includes("/login") && (await p1.locator("text=30분 동안 사용하지 않아").count()) === 1,
);

// 10분 지남
async function sentCode(p: Awaited<ReturnType<typeof fresh>>) {
  await sql`delete from auth_codes`;
  await setPortalToken(p, portalTokenFor(adminNo));
  await p.goto(`${BASE}/login`);
  mark = logSize();
  await p.click('button:has-text("인증번호 받기")');
  await p.waitForSelector('input[name="code"]');
  return (await codeSince(mark))!;
}
const p2 = await fresh();
const code2 = await sentCode(p2);
await sql`update auth_codes set expires_at = now() - interval '1 minute'`;
await p2.fill('input[name="code"]', code2);
await p2.click('button:has-text("인증하기")');
await check("10분이 지나면 \"시간이 지났습니다\"가 보인다", async () => {
  await p2.waitForSelector("text=시간이 지났습니다");
  return true;
});

// 5번 틀림
const p3 = await fresh();
const code3 = await sentCode(p3);
const wrong = code3 === "123456" ? "654321" : "123456";
for (let i = 0; i < 5; i++) {
  await p3.fill('input[name="code"]', wrong);
  await p3.click('button:has-text("인증하기")');
  await p3.waitForTimeout(400);
}
await p3.fill('input[name="code"]', code3);
await p3.click('button:has-text("인증하기")');
await check("5번 틀리면 그 번호로는 들어갈 수 없고 다시 받아야 한다", async () => {
  await p3.waitForSelector("text=다시 받아 주세요");
  return p3.url().includes("/login");
});

// 포털 사양 (health, 화면 끼워넣기 허용 범위)
await check("/hr-eval/health 가 200과 {\"status\":\"ok\"}를 준다", async () => {
  const r = await fetch(`${BASE}/health`);
  return r.status === 200 && (await r.json()).status === "ok";
});
await check("포털 안에 끼워 보여 줄 수 있게 X-Frame-Options는 SAMEORIGIN, frame-ancestors 'self' (DENY 아님)", async () => {
  const r = await fetch(`${BASE}/login`);
  return r.headers.get("x-frame-options") === "SAMEORIGIN" && (r.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'self'");
});

// 정상 로그인 재확인 + 화면 캡처
const p5 = await fresh();
await login(p5, ADMIN);
await p5.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/01-admin.png` : "/tmp/01-admin.png" });

await b.close();
await sql.end();
process.exit(summary());
