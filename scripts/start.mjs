// 포털 실행 명령 (ax-app.yaml의 start): node scripts/start.mjs --port <배정 포트>
// 127.0.0.1 에서만 연다(사양 2-6). 포트는 --port 또는 환경변수 PORT 로 받는다(하드코딩하지 않음).
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const i = process.argv.indexOf("--port");
const port = i > 0 ? process.argv[i + 1] : process.env.PORT;
if (!port || !/^\d+$/.test(port)) {
  console.error("포트를 알려 주세요: node scripts/start.mjs --port 3200 (또는 환경변수 PORT)");
  process.exit(1);
}
process.env.PORT = port;
process.env.HOSTNAME = "127.0.0.1";
const server = resolve(".next/standalone/server.js");
if (!existsSync(server)) {
  console.error("먼저 npm run build 를 실행해 주세요.");
  process.exit(1);
}
process.chdir(resolve(".next/standalone"));
await import(pathToFileURL(server).href);
