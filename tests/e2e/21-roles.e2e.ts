// 사용자별 점검: 관리자·대표이사·임원·팀장·직원·평가 비대상·접근 차단이 각자 볼 수 있는 화면과 볼 수 없는 화면.
// 2차평가 기간(점수가 들어 있는 상태)과 최종평가 단계에서 확인한다. 어느 화면에서도 "문제가 생겼습니다"가 나오면 안 된다.
import type { Page } from "playwright-core";
import { BASE, browser, check, E, employeeNoOf, login, portalTokenFor, setPortalToken, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
await sql`delete from sessions`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'second_review', ${plus(-12)}, ${plus(-9)}, ${plus(-8)}, ${plus(-3)}, ${plus(-2)}, ${plus(3)}, ${plus(-9)}) returning id`;
const cycleId = cyc!.id as string;
let no = 0;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", employee_no: `R${String(++no).padStart(3, "0")}`, ...v })} returning id`;
  return r!.id as string;
};
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
const kim = await person({ email: "kim@powernet.test", name: "김대리", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
const park = await person({ email: "park@powernet.test", name: "박과장", grade_group: 4, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
const fresh = await person({ email: "new@powernet.test", name: "한신입", position: "사원", hire_date: `${year}-08-01`, is_target: false, excluded_reason: "7월 1일 이후 입사" });
const blocked = await person({ email: "gone@powernet.test", name: "퇴사자", access_blocked: true, grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
void blocked;

const MEMBER = ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust", "achievement"];
for (const [pid, text] of [[kim, "김대리 업적 글"], [park, "박과장 업적 글"]] as const) {
  const [ev] = await sql`insert into evaluations (person_id, achievement_text, improvement_text, self_submitted_at, first_submitted_at, version) values (${pid}, ${E(text)}, ${E("개선")}, now(), now(), 3) returning id`;
  for (const c of MEMBER) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, 'first', ${c}, ${E(8)})`;
  await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, 'second', 'responsibility', ${E(3)})`;
}
await sql`insert into evaluations (person_id, achievement_text, self_submitted_at, version) values (${ld}, ${E("최팀장 팀 업적")}, now(), 2)`;

const b = await browser();
const as = async (email: string) => {
  const p = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
  await login(p, email);
  return p;
};
const errors: string[] = [];
/** 열어 보고 (상태 코드, 도착 주소, 본문) — "문제가 생겼습니다"가 보이면 기록 */
async function open(p: Page, path: string, who: string) {
  const r = await p.goto(`${BASE}${path}`);
  await p.waitForLoadState("networkidle").catch(() => null);
  const text = await p.locator("body").innerText().catch(() => "");
  if (text.includes("문제가 생겼습니다")) errors.push(`${who} ${path}`);
  return { status: r?.status() ?? 0, url: p.url().replace(BASE, ""), text };
}
const denied = (r: { status: number; url: string }, path: string) => r.status === 404 || !r.url.startsWith(path);

// ── 직원 ──
const emp = await as("kim@powernet.test");
await check("[직원] 첫 화면은 내 할 일(/me)이다", async () => (await open(emp, "/", "직원")).url === "/me");
await check("[직원] 관리자·보안 열쇠·대표이사 화면에 들어갈 수 없다", async () => {
  for (const p of ["/admin", "/admin/final", "/admin/vault", "/admin/settings", "/report"]) if (!denied(await open(emp, p, "직원"), p)) return false;
  return true;
});
await check("[직원] 다른 사람의 평가지·평가하기 주소를 넣어도 열리지 않는다 (404)", async () =>
  (await open(emp, `/me/form/${park}`, "직원")).status === 404 && (await open(emp, `/me/review/first/${park}`, "직원")).status === 404 && (await open(emp, `/me/review/second/${kim}`, "직원")).status === 404,
);
await check("[직원] 결과가 나오기 전에는 내 평가결과에 \"아직 결과가 나오지 않았습니다\"만 보인다", async () => (await open(emp, "/me/result", "직원")).text.includes("아직 결과가 나오지 않았습니다"));
await check("[직원] 내 평가지에는 1차·2차 점수가 보이지 않는다", async () => {
  const r = await open(emp, `/me/form/${kim}`, "직원");
  return r.status === 200 && !/1차|2차/.test(r.text.replace(/1차평가|2차평가/g, ""));
});

// ── 팀장 ──
const lead = await as("lead@powernet.test");
await check("[팀장] 첫 화면은 내 할 일이고, 1차 평가 묶음이 (기간이 지나) \"보기만\"으로 보인다", async () => {
  const r = await open(lead, "/", "팀장");
  return r.url === "/me" && /1차 평가 — 팀원 \d+명/.test(r.text) && r.text.includes("보기만");
});
await check("[팀장] 팀원 평가 화면에 2차(임원) 점수가 어디에도 보이지 않는다", async () => {
  const r = await open(lead, `/me/review/first/${kim}`, "팀장");
  const html = await lead.content();
  return r.status === 200 && !/2차/.test(r.text) && !html.includes('"second"');
});
await check("[팀장] 2차 평가 주소·남의 팀 평가·관리자·대표이사 화면에 들어갈 수 없다", async () =>
  (await open(lead, `/me/review/second/${kim}`, "팀장")).status === 404 && denied(await open(lead, "/admin", "팀장"), "/admin") && denied(await open(lead, "/report", "팀장"), "/report"),
);

// ── 임원 ──
const exe = await as("exec@powernet.test");
await check("[임원] 2차평가 기간에 팀원의 1차 점수를 보며 2차 점수를 넣을 수 있다", async () => {
  const r = await open(exe, `/me/review/second/${kim}`, "임원");
  return r.status === 200 && r.text.includes("김대리 업적 글") && r.text.includes("1차") && (await exe.locator('input[aria-label$=" 2차 점수"]').count()) > 0;
});
await check("[임원] 팀장 평가(리더 평가)도 같은 기간에 넣을 수 있다", async () => {
  const r = await open(exe, `/me/review/leader/${ld}`, "임원");
  return r.status === 200 && r.text.includes("최팀장 팀 업적") && (await exe.locator("input").count()) > 0;
});
await check("[임원] 1차 평가 주소(팀장 몫)와 관리자 화면에는 들어갈 수 없다", async () =>
  (await open(exe, `/me/review/first/${kim}`, "임원")).status === 404 && denied(await open(exe, "/admin", "임원"), "/admin"),
);

// ── 대표이사 ──
const ceo = await as("ceo@powernet.test");
await check("[대표이사] 첫 화면은 등급 결과이고, 최종평가 전에는 \"아직 보고할 결과가 없습니다\"만 보인다", async () => {
  const r = await open(ceo, "/", "대표이사");
  return r.url === "/report" && r.text.includes("아직 보고할 결과가 없습니다");
});
await check("[대표이사] 관리자 화면·평가지·평가하기에는 들어갈 수 없다", async () =>
  denied(await open(ceo, "/admin", "대표이사"), "/admin") && denied(await open(ceo, `/me/form/${kim}`, "대표이사"), "/me/form") && denied(await open(ceo, `/me/review/second/${kim}`, "대표이사"), "/me/review"),
);

// ── 평가 비대상 (7월 이후 입사) ──
const nw = await as("new@powernet.test");
await check("[평가 비대상] 들어올 수는 있지만 내 평가지 할 일이 없고, 평가지 주소도 열리지 않는다", async () => {
  const r = await open(nw, "/me", "비대상");
  return r.url === "/me" && !r.text.includes("내 평가지 작성") && (await open(nw, `/me/form/${fresh}`, "비대상")).status === 404;
});

// ── 접근 차단 (퇴사 등) ──
await check("[접근 차단] 포털 로그인을 해도 \"등록되지 않은 사번\"으로 막힌다", async () => {
  const p = await (await b.newContext()).newPage();
  await setPortalToken(p, portalTokenFor(await employeeNoOf("gone@powernet.test")));
  await p.goto(`${BASE}/login`);
  await p.waitForSelector('[data-testid="portal-error"]', { timeout: 8000 }).catch(() => null);
  return (await p.getByText("등록되지 않은 사번").count()) === 1;
});

// ── 관리자 ──
const adm = await as("part@powernet.test");
await check("[관리자] 모든 관리자 화면이 오류 없이 열린다", async () => {
  for (const p of ["/admin", "/admin/bonus", "/admin/final", "/admin/results", "/admin/setup", "/admin/settings", "/admin/vault", `/admin/forms/${kim}`, "/report"]) {
    const r = await open(adm, p, "관리자");
    if (r.status !== 200 || !r.url.startsWith(p.split("?")[0]!)) return false;
  }
  return true;
});

// ── 최종평가 단계로 넘긴 뒤 ──
await adm.goto(`${BASE}/admin`);
await sql`update review_cycles set second_end = ${plus(-1)} where id = ${cycleId}`;
await adm.reload();
const adv = adm.getByRole("button", { name: /최종평가로 넘기기|다음 단계/ });
if (await adv.count()) {
  await adv.first().click();
  const confirm = adm.getByRole("button", { name: /넘기기/ }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await adm.waitForTimeout(2500);
}
const [st] = await sql`select status from review_cycles where id = ${cycleId}`;
await check("[관리자] 2차평가 단계에서 최종평가로 넘길 수 있다", async () => st!.status === "final_review");
await check("[대표이사] 최종평가 단계부터 등급 결과 표가 보이고, 업적 글·항목 점수는 보이지 않는다", async () => {
  const r = await open(ceo, "/report", "대표이사");
  return r.text.includes("최팀장") && r.text.includes("최종점수") && r.text.includes("등급") && !r.text.includes("업적 글") && !r.text.includes("아직 보고할 결과가 없습니다");
});
await check("[팀장] 최종평가 단계에서는 평가 화면이 보기 전용이다", async () => {
  await open(lead, `/me/review/first/${kim}`, "팀장");
  return (await lead.locator("input:not([disabled])").count()) === 0;
});
await check("[직원] 최종평가 단계에도 내 평가결과는 아직 보이지 않는다 (확정·발송 전)", async () => (await open(emp, "/me/result", "직원")).text.includes("아직 결과가 나오지 않았습니다"));

await check("모든 사용자·화면에서 \"문제가 생겼습니다\"(서버 오류)가 한 번도 나오지 않았다", async () => {
  if (errors.length) console.log("오류 화면:", errors);
  return errors.length === 0;
});

await b.close();
await sql.end();
process.exit(summary());
