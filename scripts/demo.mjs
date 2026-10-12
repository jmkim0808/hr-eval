// PC 시험 모드 도우미 (Windows·Mac 공통). 가짜 명단으로만 쓴다.
//   node scripts/demo.mjs setup  — 처음 한 번: 설정 파일·시험용 DB·설치·빌드
//   node scripts/demo.mjs start  — 켜기 (브라우저에서 시험용 포털이 열린다)
//   node scripts/demo.mjs reset  — 시험 데이터를 모두 지우고 처음 상태로 (서버를 끈 뒤)
import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const PORT = 3000;
const DB = "hr_eval_demo";
const HOME = `http://127.0.0.1:${PORT}/hr-eval`;
const win = process.platform === "win32";
const say = (s) => console.log(`\n▶ ${s}`);
const die = (s) => {
  console.error(`\n✖ ${s}`);
  process.exit(1);
};

const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 20 || (maj === 20 && min < 9)) die(`Node.js 20.9 이상이 필요합니다 (지금 ${process.versions.node}). https://nodejs.org 에서 LTS를 설치해 주세요.`);

// 입력을 줄 단위로 모아 두었다가 차례로 쓴다 (미리 붙여 넣어도 잃지 않음)
let lines;
async function ask(q) {
  process.stdout.write(q);
  lines ??= createInterface({ input: process.stdin })[Symbol.asyncIterator]();
  const r = await lines.next();
  return r.done ? "" : r.value.trim();
}

function readEnv() {
  const env = {};
  if (!existsSync(".env.local")) return env;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}
function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: win, env: { ...process.env, ...env } });
  if (r.status !== 0) die(`실패: ${cmd} ${args.join(" ")}`);
}
async function admin(url, fn) {
  const { default: postgres } = await import("postgres");
  const u = new URL(url);
  u.pathname = "/postgres";
  const sql = postgres(u.toString(), { max: 1, onnotice: () => {} });
  try {
    await fn(sql);
  } finally {
    await sql.end();
  }
}

async function setup() {
  if (!existsSync("node_modules")) {
    say("프로그램 부품 설치 (몇 분 걸립니다)");
    run("npm", ["ci"]);
  }
  if (!existsSync(".env.local")) {
    say("PostgreSQL 연결 정보");
    const user = (await ask("  PostgreSQL 사용자 이름 [postgres]: ")) || "postgres";
    const pass = await ask("  PostgreSQL 설치 때 정한 비밀번호: ");
    const r = () => randomBytes(24).toString("base64url");
    const url = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@127.0.0.1:5432/${DB}`;
    writeFileSync(
      ".env.local",
      [
        "# PC 시험 모드 설정 (저장소에 올라가지 않음). 실제 운영 서버에는 쓰지 않는다.",
        `DATABASE_URL=${url}`,
        `AUTH_SECRET=${r()}`,
        `JWT_SECRET_KEY=${r()}`,
        `CRON_SECRET=${r()}`,
        `APP_URL=${HOME}`,
        "BASE_PATH=/hr-eval",
        "MAIL_MODE=log",
        "HR_DEMO=on",
        "",
      ].join("\n"),
    );
  }
  const env = readEnv();
  say(`시험용 DB(${DB}) 만들기`);
  try {
    await admin(env.DATABASE_URL, async (sql) => {
      const [x] = await sql`select 1 from pg_database where datname = ${DB}`;
      if (!x) await sql.unsafe(`create database ${DB}`);
    });
  } catch (e) {
    die(`PostgreSQL에 연결하지 못했습니다 (${e.message}). PostgreSQL이 켜져 있는지, 비밀번호가 맞는지 확인한 뒤 .env.local 파일을 지우고 다시 실행해 주세요.`);
  }
  say("표 만들기");
  run("npx", ["tsx", "scripts/migrate.ts"], env);
  say("가짜 관리자·대표이사, 시험용 명단 엑셀 만들기");
  run("npx", ["tsx", "scripts/seed-demo.ts"], env);
  say("빌드 (1~2분)");
  run("npm", ["run", "build"], env);
  console.log("\n✔ 준비 끝. 이제 [시험-켜기]를 실행하세요.");
}

async function start() {
  if (!existsSync(".next/standalone/server.js")) die("먼저 [시험-설치]를 실행해 주세요.");
  say(`켜는 중… 끄려면 이 창을 닫거나 Ctrl+C`);
  const child = spawn(process.execPath, ["scripts/start.mjs", "--port", String(PORT)], { stdio: "inherit", env: { ...process.env, ...readEnv() } });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const ok = await fetch(`${HOME}/health`).then((r) => r.ok).catch(() => false);
    if (ok) {
      console.log(`\n✔ 켜졌습니다: ${HOME}/dev`);
      const open = win ? ["cmd", ["/c", "start", "", `${HOME}/dev`]] : process.platform === "darwin" ? ["open", [`${HOME}/dev`]] : ["xdg-open", [`${HOME}/dev`]];
      const o = spawn(open[0], open[1], { stdio: "ignore", detached: true });
      o.on("error", () => console.log("브라우저를 열지 못했습니다. 위 주소를 브라우저에 직접 넣어 주세요."));
      o.unref();
      break;
    }
  }
  child.on("exit", (c) => process.exit(c ?? 0));
}

async function reset() {
  const env = readEnv();
  if (env.HR_DEMO !== "on") die("시험 모드 설정(.env.local)이 아닙니다.");
  const yes = await ask("시험 데이터(명단·점수·보안 열쇠)를 모두 지웁니다. 계속할까요? (y/N) ");
  if (yes.toLowerCase() !== "y") return;
  await admin(env.DATABASE_URL, async (sql) => {
    await sql.unsafe(`drop database if exists ${DB} with (force)`);
    await sql.unsafe(`create database ${DB}`);
  });
  run("npx", ["tsx", "scripts/migrate.ts"], env);
  run("npx", ["tsx", "scripts/seed-demo.ts"], env);
  console.log("\n✔ 처음 상태로 돌렸습니다. [시험-켜기]로 다시 켜세요.");
}

const cmd = process.argv[2];
if (cmd === "setup") await setup();
else if (cmd === "start") await start();
else if (cmd === "reset") await reset();
else die("사용법: node scripts/demo.mjs setup | start | reset");
if (cmd !== "start") process.exit(0);
