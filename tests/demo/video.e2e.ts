// 1분 기능 소개 영상 녹화: 가짜 명단으로 평가 한 바퀴를 돌며 장면만 녹화한다 (로그인·중간 단계는 녹화하지 않음).
// 실행: 시험 모드 서버를 초기화·켠 뒤 `npx tsx tests/demo/video.e2e.ts <출력 폴더>` → 장면별 webm + scenes.json (ffmpeg로 이어 붙임)
import ExcelJS from "exceljs";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

const BASE = "http://127.0.0.1:3000/hr-eval";
const OUT = process.argv[2]!;
const T = "/tmp/hr-video";
mkdirSync(T, { recursive: true });
mkdirSync(OUT, { recursive: true });
copyFileSync("시험자료/시험용-명단.xlsx", `${T}/roster.xlsx`);
const PASS = "시험용-보안열쇠-문구-1";
const VW = 1280, VH = 720;

const b: Browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
type State = Awaited<ReturnType<BrowserContext["storageState"]>>;
const states = new Map<string, State>();

// 녹화 화면: 시험 모드 표시는 가리고, 아래에 자막 띠를 붙인다
const HIDE = `[data-testid="demo-bar"],[data-testid="demo-code"]{display:none!important}`;
async function prep(ctx: BrowserContext) {
  await ctx.addInitScript((css) => {
    const add = () => {
      const s = document.createElement("style");
      s.textContent = css;
      document.head.appendChild(s);
    };
    if (document.head) add();
    else document.addEventListener("DOMContentLoaded", add);
  }, HIDE);
}
async function caption(p: Page, step: string, text: string) {
  await p.evaluate(
    ([step, text]) => {
      document.getElementById("__cap")?.remove();
      if (!document.getElementById("__hide")) {
        const st = document.createElement("style");
        st.id = "__hide";
        st.textContent = '[data-testid="demo-bar"],[data-testid="demo-code"]{display:none!important}';
        document.body.appendChild(st);
      }
      const d = document.createElement("div");
      d.id = "__cap";
      d.style.cssText =
        "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;background:rgba(39,50,102,.94);color:#fff;padding:14px 26px;border-radius:14px;font:600 22px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;gap:14px;align-items:center;max-width:1100px;white-space:nowrap";
      d.innerHTML = `<span style="background:#8B96CE;color:#fff;border-radius:999px;padding:4px 12px;font-size:16px">${step}</span><span>${text}</span>`;
      document.body.appendChild(d);
    },
    [step, text],
  );
}

const scenes: { file: string; start: number; end: number }[] = [];
/** 녹화 장면 하나: 새 창에서 fn을 실행하고, 시작·끝 시각을 남긴다 */
async function scene(name: string, who: string | null, fn: (p: Page, mark: () => void) => Promise<void>) {
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, recordVideo: { dir: T, size: { width: VW, height: VH } }, storageState: who ? states.get(who) : undefined });
  await prep(ctx);
  const t0 = Date.now();
  const p = await ctx.newPage();
  let start = 0;
  await fn(p, () => (start = (Date.now() - t0) / 1000));
  await p.waitForTimeout(200);
  const end = (Date.now() - t0) / 1000;
  if (who) states.set(who, await ctx.storageState());
  await ctx.close();
  const file = `${OUT}/${String(scenes.length).padStart(2, "0")}-${name}.webm`;
  await p.video()!.saveAs(file);
  scenes.push({ file, start, end });
  console.log("장면", name, start.toFixed(1), end.toFixed(1));
}

/** 녹화하지 않는 로그인 (시험용 포털 → 화면의 인증번호) */
async function login(p: Page, name: string) {
  await p.goto(`${BASE}/dev`);
  await p.locator("tr", { has: p.getByRole("cell", { name, exact: true }) }).getByRole("button", { name: "이 사람으로 들어가기" }).click();
  await p.waitForURL(/\/login/);
  await p.getByRole("button", { name: "인증번호 받기" }).click();
  const code = ((await p.locator('[data-testid="demo-code"] b').textContent({ timeout: 10000 })) ?? "").trim();
  await p.fill('input[name="code"]', code);
  await p.getByRole("button", { name: "인증하기" }).click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"));
}
/** 녹화하지 않는 작업 창 */
async function off<R>(who: string, fn: (p: Page) => Promise<R>): Promise<R> {
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, acceptDownloads: true, storageState: states.get(who) });
  const p = await ctx.newPage();
  if (!states.has(who)) await login(p, who);
  await p.waitForLoadState("networkidle");
  const r = await fn(p);
  states.set(who, await ctx.storageState());
  await ctx.close();
  return r;
}
async function advance(p: Page) {
  await p.goto(`${BASE}/admin`);
  await p.getByRole("button", { name: "다음 단계로 넘기기" }).click();
  await p.getByRole("button", { name: "넘기기", exact: true }).click();
  await p.waitForTimeout(2000);
}
async function selfSubmit(p: Page, n: string, slow = false) {
  await p.goto(`${BASE}/me`);
  await p.getByText(/내 평가지 작성/).first().click();
  await p.waitForSelector("#achievement");
  if (slow) await caption(p, "직원", "내 평가지 작성 — 자동 저장, 빠진 칸은 제출 전에 안내");
  for (const g of await p.locator('[role="group"][aria-labelledby^="label-"]').all()) {
    await g.getByRole("button", { name: "7점" }).click();
    if (slow) await p.waitForTimeout(120);
  }
  if (slow) {
    await p.locator("#achievement").scrollIntoViewIfNeeded();
    await p.type("#achievement", "신규 거래처 3곳 확보, 매출 12% 성장", { delay: 45 });
    await p.type("#improvement", "거래처 관리 체계 정리", { delay: 45 });
    await p.waitForTimeout(700);
  } else {
    await p.fill("#achievement", `${n}의 올해 업적입니다.`);
    await p.fill("#improvement", `${n}의 내년 계획입니다.`);
  }
  await p.getByRole("button", { name: "제출" }).click();
  await p.waitForSelector("text=/제출 완료|제출했습니다/", { timeout: 15000 }).catch(() => null);
  if (slow) await p.waitForLoadState("networkidle");
}
const scoreOf = (n: number, i: number) => String(n >= 4 ? [9, 8, 8, 7][i % 4] : n === 2 ? [9, 7][i] : 8);
async function reviewLinks(p: Page, kind: string) {
  await p.goto(`${BASE}/me`);
  const first = await p.locator(`a[href*="/me/review/${kind}/"]`).first().getAttribute("href").catch(() => null);
  if (!first) return [];
  await p.goto(new URL(first, BASE).toString());
  return p.locator(`a[href*="/me/review/${kind}/"]`).evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))]);
}
async function scoreAll(p: Page, kind: string) {
  const links = await reviewLinks(p, kind);
  for (const [i, href] of links.entries()) {
    await p.goto(new URL(href, BASE).toString());
    for (const inp of await p.locator('input[aria-label$=" 점수"]:not([disabled])').all()) await inp.fill(scoreOf(links.length, i));
    await p.getByRole("button", { name: "제출" }).click();
    await p.waitForTimeout(1200);
  }
}
function card(title: string, sub: string, foot: string) {
  return `<html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#273266;color:#fff;font-family:system-ui,sans-serif">
  <div style="font-size:22px;color:#DEE3F5;margin-bottom:18px">${foot}</div>
  <div style="font-size:52px;font-weight:800">${title}</div>
  <div style="font-size:26px;margin-top:22px;color:#DEE3F5">${sub}</div></body></html>`;
}

// ── 0. 시작·끝 화면은 그림으로 ──
{
  const ctx = await b.newContext({ viewport: { width: VW, height: VH } });
  const p = await ctx.newPage();
  await p.setContent(card("AI 기반 인사평가 시스템", "주요 기능 1분 소개", "㈜파워넷 경영지원실 · AI 컨설팅 킥오프"));
  await p.screenshot({ path: `${OUT}/title.png` });
  await p.setContent(card("기능 19개 · 자동 시험 263개 항목 통과", "11월 정기평가 적용 목표", "업무 담당자 × AI로 2주 만에 시제품 완성"));
  await p.screenshot({ path: `${OUT}/end.png` });
  await ctx.close();
}

// ── 1. 2차 인증 + 보안 열쇠 ──
{
  // 관리자 포털 토큰만 얻어 둔다 (녹화 창에서 2차 인증을 보여 주기 위해)
  const ctx = await b.newContext();
  const p0 = await ctx.newPage();
  await p0.goto(`${BASE}/dev`);
  await p0.locator("tr", { has: p0.getByRole("cell", { name: "김인사", exact: true }) }).getByRole("button", { name: "이 사람으로 들어가기" }).click();
  await p0.waitForURL(/\/login/);
  states.set("김인사", await ctx.storageState());
  await ctx.close();
}
await scene("login", "김인사", async (p, mark) => {
  await p.goto(`${BASE}/login`);
  await p.waitForSelector('button:has-text("인증번호 받기")');
  await caption(p, "로그인", "사내 포털 로그인 + 회사 메일 인증번호 (2차 인증)");
  mark();
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: "인증번호 받기" }).click();
  const code = ((await p.locator('[data-testid="demo-code"] b').textContent({ timeout: 10000 })) ?? "").trim();
  await p.waitForTimeout(500);
  await p.type('input[name="code"]', code, { delay: 120 });
  await p.getByRole("button", { name: "인증하기" }).click();
  await p.waitForURL(/\/admin\/vault/);
  await p.waitForLoadState("networkidle");
  await caption(p, "보안", "점수·업적 글·등급은 암호화 — 열쇠는 인사 관리자만 (서버 관리자도 열람 불가)");
  await p.type("#v-pass", PASS, { delay: 25 });
  await p.fill("#v-confirm", PASS);
  await p.getByRole("checkbox").click();
  await p.getByRole("button", { name: "보안 열쇠 만들기" }).click();
  await p.waitForSelector('[data-vault="open"]', { timeout: 20000 });
  await p.waitForTimeout(1200);
});

// ── 2. 명단 올리기 ──
await scene("roster", "김인사", async (p, mark) => {
  await p.goto(`${BASE}/admin/setup`);
  await p.waitForLoadState("networkidle");
  await caption(p, "관리자", "직원 명단 엑셀 업로드 → 평가 대상·그룹·평가자 자동 지정");
  mark();
  await p.waitForTimeout(800);
  await p.setInputFiles('input[type="file"]', `${T}/roster.xlsx`);
  await p.waitForSelector('button:has-text("반영하기")');
  await p.waitForTimeout(1300);
  await p.locator('button:has-text("반영하기")').click();
  await p.waitForSelector("text=반영 완료");
  await p.mouse.wheel(0, 380);
  await p.waitForTimeout(2200);
});
await off("김인사", async (p) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
  await p.goto(`${BASE}/admin/setup`);
  await p.waitForLoadState("networkidle");
  for (const [k, d] of Object.entries({ selfStart: plus(0), selfEnd: plus(3), firstStart: plus(4), firstEnd: plus(7), secondStart: plus(8), secondEnd: plus(11), bonusCutoff: plus(3) })) await p.fill(`input[name="${k}"]`, d);
  await p.click('button:has-text("기간 저장")');
  await p.waitForSelector("text=기간을 저장했습니다");
  await p.reload();
  await p.getByRole("button", { name: "안내 이메일 발송" }).click();
  await p.getByRole("button", { name: /명에게 발송/ }).click();
  await p.waitForSelector("text=/발송 완료/", { timeout: 60000 });
});

// ── 3. 직원 평가지 ──
await off("김대리", async () => {});
await scene("selfform", "김대리", async (p, mark) => {
  await p.goto(`${BASE}/me`);
  await p.waitForLoadState("networkidle");
  await caption(p, "직원", "내 평가지 작성 — 자동 저장, 빠진 칸은 제출 전에 안내");
  mark();
  await p.waitForTimeout(800);
  await selfSubmit(p, "김대리", true);
  await caption(p, "직원", "기간 안에는 제출 뒤에도 고칠 수 있음");
  await p.waitForTimeout(1500);
});
const others = ["최팀장", "박과장", "이주임", "윤사원", "오팀장", "강차장", "서대리", "장팀장"];
for (const n of others) await off(n, (p) => selfSubmit(p, n));

// ── 4. 진행 현황 ──
await scene("progress", "김인사", async (p, mark) => {
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState("networkidle");
  await caption(p, "관리자", "진행 현황 — 미제출자 확인, 독촉 메일 한 번에");
  mark();
  await p.waitForTimeout(1200);
  await p.mouse.wheel(0, 300);
  await p.waitForTimeout(800);
  await p.locator("thead").getByRole("checkbox").click().catch(() => null);
  await p.waitForTimeout(2200);
});
for (const n of ["임과장", "조사원"]) await off(n, (p) => selfSubmit(p, n));
await off("김인사", advance);

// ── 5. 1차 평가: 평균 80점 ──
const leadLinks = await off("최팀장", async (p) => {
  const links = await reviewLinks(p, "first");
  for (const [i, href] of links.slice(0, -1).entries()) {
    await p.goto(new URL(href, BASE).toString());
    for (const inp of await p.locator('input[aria-label$=" 점수"]:not([disabled])').all()) await inp.fill(scoreOf(links.length, i));
    await p.getByRole("button", { name: "제출" }).click();
    await p.waitForTimeout(1200);
  }
  return links;
});
await scene("average", "최팀장", async (p, mark) => {
  await p.goto(new URL(leadLinks.at(-1)!, BASE).toString());
  await p.waitForLoadState("networkidle");
  await caption(p, "팀장", "1차 평가 — 본인평가를 보며 점수 입력");
  mark();
  await p.waitForTimeout(900);
  for (const inp of await p.locator('input[aria-label$=" 점수"]:not([disabled])').all()) {
    await inp.fill("10");
    await p.waitForTimeout(60);
  }
  await p.getByRole("button", { name: "제출" }).click();
  await p.waitForTimeout(700);
  await p.getByText("평균이 80점에 맞지 않아").first().scrollIntoViewIfNeeded().catch(() => null);
  await caption(p, "팀장", "평가자 평균 80점 기준 — 벗어나면 제출을 막고 조정 방법을 안내");
  await p.waitForTimeout(3200);
  for (const inp of await p.locator('input[aria-label$=" 점수"]:not([disabled])').all()) await inp.fill(scoreOf(leadLinks.length, leadLinks.length - 1));
  await p.getByRole("button", { name: "제출" }).click();
  await p.waitForTimeout(1500);
});
for (const n of ["오팀장", "장팀장"]) await off(n, (p) => scoreAll(p, "first"));
await off("김인사", advance);
for (const n of ["정임원", "한전무"]) await off(n, async (p) => { await scoreAll(p, "second"); await scoreAll(p, "leader"); });
await off("김인사", advance);
await off("김인사", async (p) => {
  await p.goto(`${BASE}/admin/bonus`);
  await p.waitForLoadState("networkidle");
  const dl = p.waitForEvent("download");
  await p.getByRole("button", { name: "템플릿 내려받기" }).click();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await (await dl).path())!);
  wb.worksheets[0]!.eachRow((r, i) => {
    if (i === 1) return;
    for (let c = 4; c <= 9; c++) r.getCell(c).value = 0;
    if (r.getCell(10).value !== "—") r.getCell(10).value = 0;
    if (r.getCell(1).value === "김대리") r.getCell(4).value = 1;
  });
  writeFileSync(`${T}/bonus.xlsx`, Buffer.from(await wb.xlsx.writeBuffer()));
  await p.setInputFiles('input[type="file"]', `${T}/bonus.xlsx`);
  await p.waitForSelector("text=/명 일치/");
  await p.getByRole("button", { name: /명 반영하기/ }).click();
  await p.waitForSelector("text=반영 완료");
});

// ── 6. 최종평가·등급조정 ──
await scene("final", "김인사", async (p, mark) => {
  await p.goto(`${BASE}/admin/final?group=5`);
  await p.waitForLoadState("networkidle");
  await p.locator("table").scrollIntoViewIfNeeded();
  await caption(p, "관리자", "최종점수 계산 · 그룹별 등급 비율에 맞춰 자동 배분");
  mark();
  await p.waitForTimeout(2200);
  await p.locator('tr[data-person="조사원"]').getByRole("combobox", { name: /평가등급$/ }).selectOption("A");
  await p.waitForSelector('[role="alertdialog"]');
  await caption(p, "관리자", "등급조정 — 누가 밀려나는지 미리 보고 적용");
  await p.waitForTimeout(2200);
  await p.getByRole("button", { name: "적용" }).click();
  await p.waitForTimeout(1600);
});

// ── 7. 대표이사 ──
await off("박대표", async () => {});
await scene("ceo", "박대표", async (p, mark) => {
  await p.goto(`${BASE}/report`);
  await p.waitForLoadState("networkidle");
  await caption(p, "대표이사", "등급 결과 실시간 확인 (보기 전용, 업적 글·항목 점수는 비공개)");
  mark();
  await p.waitForTimeout(1000);
  await p.getByText("5그룹 대리이하").first().click();
  await p.waitForTimeout(2400);
});
await off("김인사", async (p) => {
  await p.goto(`${BASE}/admin/final`);
  await p.getByRole("button", { name: "확정", exact: true }).click();
  await p.locator('[role="alertdialog"]').getByRole("button", { name: "확정", exact: true }).click();
  await p.waitForTimeout(2000);
  await p.goto(`${BASE}/admin/results`);
  await p.getByRole("button", { name: "평가결과 이메일 발송" }).click();
  await p.getByRole("button", { name: /명에게 발송/ }).click();
  await p.waitForTimeout(3000);
});

// ── 8. 직원 결과 ──
await scene("result", "김대리", async (p, mark) => {
  await p.goto(`${BASE}/me/result`);
  await p.waitForLoadState("networkidle");
  await caption(p, "직원", "내 평가결과 — 점수·가점·등급·상위 % (등급조정 여부는 비공개)");
  mark();
  await p.waitForTimeout(3600);
});


writeFileSync(`${OUT}/scenes.json`, JSON.stringify(scenes, null, 2));
await b.close();
