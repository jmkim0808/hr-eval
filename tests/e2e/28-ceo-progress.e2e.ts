// 2026-10-26 대표이사 진행 현황: 제출률·부서별·미제출자 이름만 보이고 점수·평가지 링크·독촉은 없다
import { BASE, browser, check, E, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
await sql`insert into app_users (email, name, role) values ('ceo@powernet.test', '대표이사', 'ceo') on conflict (email) do update set role = 'ceo', active = true`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'self_review', '2026-10-20', '2026-11-07', '2026-11-10', '2026-11-14', '2026-11-17', '2026-11-21', '2026-11-14') returning id`;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cyc!.id, department: "영업1팀", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", second_reviewer_id: ex });
const kim = await person({ email: "kim@powernet.test", name: "김대리", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
await person({ email: "park@powernet.test", name: "박과장", department: "품질팀", grade_group: 4, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
const [ev] = await sql`insert into evaluations (person_id, achievement_text, improvement_text, self_submitted_at, version) values (${kim}, ${E("김대리 비밀 업적 글")}, ${E("개선")}, now(), 2) returning id`;
await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, 'self', 'responsibility', ${E(7)})`;

const b = await browser();
const page = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(page, "ceo@powernet.test");
await page.goto(`${BASE}/report`);
await check("대표이사 화면에 [등급 결과]·[진행 현황] 메뉴가 있고, 최종평가 전에는 진행 현황으로 안내한다", async () =>
  (await page.getByRole("link", { name: "진행 현황" }).count()) === 1 && (await page.getByText("[진행 현황]에서 누가 어디까지").count()) === 1,
);
await page.getByRole("link", { name: "진행 현황" }).click();
await page.waitForURL(/\/report\/progress/);
await check("진행 현황에 단계 줄·제출 수(1 / 3)·부서별 막대가 보인다", async () =>
  (await page.getByTestId("exec-submitted").getAttribute("data-value")) === "1/3" && (await page.getByTestId("exec-depts").count()) === 1,
);
await check("아직 제출하지 않은 사람(최팀장·박과장) 이름·부서·상태만 보이고 제출한 김대리는 없다", async () => {
  const t = await page.getByTestId("exec-pending").innerText();
  return t.includes("최팀장") && t.includes("박과장") && !t.includes("김대리");
});
await check("점수·업적 글·평가지 링크·독촉 단추는 없다", async () => {
  const html = await page.content();
  return !html.includes("김대리 비밀 업적 글") && (await page.locator('main a[href*="/admin/"]').count()) === 0 && (await page.getByRole("button", { name: /독촉/ }).count()) === 0;
});
const res = await page.goto(`${BASE}/admin`);
await check("대표이사는 관리자 진행 현황(/admin)에는 들어갈 수 없다", async () => !page.url().endsWith("/admin") || res?.status() === 404);

await b.close();
await sql.end();
process.exit(summary());
