// 평가자 평균 80점 (2026-10-02 추가): 묶음의 마지막 사람 제출 때 평균 80 ± 0.5, 벗어나면 막고 조정 방법을 알려 준다.
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'first_review', '2026-09-01', '2026-09-05', '2026-10-01', '2026-10-09', '2026-10-12', '2026-10-16', '2026-09-05') returning id`;
const cycleId = cyc!.id as string;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
const ld2 = await person({ email: "lead2@powernet.test", name: "오팀장", department: "품질팀", position: "차장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
const ids: string[] = [];
for (const [email, name] of [["p1@powernet.test", "가나"], ["p2@powernet.test", "다라"], ["p3@powernet.test", "마바"]]) ids.push(await person({ email, name, grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex }));
for (const [email, name] of [["q1@powernet.test", "사아"], ["q2@powernet.test", "자차"]]) await person({ email, name, department: "품질팀", grade_group: 5, form_type: "member", first_reviewer_id: ld2, second_reviewer_id: ex });

const b = await browser();
const page = await b.newPage({ viewport: { width: 1300, height: 1100 } });
await login(page, "lead@powernet.test");
const inputs = () => page.locator('input[aria-label$=" 1차 점수"]');
async function fill(items: string, ach: string) {
  const all = await inputs().all();
  for (let i = 0; i < all.length; i++) await all[i]!.fill(i === all.length - 1 ? ach : items);
}
// 앞의 두 사람은 83점씩 (평균 확인 전이라 제출됨)
for (const id of ids.slice(0, 2)) {
  await page.goto(`${BASE}/me/review/first/${id}`);
  await fill("9", "8");
  await page.getByRole("button", { name: "제출" }).click();
  await page.getByText("제출함").waitFor();
}
await page.goto(`${BASE}/me/review/first/${ids[2]}`);
await fill("8", "8"); // 80점 → 평균 82
await page.waitForTimeout(500);
await check("점수를 넣는 동안 내 평균과 조정 안내가 바로 보인다", async () =>
  (await page.getByTestId("my-average").innerText()) === "82.00점" && (await page.getByTestId("average-advice").innerText()).includes("업적 점수 합계를 1점 낮추면"),
);
await page.getByRole("button", { name: "제출" }).click();
await page.waitForTimeout(1500);
await check("묶음의 마지막 사람을 제출할 때 평균이 80 ± 0.5를 벗어나면 제출이 막히고 몇 점을 어떻게 고칠지 보인다", async () => {
  const t = await page.getByTestId("average-block").innerText();
  const [r] = await sql`select first_submitted_at from evaluations where person_id = ${ids[2]!}`;
  return t.includes("평균이 80점에 맞지 않아 제출할 수 없습니다") && t.includes("지금 평균 82.00점") && t.includes("업적 점수 합계를 1점 낮추면 평균 79.67점") && !r?.first_submitted_at;
});
await page.screenshot({ path: "/tmp/hr-e2e/07b-average.png", fullPage: true });
await inputs().last().fill("7"); // 안내대로 업적 1점 낮춤 → 73점, 평균 79.67
await page.getByRole("button", { name: "제출" }).click();
await page.getByText("제출함").waitFor({ timeout: 8000 }).catch(() => null);
await check("안내대로 고치면 제출된다", async () => {
  const [r] = await sql`select first_submitted_at from evaluations where person_id = ${ids[2]!}`;
  return !!r?.first_submitted_at && (await page.getByTestId("my-average").innerText()) === "79.67점";
});
await check("모두 제출한 뒤 다시 고쳐 평균을 벗어나면 다시 제출할 수 없다", async () => {
  await page.goto(`${BASE}/me/review/first/${ids[0]}`);
  await inputs().last().fill("10"); // 83 → 97
  await page.getByRole("button", { name: "제출" }).click();
  await page.waitForTimeout(1500);
  return (await page.getByTestId("average-block").count()) === 1;
});

const p2 = await (await b.newContext({ viewport: { width: 1300, height: 1100 } })).newPage();
await login(p2, "lead2@powernet.test");
const [q1] = await sql`select id from cycle_people where email = 'q1@powernet.test'`;
await p2.goto(`${BASE}/me/review/first/${q1!.id}`);
await check("맡은 사람이 2명 이하면 평균 규칙을 적용하지 않는다", async () => (await p2.getByText("맡은 사람이 2명 이하라 평균 80점 규칙을 적용하지 않습니다").count()) === 1);

await b.close();
await sql.end();
process.exit(summary());
