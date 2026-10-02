// PRD 02 확인 문장을 화면에서 점검한다.
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { BASE, browser, check, login, sql, summary } from "./helpers";

const H = ["이름", "이메일", "부서", "직급", "입사일", "팀장 여부", "담당 임원"];
async function xlsx(path: string, rows: (string | Date)[][], headers = H) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("직원 명단");
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  writeFileSync(path, Buffer.from(await wb.xlsx.writeBuffer()));
}
const EX = "exec@powernet.test";
const base: (string | Date)[][] = [
  ["정임원", EX, "", "상무", "2010-03-02", "아니오", ""],
  ["최팀장", "lead1@powernet.test", "영업1팀", "부장", "2015-07-01", "예", EX],
  ["김대리", "kim@powernet.test", "영업1팀", "대리", new Date("2021-03-02"), "아니오", EX],
  ["박과장", "park@powernet.test", "영업1팀", "과장", "2019-01-15", "아니오", EX],
  ["한신입", "new@powernet.test", "영업1팀", "사원", "2026-07-01", "아니오", EX],
  ["오팀장", "lead2@powernet.test", "품질팀", "차장", "2016-01-01", "예", EX],
  ["윤사원", "yoon@powernet.test", "품질팀", "사원", "2026-06-30", "아니오", EX],
];
const T = "/tmp/hr-e2e";
await import("node:fs").then((fs) => fs.mkdirSync(T, { recursive: true }));
await xlsx(`${T}/ok.xlsx`, base);
await xlsx(`${T}/blank-email.xlsx`, [...base, ["이메일없음", "", "품질팀", "대리", "2020-01-01", "아니오", EX]]);
await xlsx(`${T}/bad-header.xlsx`, base, ["성명", ...H.slice(1)]);
writeFileSync(`${T}/not.csv`, "a,b");
await xlsx(`${T}/second.xlsx`, base.slice(0, 4));

await sql`delete from cycle_people`;
await sql`delete from review_cycles`;

const b = await browser();
const page = await b.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin/setup`);

const dl = page.waitForEvent("download");
await page.click('button:has-text("템플릿 내려받기")');
const file = await (await dl).path();
await check("[템플릿 내려받기]로 받은 엑셀의 제목 줄이 이름·이메일·부서·직급·입사일·팀장 여부·담당 임원이다", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file!);
  const row = wb.worksheets[0]!.getRow(1).values as unknown[];
  return row.slice(1).join("|") === H.join("|");
});

async function upload(path: string) {
  await page.setInputFiles('input[type="file"]', path);
  await page.waitForTimeout(1500);
}

await upload(`${T}/bad-header.xlsx`);
await check("제목 줄이 템플릿과 다르면 반영 전에 이유가 보인다", async () => (await page.getByText("제목 줄이 템플릿과 다릅니다").count()) === 1);
await upload(`${T}/not.csv`);
await check(".xlsx가 아니면 반영 전에 이유가 보인다", async () => (await page.getByText(".xlsx 파일만 올릴 수 있습니다").count()) === 1);

await upload(`${T}/blank-email.xlsx`);
await check("이메일이 빈 줄이 있으면 \"확인 필요\"로 나오고 [반영하기]가 눌리지 않는다", async () =>
  (await page.getByText("확인 필요 1명").count()) === 1 && (await page.locator('button:has-text("반영하기")').isDisabled()),
);

await upload(`${T}/ok.xlsx`);
await check("7월 1일 이후 입사자는 미리보기에서 \"제외\"로 나온다", async () => (await page.getByText("제외 1명").count()) >= 1);
await page.click('button:has-text("반영하기")');
await page.waitForSelector("text=반영 완료");
await page.reload();
const rowOf = (name: string) => page.locator("tbody tr").filter({ has: page.locator("td:first-child", { hasText: new RegExp(`^${name}$`) }) });
await check("7월 1일 이후 입사자는 대상자 표에 들어가지 않는다", async () => (await rowOf("한신입").count()) === 0 && (await rowOf("윤사원").count()) === 1);
await check("팀장 여부가 \"예\"인 사람은 팀장용, 1차 평가자가 담당 임원, 2차 평가자가 \"—\"이다", async () => {
  const r = rowOf("최팀장");
  const sel = await r.locator("select").first().evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]!.text);
  return (await r.getByText("팀장용").count()) === 1 && sel.startsWith("정임원") && (await r.locator("select").count()) === 1;
});
await check("팀원의 1차 평가자는 같은 부서 팀장, 2차 평가자는 담당 임원이다", async () => {
  const s = rowOf("김대리").locator("select");
  const t = await s.evaluateAll((els) => els.map((e) => (e as HTMLSelectElement).options[(e as HTMLSelectElement).selectedIndex]!.text));
  return t[0]!.startsWith("최팀장") && t[1]!.startsWith("정임원");
});
await check("직급이 대리이하인 사람은 5그룹, 팀장은 1그룹으로 보인다", async () =>
  (await rowOf("김대리").getByText("5그룹 대리이하").count()) === 1 && (await rowOf("최팀장").getByText("1그룹 팀장").count()) === 1,
);
const options = await rowOf("박과장").locator("select").first().locator("option").allTextContents();
const other = options.find((o) => o.startsWith("오팀장"))!;
await rowOf("박과장").locator("select").first().selectOption({ label: other });
await page.waitForTimeout(1200);
await page.reload();
await check("부서이동자의 평가자를 표에서 다른 사람으로 바꾸면 다시 열어도 바뀐 채로 남아 있다", async () =>
  (await rowOf("박과장").locator("select").first().evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]!.text)).startsWith("오팀장"),
);
await upload(`${T}/second.xlsx`);
await page.click('button:has-text("반영하기")');
await page.waitForSelector("text=반영 완료");
await page.reload();
await check("명단을 다시 올리면 이전 명단이 새 명단으로 바뀐다", async () => (await rowOf("오팀장").count()) === 0 && (await rowOf("김대리").count()) === 1);

await upload(`${T}/ok.xlsx`);
await page.click('button:has-text("반영하기")');
await page.waitForSelector("text=반영 완료");
await page.reload();
await page.screenshot({ path: `${process.env.SHOT_DIR ?? "/tmp"}/02-setup.png`, fullPage: true });
await b.close();
await sql.end();
process.exit(summary());
