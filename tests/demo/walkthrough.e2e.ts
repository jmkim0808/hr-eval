// 시험 모드 한 바퀴: 사람이 하는 것과 똑같이 화면만으로 평가 전체를 돌린다 (DB를 직접 건드리지 않음).
// 준비: node scripts/demo.mjs setup → start (빈 시험용 DB). 실행: npx tsx tests/demo/walkthrough.e2e.ts
import ExcelJS from "exceljs";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright-core";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3000/hr-eval";
const ROSTER = process.env.DEMO_ROSTER ?? "시험자료/시험용-명단.xlsx";
const PASS = "시험용-보안열쇠-문구-1";
// 발표·문서용 화면 캡처 폴더 (선택). 시험 모드 노란 줄은 가리고 찍는다
const SHOTS = process.env.SHOTS;
async function shot(p: Page, name: string) {
  if (!SHOTS) return;
  await p.addStyleTag({ content: '[data-testid="demo-bar"]{display:none!important}' });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${SHOTS}/${name}.png` });
}
/** 사람마다 점수를 다르게 주되 평가자 평균은 80점 (4명: 90·80·80·70, 2명: 90·70) */
const scoreOf = (n: number, i: number) => String(n >= 4 ? [9, 8, 8, 7][i % 4] : n === 2 ? [9, 7][i] : 8);
const T = "/tmp/hr-demo";
mkdirSync(T, { recursive: true });
// 시험 도구(Playwright)가 한글 경로 파일을 못 붙이는 문제가 있어 영문 경로로 복사해 올린다 (사람이 고를 때는 상관없음)
copyFileSync(ROSTER, `${T}/roster.xlsx`);

const results: { ok: boolean; text: string }[] = [];
async function check(text: string, fn: () => Promise<boolean>) {
  let ok = false;
  try {
    ok = await fn();
  } catch (e) {
    console.error(e);
  }
  results.push({ ok, text });
  console.log(`${ok ? "✔" : "✘"} ${text}`);
}
const errors: string[] = [];
// 인터넷 시험 서버(입구 비밀번호)에 돌릴 때: E2E_GATE=비밀번호
const gate = process.env.E2E_GATE ? { httpCredentials: { username: "test", password: process.env.E2E_GATE } } : {};
const b: Browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const pages = new Map<string, Page>();

/** 시험용 포털에서 이름으로 고르고, 화면에 나온 인증번호로 2차 인증 */
async function as(name: string): Promise<Page> {
  const old = pages.get(name);
  if (old) return old;
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true, ...gate })).newPage();
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await p.addInitScript(() => {
    try {
      localStorage.setItem("hr-form-mode", "all");
    } catch {}
  });
  await p.goto(`${BASE}/dev`);
  await p.locator("tr", { has: p.getByRole("cell", { name, exact: true }) }).getByRole("button", { name: "이 사람으로 들어가기" }).click();
  await p.waitForURL(/\/login/);
  await p.getByRole("button", { name: "인증번호 받기" }).click();
  // 같은 사람을 1분 안에 다시 고르면 "60초 뒤에 다시" 제한이 걸린다 (실제와 같음) → 기다렸다 다시
  if (!(await p.locator('[data-testid="demo-code"]').waitFor({ timeout: 5000 }).then(() => true).catch(() => false))) {
    await p.waitForTimeout(61_000);
    await p.getByRole("button", { name: "인증번호 받기" }).click();
  }
  const code = (await p.locator('[data-testid="demo-code"] b').innerText({ timeout: 10000 })).trim();
  await p.fill('input[name="code"]', code);
  await p.getByRole("button", { name: "인증하기" }).click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"));
  await p.waitForLoadState("networkidle");
  pages.set(name, p);
  return p;
}
const bad = async (p: Page) => (await p.locator("body").innerText()).includes("문제가 생겼습니다");
async function advance(p: Page) {
  await p.goto(`${BASE}/admin`);
  await p.getByRole("button", { name: "다음 단계로 넘기기" }).click();
  await p.getByRole("button", { name: "넘기기", exact: true }).click();
  await p.waitForTimeout(2000);
  return (await p.locator('li[aria-current="step"]').innerText()).trim();
}

// ── 1. 관리자: 처음 들어오면 보안 열쇠 만들기 ──
const admin = await as("김인사");
await check("관리자가 처음 들어오면 보안 열쇠 만들기 화면이 나온다", async () => admin.url().endsWith("/admin/vault") && (await admin.locator('[data-vault="unset"]').count()) === 1);
await admin.fill("#v-pass", PASS);
await admin.fill("#v-confirm", PASS);
await admin.getByRole("checkbox").click();
await admin.getByRole("button", { name: "보안 열쇠 만들기" }).click();
await admin.waitForSelector('[data-vault="open"]', { timeout: 20000 });
await admin.fill("#v-label", "이관리");
await admin.fill("#v-new", `${PASS}-예비`);
await admin.fill("#v-new2", `${PASS}-예비`);
await admin.getByRole("button", { name: "열쇠 칸 추가" }).click();
await admin.waitForSelector('tr[data-slot-label="이관리"]', { timeout: 20000 });
await check("보안 열쇠를 만들고 두 번째 관리자 열쇠 칸을 추가할 수 있다", async () => (await admin.locator("tr[data-slot-label]").count()) === 2);

// ── 2. 명단 올리기 · 기간 · 안내 발송 ──
await admin.goto(`${BASE}/admin/setup`);
await admin.waitForLoadState("networkidle");
await admin.setInputFiles('input[type="file"]', `${T}/roster.xlsx`);
await admin.waitForSelector('button:has-text("반영하기")');
await check("시험용 명단(14명)을 올리면 대상·제외가 미리 보인다 (7월 이후 입사 1명 제외)", async () => (await admin.getByText("제외 1명").count()) >= 1);
await admin.locator('button:has-text("반영하기")').click();
await admin.waitForSelector("text=반영 완료");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
await admin.reload();
await admin.waitForLoadState("networkidle");
for (const [k, d] of Object.entries({ selfStart: plus(0), selfEnd: plus(3), firstStart: plus(4), firstEnd: plus(7), secondStart: plus(8), secondEnd: plus(11), bonusCutoff: plus(3) }))
  await admin.fill(`input[name="${k}"]`, d);
await admin.click('button:has-text("기간 저장")');
await admin.waitForSelector("text=기간을 저장했습니다");
await admin.reload();
await admin.getByRole("button", { name: "안내 이메일 발송" }).click();
await admin.getByRole("button", { name: /명에게 발송/ }).click();
await admin.waitForSelector("text=/발송 완료/", { timeout: 30000 });
await check("안내 메일을 보내면 시험용 포털 메일함에 안내 메일이 보인다", async () => {
  const p = await (await b.newContext(gate)).newPage();
  await p.goto(`${BASE}/dev`);
  const t = await p.locator("main").innerText();
  await p.context().close();
  return t.includes("정기평가가 시작되었습니다") && !/점수|등급/.test(t.replace(/등급 결과|평가등급/g, "").split("보낸 메일함")[1] ?? "");
});

// ── 3. 대상자 11명 본인 평가 ──
const targets = ["최팀장", "김대리", "박과장", "이주임", "윤사원", "오팀장", "강차장", "서대리", "장팀장", "임과장", "조사원"];
for (const [ti, n] of targets.entries()) {
  if (ti === 8 && SHOTS) {
    await admin.goto(`${BASE}/admin`);
    await admin.waitForLoadState("networkidle");
    await shot(admin, "01-progress");
  }
  const p = await as(n);
  await p.goto(`${BASE}/me`);
  await p.getByText(/내 평가지 작성/).first().click();
  await p.waitForSelector("#achievement");
  for (const g of await p.locator('[role="group"][aria-labelledby^="label-"]').all()) await g.getByRole("button", { name: "7점" }).click();
  await p.fill("#achievement", `${n}의 올해 업적입니다.`);
  await p.fill("#improvement", `${n}의 내년 계획입니다.`);
  await p.getByRole("button", { name: "제출" }).click();
  await p.waitForSelector("text=/제출 완료|제출했습니다/", { timeout: 15000 }).catch(() => null);
  if (await bad(p)) errors.push(`${n} 본인평가`);
}
await admin.goto(`${BASE}/admin`);
await check("11명이 본인 평가를 제출하면 진행 현황에 11/11이 보인다", async () => /11\s*\/\s*11|11명 중 11명/.test(await admin.locator("main").innerText()));
await check("1차평가로 넘길 수 있다", async () => (await advance(admin)).includes("1차평가"));

// ── 4. 1차 평가 (팀장 3명) — 모두 8점이면 평균 80점 ──
/** 내 할 일의 묶음 링크로 들어가 왼쪽 목록에서 맡은 사람 전부의 주소를 모은다 */
async function reviewLinks(p: Page, kind: string) {
  await p.goto(`${BASE}/me`);
  const first = await p.locator(`a[href*="/me/review/${kind}/"]`).first().getAttribute("href").catch(() => null);
  if (!first) return [];
  await p.goto(new URL(first, BASE).toString());
  return p.locator(`a[href*="/me/review/${kind}/"]`).evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))]);
}
async function scoreAll(p: Page, kind: "first" | "second" | "leader", score: string) {
  const links = await reviewLinks(p, kind);
  for (const href of links) {
    await p.goto(new URL(href, BASE).toString());
    const v = score === "vary" ? scoreOf(links.length, links.indexOf(href)) : score;
    for (const i of await p.locator('input[aria-label$=" 점수"]:not([disabled])').all()) await i.fill(v);
    if (await p.locator("#review-comment").count()) await p.fill("#review-comment", `${kind === "second" ? "2차" : kind === "leader" ? "임원" : "1차"} 시험 의견입니다.`);
    await p.getByRole("button", { name: "제출" }).click();
    await p.waitForTimeout(1200);
    if (await bad(p)) errors.push(`${kind} ${href}`);
  }
  return links.length;
}
// 평균 규칙 확인: 최팀장이 마지막 사람을 9점으로 주면 막힌다
const lead = await as("최팀장");
const leadLinks = await reviewLinks(lead, "first");
for (const [i, href] of leadLinks.entries()) {
  await lead.goto(new URL(href, BASE).toString());
  for (const inp of await lead.locator('input[aria-label$=" 점수"]:not([disabled])').all()) await inp.fill(i === leadLinks.length - 1 ? "10" : scoreOf(leadLinks.length, i));
  await lead.fill("#review-comment", "1차 시험 의견입니다.");
  await lead.getByRole("button", { name: "제출" }).click();
  await lead.waitForTimeout(1200);
}
await shot(lead, "02-average");
await check("[1차] 평가자 평균이 80점을 벗어나면 마지막 사람 제출이 막히고 고칠 방법이 보인다", async () => /평균/.test(await lead.locator("main").innerText()) && leadLinks.length === 4);
for (const inp of await lead.locator('input[aria-label$=" 점수"]:not([disabled])').all()) await inp.fill(scoreOf(leadLinks.length, leadLinks.length - 1));
await lead.getByRole("button", { name: "제출" }).click();
await lead.waitForTimeout(1500);
const n1 = (await scoreAll(await as("오팀장"), "first", "vary")) + (await scoreAll(await as("장팀장"), "first", "vary"));
await lead.goto(`${BASE}/me`);
await check("[1차] 팀장 3명이 팀원 8명의 1차 평가를 마친다", async () => n1 === 4 && /4명 중 4명 완료|팀원 4명/.test(await lead.locator("main").innerText()));
await check("2차평가로 넘길 수 있다", async () => (await advance(admin)).includes("2차평가"));

// ── 5. 2차 평가 · 팀장 평가 (임원 2명) ──
const n2 = (await scoreAll(await as("정임원"), "second", "vary")) + (await scoreAll(await as("한전무"), "second", "vary"));
const nl = (await scoreAll(await as("정임원"), "leader", "vary")) + (await scoreAll(await as("한전무"), "leader", "vary"));
await check("[2차] 임원 2명이 팀원 8명 2차 평가와 팀장 3명 평가를 마친다", async () => n2 === 8 && nl === 3);
await check("최종평가로 넘길 수 있다", async () => (await advance(admin)).includes("최종평가"));

// ── 6. 가점 (템플릿) ──
await admin.goto(`${BASE}/admin/bonus`);
await admin.waitForLoadState("networkidle");
const dl = admin.waitForEvent("download");
await admin.getByRole("button", { name: "템플릿 내려받기" }).click();
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile((await (await dl).path())!);
const ws = wb.worksheets[0]!;
ws.eachRow((r, i) => {
  if (i === 1) return;
  for (let c = 4; c <= 9; c++) r.getCell(c).value = 0;
  if (r.getCell(10).value !== "—") r.getCell(10).value = 0;
  if (r.getCell(1).value === "김대리") r.getCell(4).value = 1;
});
writeFileSync(`${T}/bonus.xlsx`, Buffer.from(await wb.xlsx.writeBuffer()));
await admin.setInputFiles('input[type="file"]', `${T}/bonus.xlsx`);
await admin.waitForSelector("text=/명 일치/");
await admin.getByRole("button", { name: /명 반영하기/ }).click();
await admin.waitForSelector("text=반영 완료");
await check("가점 템플릿을 내려받아 채워 올리면 11명 반영된다", async () => (await admin.locator("main").innerText()).includes("11"));
{
  const k = await as("김대리");
  await k.goto(`${BASE}/me/bonus`);
  await check("[2026-10-15] 직원이 [내 가점]에서 넣자마자 자기 가점(합계 1)과 바뀐 기록을 본다", async () => (await k.getByTestId("my-bonus-total").innerText()) === "1" && (await k.getByTestId("bonus-history").count()) === 1);
}

// ── 7. 최종평가 · 대표이사 · 확정 ──
await admin.goto(`${BASE}/admin/final`);
await check("최종평가 화면에 점수·등급 초안이 보이고 김대리(가점 +1)가 5그룹 1위다", async () => {
  await admin.goto(`${BASE}/admin/final?group=5`);
  await shot(admin, "03-final");
  const first = await admin.locator("tbody tr").first().innerText();
  return first.includes("김대리") && !(await bad(admin));
});
const ceo = await as("박대표");
await check("대표이사 화면에 등급 결과가 보인다 (업적 글은 없음)", async () => {
  await ceo.goto(`${BASE}/report`);
  const t = await ceo.locator("main").innerText();
  if (SHOTS) {
    await ceo.getByText("5그룹 대리이하").first().click();
    await ceo.waitForTimeout(500);
    await shot(ceo, "04-report");
  }
  return t.includes("최종점수") && !t.includes("올해 업적");
});
// 대표이사 조정 (등급별 비중과 상관없이 S~D)
await ceo.goto(`${BASE}/report?group=5`);
const lastRow = ceo.locator("tbody tr").filter({ has: ceo.locator("select") }).last();
const lastName = (await lastRow.locator("td").nth(1).innerText()).trim();
await ceo.getByRole("combobox", { name: `${lastName} 대표이사 조정` }).selectOption("S");
await ceo.waitForTimeout(2000);
await ceo.reload();
await check("[2026-10-15] 대표이사가 등급 결과 화면에서 비중과 상관없이 S로 바꾸면 바로 반영되고 '대표 조정'으로 보인다", async () =>
  (await ceo.locator(`tr[data-person="${lastName}"] [data-grade]`).innerText()).trim() === "S" && (await ceo.locator(`tr[data-person="${lastName}"]`).getByText(/대표 조정/).count()) === 1,
);
await admin.goto(`${BASE}/admin/final`);
await admin.getByRole("button", { name: "확정", exact: true }).click();
await admin.locator('[role="alertdialog"]').getByRole("button", { name: "확정", exact: true }).click();
await admin.waitForTimeout(2000);
await check("평가등급을 확정할 수 있다", async () => (await admin.getByText(/확정됨/).count()) >= 1);

// ── 8. 결과 발송 · 직원 확인 · 마감 ──
await admin.goto(`${BASE}/admin/results`);
await admin.getByRole("button", { name: "평가결과 이메일 발송" }).click();
await admin.getByRole("button", { name: /명에게 발송/ }).click();
await admin.waitForTimeout(2500);
const kim = await as("김대리");
await kim.goto(`${BASE}/me/result`);
await check("직원이 내 평가결과에서 점수·가점·등급·상위 %를 본다 (조정 여부는 없음)", async () => {
  const t = await kim.locator("main").innerText();
  return ["1차 점수", "2차 점수", "최종점수", "평가등급", "상위"].every((w) => t.includes(w)) && !t.includes("조정") && t.includes("1차 시험 의견입니다.") && t.includes("2차 시험 의견입니다.");
});
await admin.goto(`${BASE}/admin/results`);
// 결과 메일이 다 나가야 [평가 마감]이 보인다 (보고 있는 동안 10통씩 보냄)
await admin.getByRole("button", { name: "평가 마감" }).waitFor({ timeout: 120_000 });
await admin.getByRole("button", { name: "평가 마감" }).click();
await admin.locator('[role="alertdialog"]').getByRole("button", { name: "마감", exact: true }).click();
await admin.waitForTimeout(2000);
await admin.goto(`${BASE}/admin`);
await check("평가를 마감하면 진행 현황에 \"정기평가 마감\"과 보관 기한이 보인다", async () => (await admin.locator('[data-testid="closed-line"]').count()) === 1 && (await admin.locator('[data-testid="retention"]').innerText()).includes("3년"));

// 지난 평가 기록: 시험용 포털에서 작년 기록을 만들고 직원·팀장이 본다
await admin.goto(`${BASE}/dev`);
await admin.getByTestId("make-past-year").click();
await admin.getByText(/기록을 \d+명분 만들었습니다/).waitFor({ timeout: 30_000 }).catch(() => null);
await kim.goto(`${BASE}/me/history`);
await check("[2026-10-15] 시험용 포털에서 작년 기록을 만들면 직원의 [지난 평가 기록]에 작년·올해가 보이고 업적 글을 열 수 있다", async () => {
  const years = await kim.locator("[data-year]").count();
  await kim.locator("[data-year] a").last().click();
  await kim.waitForLoadState("networkidle");
  return years === 2 && (await kim.getByTestId("history-achievement").innerText()).length > 20;
});
await lead.goto(`${BASE}/me/history`);
await check("[2026-10-15] 팀장의 [지난 평가 기록]에 그 해 평가한 팀원이 보인다", async () => (await lead.locator('[data-testid^="reviewed-"]').first().innerText()).includes("김대리"));

await check("한 바퀴 동안 어느 화면에서도 오류가 나지 않았다", async () => {
  if (errors.length) console.log("오류:", errors);
  return errors.length === 0;
});
await admin.screenshot({ path: `${T}/end.png`, fullPage: true });
await b.close();
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} 통과`);
process.exit(fail);
