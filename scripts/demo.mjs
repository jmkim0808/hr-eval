// PC 시험 모드 도우미 (Windows·Mac 공통). 가짜 명단으로만 쓴다.
//   node scripts/demo.mjs setup  — 처음 한 번: 설정 파일·시험용 DB·설치·빌드
//   node scripts/demo.mjs start  — 켜기 (브라우저에서 시험용 포털이 열린다)
//   node scripts/demo.mjs share  — 사내망 팀 시험: 같은 사내망의 다른 PC에서 내 PC 주소로 접속
//   node scripts/demo.mjs unshare — 팀 공유 때 넣은 방화벽 규칙 지우기 (Windows, 관리자 권한)
//   node scripts/demo.mjs reset  — 시험 데이터를 모두 지우고 처음 상태로 (서버를 끈 뒤)
import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
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

// 가상·VPN 어댑터(WSL·Hyper-V·VirtualBox·VMware 등)는 팀원이 닿을 수 없는 주소라 뺀다
const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|VMnet|Loopback|Bluetooth|TAP|TUN|VPN|Tailscale|ZeroTier|Docker|Npcap/i;
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
/** 사내망 주소 후보: 실제 랜·와이파이, 사내망 대역 우선 */
function lanIps() {
  if (process.env.HR_SHARE_IP) return [process.env.HR_SHARE_IP]; // 주소가 잘못 잡힐 때 직접 지정
  const all = Object.entries(networkInterfaces()).flatMap(([name, ns]) => (ns ?? []).filter((n) => n.family === "IPv4" && !n.internal && !n.address.startsWith("169.254.")).map((n) => ({ name, address: n.address })));
  const real = all.filter((n) => !VIRTUAL.test(n.name));
  const list = real.length ? real : all;
  return [...list.filter((n) => PRIVATE.test(n.address)), ...list.filter((n) => !PRIVATE.test(n.address))].map((n) => `${n.address} (${n.name})`);
}
const ok = (url) => fetch(url, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false);
const quiet = (cmd, args) => spawnSync(cmd, args, { stdio: "ignore", shell: false }).status === 0;

async function start(share = false) {
  if (!existsSync(".next/standalone/server.js")) die("먼저 [시험-설치]를 실행해 주세요.");
  if (await ok(`${HOME}/health`)) die("이미 켜져 있습니다. 다른 검은 창([시험-켜기] 또는 [시험-팀공유])을 모두 닫고 다시 실행해 주세요.");
  const env = readEnv();
  let home = HOME;
  let ips = [];
  if (share) {
    if (env.HR_DEMO !== "on" || (env.MAIL_MODE ?? "log") !== "log") die("시험 모드 설정(.env.local)에서만 팀 공유를 켤 수 있습니다.");
    ips = lanIps();
    if (!ips.length) die("사내망 주소를 찾지 못했습니다. 유선·사내 와이파이에 연결돼 있는지 확인해 주세요.");
    home = `http://${ips[0].split(" ")[0]}:${PORT}/hr-eval`;
    Object.assign(env, { HR_LISTEN_LAN: "on", APP_URL: home }); // 메일함 링크도 팀원이 열 수 있는 주소로
    if (win) {
      // 방화벽: 관리자 권한일 때만 규칙을 넣을 수 있다. 회사 PC는 허용 창이 아예 안 뜨는 경우가 많다
      const isAdmin = quiet("net", ["session"]);
      if (isAdmin) {
        quiet("netsh", ["advfirewall", "firewall", "delete", "rule", "name=hr-eval-test"]);
        const added = quiet("netsh", ["advfirewall", "firewall", "add", "rule", "name=hr-eval-test", "dir=in", "action=allow", "protocol=TCP", `localport=${PORT}`, "profile=any"]);
        console.log(added ? "\n✔ 방화벽에 3000번 허용 규칙을 넣었습니다 (이름 hr-eval-test, 끝나면 [시험-팀공유-정리]로 지우기)." : "\n✖ 방화벽 규칙을 넣지 못했습니다 — 회사 보안 정책이 막는 것 같습니다. 전산 보안 담당에게 3000번 포트 허용을 요청하세요.");
      } else {
        const has = quiet("netsh", ["advfirewall", "firewall", "show", "rule", "name=hr-eval-test"]);
        console.log(has ? "\n✔ 방화벽 허용 규칙(hr-eval-test)이 이미 있습니다." : "\n✖ 관리자 권한이 아니라 방화벽 규칙을 넣지 못했습니다. 팀원이 접속하지 못하면 창을 닫고 [시험-팀공유]를 마우스 오른쪽 → [관리자 권한으로 실행]하세요.");
      }
    }
  }
  say(`켜는 중… (1분쯤) 끄려면 이 창을 닫거나 Ctrl+C`);
  const child = spawn(process.execPath, ["scripts/start.mjs", "--port", String(PORT)], { stdio: "inherit", env: { ...process.env, ...env } });
  child.on("exit", (c) => process.exit(c ?? 0));
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    up = await ok(`${HOME}/health`);
  }
  if (!up) {
    console.log("\n✖ 90초가 지나도 켜지지 않았습니다. 위쪽에 빨간 오류가 있으면 캡처해서 알려 주세요. (PostgreSQL이 켜져 있는지도 확인)");
    return;
  }
  console.log(`\n✔ 켜졌습니다 (이 PC에서): ${HOME}/dev`);
  if (share) {
    const lanOk = await ok(`${home}/health`);
    console.log(lanOk ? `✔ 사내망 주소로도 열립니다: ${home}/health` : `✖ 사내망 주소(${home})로 열리지 않습니다 — 이 PC 안에서도 막힘. 화면을 캡처해서 알려 주세요.`);
    console.log(`\n  ▶ 팀원에게 보낼 주소:  ${home}/dev`);
    if (ips.length > 1) console.log(`    안 열리면 다른 주소 후보: ${ips.slice(1).map((x) => `http://${x.split(" ")[0]}:${PORT}/hr-eval/dev ${x.split(" ").slice(1).join(" ")}`).join(" / ")}`);
    console.log("  (같은 사내망에서만 열립니다. 시험이 끝나면 이 창을 닫으세요. 가짜 명단만 쓰세요.)");
  }
  // 이 PC의 브라우저는 항상 127.0.0.1로 연다 (회사 프록시·방화벽과 상관없이 열림)
  const url = `${HOME}/dev`;
  const open = win ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  const o = spawn(open[0], open[1], { stdio: "ignore", detached: true });
  o.on("error", () => console.log("브라우저를 열지 못했습니다. 위 주소를 브라우저에 직접 넣어 주세요."));
  o.unref();
}

/** 팀 공유 뒤 방화벽 규칙 지우기 (관리자 권한) */
function unshare() {
  if (!win) return console.log("Windows에서만 필요합니다.");
  const okDel = quiet("netsh", ["advfirewall", "firewall", "delete", "rule", "name=hr-eval-test"]);
  console.log(okDel ? "✔ 방화벽 규칙(hr-eval-test)을 지웠습니다." : "규칙이 없거나 관리자 권한이 아닙니다 (마우스 오른쪽 → [관리자 권한으로 실행]).");
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
else if (cmd === "share") await start(true);
else if (cmd === "unshare") unshare();
else if (cmd === "reset") await reset();
else die("사용법: node scripts/demo.mjs setup | start | share | unshare | reset");
if (cmd !== "start") process.exit(0);
