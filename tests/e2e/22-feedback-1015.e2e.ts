// 2026-10-15 피드백 반영 점검: 기간 변경 안내, 관리자 대신 입력(평가지·점수), 단계 되돌리기, 전체 현황·부서별(가점 즉시 반영),
// 평가자 현황(팀장에게 2차 숨김), 평가 관리(새 정기평가·지난 평가 보기).
import { BASE, browser, check, D, E, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
await sql`update app_users set active = true where email = 'director@powernet.test'`; // 다른 관리자 (되돌리기 알림 받는 사람)
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff, invited_at)
  values (${year}, 'self_review', ${plus(-1)}, ${plus(3)}, ${plus(4)}, ${plus(7)}, ${plus(8)}, ${plus(11)}, ${plus(3)}, now()) returning id`;
const cycleId = cyc!.id as string;
let no = 0;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", employee_no: `F${String(++no).padStart(3, "0")}`, ...v })} returning id`;
  return r!.id as string;
};
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
const kim = await person({ email: "kim@powernet.test", name: "김대리", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
const park = await person({ email: "park@powernet.test", name: "박과장", department: "품질팀", position: "과장", grade_group: 4, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
void park;

const b = await browser();
const adm = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await login(adm, "part@powernet.test");

// ── 기간 변경 안내 ──
await adm.goto(`${BASE}/admin/setup`);
await adm.waitForLoadState("networkidle");
await adm.fill('input[name="selfEnd"]', plus(2));
await adm.click('button:has-text("기간 저장")');
await adm.waitForSelector("text=기간을 저장했습니다");
await adm.getByRole("button", { name: "변경 안내 메일 보내기" }).click();
await adm.getByRole("button", { name: "보내기", exact: true }).click();
await adm.getByTestId("period-change-result").waitFor();
await check("안내 메일을 보낸 뒤 기간을 바꾸면 [변경 안내 메일 보내기]로 대상자·평가자에게 바뀐 일정을 보낸다", async () => {
  const [r] = await sql`select count(*)::int n from email_outbox where kind = 'period_change'`;
  return r!.n === 4 && (await adm.getByTestId("period-change-result").innerText()).includes("4명");
});

// ── 관리자 대신 입력: 본인 평가지 ──
await adm.goto(`${BASE}/admin/proxy/${kim}`);
await adm.waitForSelector("#achievement");
for (const g of await adm.locator('[role="group"]').all()) await g.getByRole("button", { name: "7점" }).click();
await adm.fill("#achievement", "출장 중이라 메일로 받은 업적입니다.");
await adm.fill("#improvement", "내년 계획");
await adm.getByRole("button", { name: "제출" }).click();
await adm.waitForURL(`${BASE}/admin`, { timeout: 15000 }).catch(() => null);
await check("관리자가 출장자의 본인 평가지를 대신 입력·제출할 수 있고, 대신 입력한 관리자가 남는다", async () => {
  const [r] = await sql`select self_submitted_at, self_proxy_by, achievement_text from evaluations where person_id = ${kim}`;
  const [l] = await sql`select count(*)::int n from audit_logs where action = 'self.proxy_submit' and person_id = ${kim}`;
  return !!r?.self_submitted_at && r.self_proxy_by === "part@powernet.test" && D(r.achievement_text) === "출장 중이라 메일로 받은 업적입니다." && l!.n === 1;
});

// ── 되돌리기 ──
await sql`update review_cycles set status = 'first_review', version = version + 1 where id = ${cycleId}`;
await adm.goto(`${BASE}/admin`);
await adm.getByRole("button", { name: "이전 단계로 되돌리기" }).click();
await adm.fill("#rollback-reason", "실수로 넘김");
await adm.getByRole("button", { name: "되돌리기", exact: true }).click();
await adm.waitForTimeout(1500);
await check("[이전 단계로 되돌리기]는 사유를 받아 한 단계 되돌리고, 다른 관리자에게 알리고 기록한다", async () => {
  const [c] = await sql`select status from review_cycles where id = ${cycleId}`;
  const [m] = await sql`select count(*)::int n from email_outbox where kind = 'admin_alert' and to_email = 'director@powernet.test'`;
  const [l] = await sql`select detail from audit_logs where action = 'cycle.rollback' order by created_at desc limit 1`;
  return c!.status === "self_review" && m!.n >= 1 && (l?.detail as { reason?: string })?.reason === "실수로 넘김";
});

// ── 관리자 대신 입력: 평가자 점수 (1차평가 단계, 소수점) ──
await sql`update review_cycles set status = 'first_review', version = version + 1 where id = ${cycleId}`;
await adm.goto(`${BASE}/admin/proxy/${kim}`);
const proxyInputs = adm.locator('[data-proxy="first"] input');
await proxyInputs.first().waitFor();
for (const i of await proxyInputs.all()) await i.fill("8.5");
await adm.getByRole("button", { name: "대신 제출" }).click();
await adm.getByText("대신 입력하고 제출 처리했습니다").waitFor({ timeout: 10000 }).catch(() => null);
await check("1차평가 단계에 관리자가 평가자 점수를 소수점까지 대신 입력·제출할 수 있다 (넣은 관리자 기록)", async () => {
  const rows = await sql`select s.score, s.entered_by from evaluation_scores s join evaluations e on e.id = s.evaluation_id where e.person_id = ${kim} and s.rater = 'first'`;
  const [ev] = await sql`select first_submitted_at from evaluations where person_id = ${kim}`;
  return rows.length === 11 && rows.every((r) => D(r.score as string) === "8.5" && r.entered_by === "part@powernet.test") && !!ev?.first_submitted_at;
});
await check("진행 현황의 평가자 줄에 아직 안 한 사람 이름이 나오고 [대신 입력]으로 바로 간다", async () => {
  await adm.goto(`${BASE}/admin`);
  return (await adm.locator(`a[href$="/admin/proxy/${park}"]`).count()) === 1;
});

// ── 평가자 현황: 팀장에게 2차 숨김 / 임원에게 1·2차 ──
await sql`update review_cycles set status = 'second_review', version = version + 1 where id = ${cycleId}`;
const [kev] = await sql`select id from evaluations where person_id = ${kim}`;
for (const c of ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust", "achievement"])
  await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${kev!.id}, 'second', ${c}, ${E(6.5)})`;
const lead = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(lead, "lead@powernet.test");
await lead.goto(`${BASE}/me/review/first`);
await check("[팀장] 내 평가 현황에 1차 역량·업적·점수가 보이고 2차 점수는 화면과 페이지 원본 어디에도 없다", async () => {
  const t = await lead.locator("main").innerText();
  const html = await lead.content();
  return t.includes("85.0") && t.includes("8.5") && !t.includes("2차 평가") && !t.includes("65.0") && !html.includes("6.5");
});
const exe = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(exe, "exec@powernet.test");
await exe.goto(`${BASE}/me/review/second`);
await check("[임원] 내 평가 현황에 1차·2차 역량·업적·점수가 함께 보인다", async () => {
  const t = await exe.locator("main").innerText();
  return t.includes("2차 평가") && t.includes("85.0") && t.includes("65.0");
});

// ── 전체 현황 · 부서별 (가점 즉시 반영) ──
await sql`insert into bonus_points (person_id, item, points) values (${kim}, 'certificate', ${E(1.5)})`;
await adm.goto(`${BASE}/admin/status`);
await check("[관리자] 전체 현황에 사람별 1차·2차 역량·업적·점수와 가점, 최종점수가 바로 계산되어 보인다 (가점 즉시 반영)", async () => {
  const row = await adm.locator('tr[data-person="김대리"]').innerText();
  // 역량 = 10×(8.5×0.6+6.5×0.4)=77, 업적 = (8.5×0.6+6.5×0.4)×10 = 77 → 77 + 가점 1.5 = 78.5
  return row.includes("85.0") && row.includes("65.0") && row.includes("1.50") && row.includes("78.50");
});
await adm.goto(`${BASE}/admin/status?view=dept`);
await check("[관리자] 부서별 보기는 부서마다 가점·최종점수만 보이고 등급은 없다", async () => {
  const t = await adm.locator("main").innerText();
  return (await adm.locator('[data-section="영업1팀"]').count()) === 1 && (await adm.locator('[data-section="품질팀"]').count()) === 1 && t.includes("78.50") && !/평가등급|등급 [SABCD]/.test(t);
});

// ── 평가 관리 ──
await sql`update review_cycles set status = 'closed', closed_at = now(), closed_by = '김파트장' where id = ${cycleId}`;
await adm.goto(`${BASE}/admin/setup`);
await check("평가가 마감되면 평가 시작 설정은 '평가 관리에서 새 정기평가 만들기'를 안내한다", async () => (await adm.getByTestId("need-new-cycle").count()) === 1);
await adm.goto(`${BASE}/admin/cycles`);
await adm.fill("#new-year", String(year + 1));
await adm.getByRole("button", { name: "새 정기평가 만들기" }).click();
await adm.waitForURL(`${BASE}/admin/setup`, { timeout: 10000 }).catch(() => null);
await check("[평가 관리]에서 다음 해 정기평가를 만들면 평가 시작 설정이 그 해로 열린다", async () => (await adm.locator("main").innerText()).includes(`${year + 1}년 정기평가`));
await adm.goto(`${BASE}/admin/cycles`);
await check("진행 중인 평가가 있으면 새 정기평가를 만들 수 없고, 지난 평가는 목록에 남는다", async () =>
  (await adm.getByRole("button", { name: "새 정기평가 만들기" }).isDisabled()) && (await adm.locator(`tr[data-year="${year}"]`).count()) === 1 && (await adm.locator(`tr[data-year="${year + 1}"]`).count()) === 1,
);
await adm.goto(`${BASE}/admin/cycles/${year}`);
await check("지난 평가 보기는 보기 전용으로 열리고 엑셀·백업을 내려받을 수 있다", async () => {
  const t = await adm.locator("main").innerText();
  return t.includes(`${year}년 정기평가 (지난 평가)`) && (await adm.getByRole("button", { name: /최종결과 엑셀/ }).count()) === 1 && (await adm.getByRole("button", { name: /전체 기록 백업/ }).count()) === 1;
});

// 다음 시험을 위해 정리
await sql`delete from review_cycles where year = ${year + 1}`;
await b.close();
await sql.end();
process.exit(summary());
