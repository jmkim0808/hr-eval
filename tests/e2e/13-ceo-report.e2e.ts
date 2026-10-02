// PRD 13 확인 문장을 화면에서 점검한다. 가짜 명단.
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
await sql`insert into app_users (email, name, role) values ('ceo@powernet.test', '대표이사', 'ceo') on conflict (email) do update set role = 'ceo', active = true`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'second_review', '2026-09-01', '2026-09-05', '2026-09-08', '2026-09-12', '2026-09-15', '2026-09-19', '2026-09-05') returning id`;
const cycleId = cyc!.id as string;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
const ITEMS = ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust", "achievement"];
async function scores(personId: string, rater: "first" | "second", v: number) {
  const [ev] = await sql`insert into evaluations (person_id, achievement_text, version) values (${personId}, '비밀 업적 글', 1) on conflict (person_id) do update set version = evaluations.version returning id`;
  for (const c of ITEMS) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, ${rater}, ${c}, ${v})`;
}
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
const names = ["일번", "이번", "삼번", "사번", "오번", "육번", "칠번", "팔번", "구번", "십번"];
const sc: [number, number][] = [[10, 10], [10, 9], [9, 9], [9, 8], [8, 8], [8, 7], [7, 7], [7, 6], [6, 6], [5, 5]];
for (let i = 0; i < 10; i++) {
  const id = await person({ email: `${names[i]}@powernet.test`, name: names[i], grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
  await scores(id, "first", sc[i]![0]);
  await scores(id, "second", sc[i]![1]);
  await sql`insert into bonus_points (person_id, item, points) values (${id}, 'certificate', 1.25)`;
}

const b = await browser();
const cp = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(cp, "ceo@powernet.test");
await cp.goto(`${BASE}/`);
await cp.waitForURL(`${BASE}/report`);
await check("대표이사가 인증하면 바로 등급 결과가 열리고 메뉴가 없다", async () =>
  (await cp.getByRole("heading", { name: "등급 결과" }).count()) === 1 && (await cp.getByRole("navigation", { name: "관리자 메뉴" }).count()) === 0 && (await cp.getByText("진행 현황").count()) === 0,
);
await check("최종평가 전에는 \"아직 보고할 결과가 없습니다\"가 보인다", async () => (await cp.getByText("아직 보고할 결과가 없습니다").count()) === 1);

const ap = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(ap, "part@powernet.test");
await ap.goto(`${BASE}/admin`);
await ap.getByRole("button", { name: "다음 단계로 넘기기" }).click();
await ap.getByRole("button", { name: "넘기기", exact: true }).click();
await ap.waitForTimeout(1500);

await cp.goto(`${BASE}/report?group=5`);
const gradeOf = async (n: string) => (await cp.locator(`tr[data-person="${n}"] td`).nth(5).innerText()).trim();
const g0 = await gradeOf("삼번");
await check("대표이사 화면에는 고치는 칸과 버튼이 하나도 없다", async () => (await cp.locator("main input, main select, main textarea, main button").count()) === 0);
await check("업적 글, 항목별 점수, 가점 내역은 보이지 않는다", async () => {
  const html = await cp.content();
  const text = await cp.locator("main").innerText();
  return !html.includes("비밀 업적 글") && !/가점|1차|2차|역량|업적/.test(text) && !/>1\.25</.test(html) && !/bonus|competency|achievement/i.test(html);
});
await cp.screenshot({ path: "/tmp/hr-e2e/13-report.png", fullPage: true });

// 관리자가 조정 적용 → 대표이사 화면은 새로고침 없이 10초 안에 바뀐다
await ap.goto(`${BASE}/admin/final?group=5`);
await ap.locator('tr[data-person="삼번"]').getByRole("combobox").selectOption("S");
await ap.waitForSelector('[role="alertdialog"]');
await ap.getByRole("button", { name: "적용" }).click();
const t0 = Date.now();
await cp.locator('tr[data-person="삼번"]').getByText("조정 · 상향").waitFor({ timeout: 12000 }).catch(() => null);
const took = Date.now() - t0;
await check("관리자가 [적용]하면 10초 안에 대표이사 화면의 등급과 조정 표시가 바뀐다", async () =>
  g0 === "A" && (await gradeOf("삼번")) === "S" && (await cp.locator('tr[data-person="일번"]').getByText("밀려남 · 하향").count()) === 1 && took <= 11000,
);

await b.close();
await sql.end();
process.exit(summary());
