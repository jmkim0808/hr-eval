// 포털 실행 명령 (ax-app.yaml의 start): node scripts/start.mjs --port <배정 포트>
// 127.0.0.1 에서만 연다(사양 2-6). 포트는 --port 또는 환경변수 PORT 로 받는다(하드코딩하지 않음).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// PC 시험용: .env.local이 있으면 읽는다 (포털 서버는 환경 값을 직접 넣으므로 이미 있는 값은 덮지 않는다)
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const i = process.argv.indexOf("--port");
const port = i > 0 ? process.argv[i + 1] : process.env.PORT;
if (!port || !/^\d+$/.test(port)) {
  console.error("포트를 알려 주세요: node scripts/start.mjs --port 3200 (또는 환경변수 PORT)");
  process.exit(1);
}
process.env.PORT = port;
// 사내망 팀 시험(시험-팀공유)만 다른 PC 접속을 연다. 시험 모드(HR_DEMO=on, 메일 안 보냄)일 때만 — 운영에서는 항상 127.0.0.1
const teamShare = process.env.HR_LISTEN_LAN === "on" && process.env.HR_DEMO === "on" && (process.env.MAIL_MODE ?? "log") === "log";
process.env.HOSTNAME = teamShare ? "0.0.0.0" : "127.0.0.1";
const server = resolve(".next/standalone/server.js");
if (!existsSync(server)) {
  console.error("먼저 npm run build 를 실행해 주세요.");
  process.exit(1);
}
process.chdir(resolve(".next/standalone"));
await import(pathToFileURL(server).href);
