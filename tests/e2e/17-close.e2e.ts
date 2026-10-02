// PRD 17 확인 문장을 화면에서 점검한다. 가짜 명단.
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'second_review', '2026-09-01', '2026-09-05', '2026-09-08', '2026-09-12', '2026-09-15', '2026-09-19', '2026-09-05') returning id`;
const cycleId = cyc!.id as string;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
const MEMBER = ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust", "achievement"];
const LEADER = ["responsibility", "teamwork", "discipline", "objectivity", "knowledge", "information", "contribution", "leadership", "communication", "planning", "achievement"];
async function scores(personId: string, rater: "first" | "second", v: number, codes = MEMBER) {
  const [ev] = await sql`insert into evaluations (person_id, version, self_submitted_at, achievement_text) values (${personId}, 1, now(), '업적') on conflict (person_id) do update set version = evaluations.version returning id`;
  for (const c of codes) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, ${rater}, ${c}, ${v})`;
}
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
await scores(ld, "first", 8, LEADER);
const ids: Record<string, string> = {};
for (const [name, email, f] of [["일번", "p1@powernet.test", 9], ["이번", "p2@powernet.test", 8], ["삼번", "p3@powernet.test", 7]] as const) {
  ids[name] = await person({ email, name, grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
  await scores(ids[name]!, "first", f);
  await scores(ids[name]!, "second", f);
}

const b = await browser();
const page = await b.newPage({ viewport: { width: 1300, height: 1000 } });
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin`);
await page.getByRole("button", { name: "다음 단계로 넘기기" }).click();
await page.getByRole("button", { name: "넘기기", exact: true }).click();
await page.waitForTimeout(1500);
await page.goto(`${BASE}/admin/final`);
await page.getByRole("button", { name: "확정", exact: true }).click();
await page.locator('[role="alertdialog"]').getByRole("button", { name: "확정", exact: true }).click();
await page.waitForTimeout(1500);
await page.goto(`${BASE}/admin/results`);
await page.getByRole("button", { name: "평가결과 이메일 발송" }).click();
await page.getByRole("button", { name: /명에게 발송/ }).click();
await page.waitForTimeout(2500);
// 한 사람은 메일 실패로
await sql`update email_outbox set status = 'failed', last_error = 'test' where kind = 'result_notice' and to_email = 'p3@powernet.test'`;
await page.reload();

await page.getByRole("button", { name: "평가 마감" }).click();
await page.waitForSelector('[role="alertdialog"]');
const dialog = await page.locator('[role="alertdialog"]').innerText();
await check("[평가 마감]을 누르면 \"연봉조정까지 끝났나요?\" 확인 창이 뜬다", async () => dialog.includes("연봉조정까지 끝났나요?"));
await page.locator('[role="alertdialog"]').getByRole("button", { name: "마감", exact: true }).click();
await page.waitForTimeout(1500);
await check("메일 실패자가 남아 있어도 마감할 수 있고, 실패 명단은 계속 볼 수 있다", async () => {
  await page.reload();
  const [c] = await sql`select status from review_cycles where id = ${cycleId}`;
  return dialog.includes("받지 못한 사람이 1명") && c!.status === "closed" && (await page.getByText("삼번").count()) >= 1 && (await page.getByRole("button", { name: "다시 보내기" }).count()) === 0;
});

await page.goto(`${BASE}/admin`);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const md = `${Number(today.slice(5, 7))}/${Number(today.slice(8, 10))}`;
await check("마감하면 진행 현황에 \"2026년 정기평가 마감 (날짜, 마감자)\"와 단계 줄 전부 ✔가 보인다", async () =>
  (await page.getByTestId("closed-line").innerText()) === `${year}년 정기평가 마감 (${md}, 김파트장)` && (await page.locator("ol li").count()) === 7 && (await page.locator("ol li svg").count()) === 7 && (await page.locator('li[aria-current="step"]').count()) === 0,
);
await check("보관 기한(마감일 + 3년)이 보인다", async () => (await page.getByTestId("retention").innerText()).includes(`보관 기한 ${Number(today.slice(0, 4)) + 3}${today.slice(4)} (마감 + 3년)`));
await page.screenshot({ path: "/tmp/hr-e2e/17-closed.png", fullPage: true });

await check("마감 뒤에는 모든 화면이 보기 전용이다", async () => {
  const editable: string[] = [];
  for (const path of ["/admin", "/admin/setup", "/admin/bonus", "/admin/final?group=5", "/admin/results", `/admin/final/fill/${ids["일번"]}`]) {
    await page.goto(`${BASE}${path}`);
    const n = await page.locator("main").locator("input:not([disabled]):not([type=file]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])").count();
    const btns = (await page.locator("main button:not([disabled])").allInnerTexts()).filter((t) => !/백업|내려받기|템플릿 내려받기|최종결과 엑셀/.test(t));
    if (n > 0 || btns.length > 0) editable.push(`${path}: ${n} ${btns.join("|")}`);
  }
  const ep = await (await b.newContext()).newPage();
  await login(ep, "p1@powernet.test");
  await ep.goto(`${BASE}/me/form/${ids["일번"]}`);
  if ((await ep.locator("main textarea:not([disabled]), main button:not([disabled])").count()) > 0) editable.push("self form");
  if (editable.length) console.log(editable);
  return editable.length === 0;
});

await b.close();
await sql.end();
process.exit(summary());
