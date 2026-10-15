// 2026-10-15 피드백: 관리자가 가점을 넣거나 고치는 즉시 직원 본인에게 보이고(잠정치), 바뀐 기록이 남고, 직원이 정정을 요청할 수 있다.
// 평가자(1차 팀장)에게는 여전히 보이지 않는다.
import { BASE, browser, check, D, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff, invited_at)
  values (${year}, 'first_review', ${plus(-5)}, ${plus(-1)}, ${plus(0)}, ${plus(3)}, ${plus(4)}, ${plus(7)}, ${plus(10)}, now()) returning id`;
const cycleId = cyc!.id as string;
let no = 0;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", employee_no: `G${String(++no).padStart(3, "0")}`, ...v })} returning id`;
  return r!.id as string;
};
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
const kim = await person({ email: "kim@powernet.test", name: "김대리", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
await sql`insert into evaluations (person_id, self_submitted_at) values (${kim}, now())`.catch(() => null);

const b = await browser();
const me = await (await b.newContext({ viewport: { width: 1200, height: 1000 } })).newPage();
await login(me, "kim@powernet.test");
await me.goto(`${BASE}/me`);
await check("[직원] 내 할 일에 '내 가점 확인'이 있다", async () => (await me.locator('[data-task="bonus"] a[href$="/me/bonus"]').count()) === 1);
await me.goto(`${BASE}/me/bonus`);
await check("[직원] 가점을 아직 안 넣었으면 '아직 가점이 들어오지 않았습니다'와 잠정치 안내가 보인다", async () =>
  (await me.locator("main").innerText()).includes("아직 가점이 들어오지 않았습니다") && (await me.getByTestId("bonus-provisional").count()) === 1,
);

// 관리자 1차 반영
const adm = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await login(adm, "part@powernet.test");
const enter = async (vals: Record<string, string>) => {
  await adm.goto(`${BASE}/admin/bonus`);
  await adm.locator('tr[data-person="김대리"]').click();
  await adm.waitForSelector('[role="dialog"]');
  for (const [k, v] of Object.entries(vals)) await adm.fill(`#b-${k}`, v);
  await adm.getByRole("button", { name: "저장" }).click();
  await adm.waitForTimeout(1500);
};
await check("[관리자] 가점 화면에 '넣으면 즉시 직원 본인에게 보이고 평가자에게는 안 보인다'는 안내가 있다", async () => {
  await adm.goto(`${BASE}/admin/bonus`);
  return (await adm.locator("main").innerText()).includes("그 즉시 직원 본인 화면");
});
await enter({ certificate: "1", education: "0.5" });
await me.reload();
await check("[직원] 관리자가 1차로 넣자마자 항목별 점수·합계가 보이고, 기록에 '처음 반영'이 남는다", async () => {
  const t = await me.getByTestId("bonus-history").innerText();
  return (await me.getByTestId("my-bonus-total").innerText()) === "1.5" && t.includes("처음 반영") && (await me.locator('[data-item="multi_rater"]').count()) === 0;
});

// 정기포상 추가 + 정정
await enter({ award: "2", certificate: "0.5" });
await me.reload();
await check("[직원] 정기포상 추가·정정 뒤 바로 합계가 바뀌고 기록에 '1 → 0.5', '0 → 2'처럼 남는다", async () => {
  const t = await me.getByTestId("bonus-history").innerText();
  return (await me.getByTestId("my-bonus-total").innerText()) === "3" && t.includes("1 → 0.5") && t.includes("0 → 2");
});
await check("이력의 점수는 암호화되어 저장된다", async () => {
  const rows = await sql`select to_points from bonus_history h join cycle_people p on p.id = h.person_id where p.id = ${kim}`;
  return rows.length === 4 && rows.every((r) => String(r.to_points).startsWith("e1:")) && rows.some((r) => D(r.to_points as string) === "2");
});

// 정정 요청
await me.fill("#fix-message", "교육참여도 1점이 맞습니다. 상반기 교육 2건 수료");
await me.getByRole("button", { name: "정정 요청 보내기" }).click();
await me.getByTestId("fix-sent").waitFor({ timeout: 10000 }).catch(() => null);
await check("[직원] 정정 요청을 보내면 '확인 중'으로 남고, 관리자에게는 내용·이름 없이 알림 메일만 간다", async () => {
  const [r] = await sql`select message from bonus_requests where person_id = ${kim}`;
  const mails = await sql`select payload from email_outbox where kind = 'admin_alert'`;
  const body = JSON.stringify(mails.map((m) => m.payload));
  return String(r!.message).startsWith("e1:") && (await me.getByTestId("my-requests").innerText()).includes("확인 중") && mails.length >= 1 && !body.includes("김대리") && !body.includes("교육");
});
await enter({ education: "1" });
await adm.locator('[data-request="김대리"] input').fill("교육 1점으로 고쳤습니다");
await adm.locator('[data-request="김대리"]').getByRole("button", { name: "처리 완료" }).click();
await adm.waitForTimeout(1500);
await me.reload();
await check("[관리자] 정정 요청을 보고 고친 뒤 [처리 완료]하면 직원 화면에 '처리 완료'와 답변, 바뀐 합계가 보인다", async () => {
  const t = await me.getByTestId("my-requests").innerText();
  return t.includes("처리 완료") && t.includes("교육 1점으로 고쳤습니다") && (await me.getByTestId("my-bonus-total").innerText()) === "3.5";
});

// 평가자에게는 안 보인다
const lead = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(lead, "lead@powernet.test");
await lead.goto(`${BASE}/me/review/first/${kim}`);
await lead.waitForLoadState("networkidle");
await check("[1차 평가자] 평가 화면과 페이지 원본 어디에도 가점이 없다", async () => {
  const html = await lead.content();
  return !html.includes("가점") && !/[^-]3\.5[^0-9]/.test(html.replace(/size-3\.5/g, ""));
});
await check("[1차 평가자] 남의 /me/bonus는 자기 것만 보인다 (김대리 가점 아님)", async () => {
  await lead.goto(`${BASE}/me/bonus`);
  return !(await lead.locator("main").innerText()).includes("3.5");
});

await b.close();
await sql.end();
process.exit(summary());
