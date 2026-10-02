// PRD 16 확인 문장을 화면에서 점검한다. 가짜 명단.
import { readFileSync } from "node:fs";
import { BASE, LOG, browser, check, login, logSize, sql, summary } from "./helpers";

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
  const [ev] = await sql`insert into evaluations (person_id, version) values (${personId}, 1) on conflict (person_id) do update set version = evaluations.version returning id`;
  for (const c of codes) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, ${rater}, ${c}, ${v})`;
}
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
await scores(ld, "first", 8, LEADER);
const ids: Record<string, string> = {};
const EMAIL: Record<string, string> = { 일번: "p1@powernet.test", 이번: "p2@powernet.test", 삼번: "p3@powernet.test", 사번: "p4@powernet.test", 오번: "p5@powernet.test" };
for (const [name, f, s] of [["일번", 10, 10], ["이번", 9, 9], ["삼번", 9, 8], ["사번", 8, 8], ["오번", 7, 7]] as const) {
  ids[name] = await person({ email: EMAIL[name], name, grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
  await scores(ids[name]!, "first", f);
  await scores(ids[name]!, "second", s);
}
for (const [item, v] of [["certificate", 1.5], ["discipline", -0.5]] as const) await sql`insert into bonus_points (person_id, item, points) values (${ids["사번"]!}, ${item}, ${v})`;

const b = await browser();
const ap = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(ap, "part@powernet.test");
await ap.goto(`${BASE}/admin`);
await ap.getByRole("button", { name: "다음 단계로 넘기기" }).click();
await ap.getByRole("button", { name: "넘기기", exact: true }).click();
await ap.waitForTimeout(1500);
// 사번 B → C (오번이 B로 올라감)
await ap.goto(`${BASE}/admin/final?group=5`);
await ap.locator('tr[data-person="사번"]').getByRole("combobox").selectOption("C");
await ap.waitForSelector('[role="alertdialog"]');
await ap.getByRole("button", { name: "적용" }).click();
await ap.waitForTimeout(1500);
await ap.reload();
const fin4 = (await ap.locator('tr[data-person="사번"] td').nth(7).innerText()).trim();
await ap.getByRole("button", { name: "확정", exact: true }).click();
await ap.locator('[role="alertdialog"]').getByRole("button", { name: "확정", exact: true }).click();
await ap.waitForTimeout(1500);

const sp = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(sp, "p4@powernet.test");
await sp.goto(`${BASE}/me/result`);
await check("발송 전에는 내 평가결과가 \"아직 결과가 나오지 않았습니다\"로 보인다", async () => (await sp.getByText("아직 결과가 나오지 않았습니다").count()) === 1);

const mark = logSize();
await ap.goto(`${BASE}/admin/results`);
await ap.getByRole("button", { name: "평가결과 이메일 발송" }).click();
await ap.getByRole("button", { name: /명에게 발송/ }).click();
await ap.waitForTimeout(2500);
const mail = readFileSync(LOG, "utf8").slice(mark).split("[mail:log]").find((m) => m.includes("사번 님"));
await check("받은 메일에 점수·등급이 없고 \"결과가 나왔습니다\"와 링크만 있다", async () =>
  !!mail && mail.includes("결과가 나왔습니다") && mail.includes("/login?email=") && !/\d+\.\d|점수|등급|상위|[SABCD] /.test(mail.replace(/\d{4}년/g, "")),
);

await sp.goto(`${BASE}/me`);
const hasTask = (await sp.getByText("평가결과가 나왔습니다").count()) === 1;
await sp.getByText("평가결과가 나왔습니다").click();
await sp.waitForURL(`${BASE}/me/result`);
const text = await sp.locator("main").innerText();
await check("인증하면 내 평가결과에 1차 점수, 2차 점수, 가점(항목별), 최종점수, 평가등급, 상위 %가 보인다", async () =>
  hasTask && ["1차 점수", "2차 점수", "자격증", "징계사항", "최종점수", "평가등급", "상위"].every((w) => text.includes(w)) && text.includes("80.00") && text.includes("1.5") && text.includes("-0.5"),
);
await check("등급조정된 사람도 최종점수는 실제 점수 그대로이고, 등급과 상위 %는 그 등급 경계 득점자의 값으로 보인다", async () =>
  (await sp.getByTestId("my-final").innerText()) === fin4 && (await sp.getByTestId("my-grade").innerText()) === "C" && (await sp.getByTestId("my-percentile").innerText()) === "상위 100.0%",
);
await check("\"조정\", \"밀려남\" 같은 말은 어디에도 보이지 않는다", async () => {
  const html = await sp.content();
  const op = await (await b.newContext()).newPage();
  await login(op, "p5@powernet.test");
  await op.goto(`${BASE}/me/result`);
  const html2 = await op.content();
  return ![html, html2].some((h) => /조정|밀려|올라감|adjusted|pushed|changeKind|draft/i.test(h));
});
await sp.screenshot({ path: "/tmp/hr-e2e/16-result.png", fullPage: true });
const res = await sp.goto(`${BASE}/me/result/${ids["일번"]}`);
await sp.goto(`${BASE}/me/result?person=${ids["일번"]}`);
await check("다른 사람의 결과 주소를 넣어도 열리지 않는다", async () => res?.status() === 404 && (await sp.locator("main").innerText()).includes("사번") && !(await sp.locator("main").innerText()).includes("일번"));

await ap.goto(`${BASE}/admin/results`);
await check("관리자 작업 기록에 \"결과 열람 (이름, 시각)\"이 남는다", async () =>
  (await ap.locator('tr[data-person="사번"]').getByText(/결과 열람 \(사번, .+\)/).count()) === 1 && (await ap.locator('tr[data-person="일번"]').getByText("아직 열지 않음").count()) === 1,
);

await b.close();
await sql.end();
process.exit(summary());
