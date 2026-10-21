// 메일 발송(SMTP) 사전 시험: 시험 메일 1통을 보내 보고, 안 되면 이유를 알려 준다.
//   node scripts/mail-test.mjs
// 서버(AX플랫폼)에서 돌리면 환경 값(SMTP_HOST·SMTP_PORT·SMTP_USER·SMTP_PASS·MAIL_FROM)을 그대로 쓰고, 없으면 물어본다.
// 비밀번호는 화면에 보이지 않고 어디에도 저장하지 않는다. 메일 본문에는 개인정보·평가 내용이 없다.
import nodemailer from "nodemailer";
import { createInterface } from "node:readline";

// 입력을 줄 단위로 모아 두었다가 차례로 쓴다 (미리 붙여 넣어도 잃지 않음). 비밀번호 칸만 화면에 글자를 보이지 않게 한다
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false;
const write = rl._writeToOutput?.bind(rl);
rl._writeToOutput = (s) => write?.(muted ? (s.includes("\n") ? "\n" : "") : s);
const queue = [];
const waiting = [];
rl.on("line", (l) => (waiting.length ? waiting.shift()(l) : queue.push(l)));
rl.on("close", () => waiting.splice(0).forEach((r) => r("")));
const next = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiting.push(r)));
async function ask(q, def = "") {
  process.stdout.write(def ? `${q} [${def}]: ` : `${q}: `);
  return (await next()).trim() || def;
}
async function askSecret(q) {
  process.stdout.write(`${q}: `);
  muted = true;
  const a = await next();
  muted = false;
  if (!process.stdin.isTTY) process.stdout.write("\n");
  return a;
}

console.log("\n▶ 메일 발송(SMTP) 사전 시험 — 시험 메일 1통을 보냅니다.\n  (다우오피스 관리자 화면 또는 메일 업체에서 받은 값을 넣으세요. 비밀번호는 저장하지 않습니다)\n");
const host = process.env.SMTP_HOST || (await ask("보내는 메일 서버 주소 (SMTP 서버)"));
const port = Number(process.env.SMTP_PORT || (await ask("포트", "465")));
const user = process.env.SMTP_USER || (await ask("보내는 계정 (메일 주소)"));
const pass = process.env.SMTP_PASS || (await askSecret("그 계정의 비밀번호 (화면에 안 보임)"));
const from = process.env.MAIL_FROM || (await ask("보내는 사람 표시", `파워넷 인사평가 <${user}>`));
const to = await ask("시험 메일을 받을 주소 (내 메일)", user);
rl.close();

const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 15000, greetingTimeout: 15000 });

function why(e) {
  const c = e?.code ?? "";
  const m = String(e?.message ?? "");
  if (c === "EAUTH") return "계정 또는 비밀번호가 틀렸거나, 이 계정에 외부 프로그램 발송(SMTP)이 허용되지 않았습니다. 다우오피스 관리자 화면에서 SMTP 사용 허용·앱 전용 비밀번호가 필요한지 확인하세요.";
  if (c === "EDNS" || /ENOTFOUND/.test(m)) return "메일 서버 주소를 찾지 못했습니다. 주소 철자를 확인하세요.";
  if (/closed unexpectedly/i.test(m)) return "서버에 연결은 됐지만 도중에 끊겼습니다. 계정·비밀번호가 맞는지, 포트(465/587)가 맞는지 확인하세요.";
  if (c === "ETIMEDOUT" || c === "ECONNECTION" || /ECONNREFUSED|ETIMEDOUT|timeout/i.test(m))
    return `서버에 연결하지 못했습니다. ① 포트(${port})가 맞는지(보통 465 또는 587) ② 회사 방화벽이 이 PC에서 밖으로 나가는 ${port}번을 막는지 확인하세요. (PC에서 막혀도 AX플랫폼 서버에서는 될 수 있습니다)`;
  if (/certificate|self.signed|TLS|SSL|wrong version/i.test(m)) return `보안 연결(TLS) 방식이 맞지 않습니다. 465가 안 되면 587로, 587이 안 되면 465로 다시 해 보세요.`;
  if (c === "EENVELOPE" || /sender|from/i.test(m)) return "보내는 사람 주소가 계정과 달라 거부됐을 수 있습니다. '보내는 사람 표시'의 <주소>를 계정 주소와 같게 해 보세요.";
  return "알 수 없는 오류입니다. 아래 내용을 캡처해서 알려 주세요.";
}

try {
  console.log("\n… 서버 연결·로그인 확인 중");
  await t.verify();
  console.log("✔ 연결·로그인 성공");
  const when = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date());
  const info = await t.sendMail({ from, to, subject: "[시험] 인사평가 시스템 메일 발송 시험", text: `인사평가 시스템의 메일 발송 시험입니다 (${when}).\n이 메일이 보이면 발송 설정이 맞습니다. 답장하지 않아도 됩니다.` });
  console.log(`✔ 보냈습니다. 받은편지함(없으면 스팸함)을 확인하세요. (서버 응답: ${String(info.response ?? "").slice(0, 60)})`);
  console.log("\n이 값들을 AX플랫폼 환경 설정에 그대로 넣으면 됩니다: SMTP_HOST · SMTP_PORT · SMTP_USER · SMTP_PASS · MAIL_FROM (값은 채팅·메일로 보내지 마세요)");
} catch (e) {
  console.log(`\n✖ 실패: ${why(e)}`);
  console.log(`  (기술 정보: ${e?.code ?? ""} ${String(e?.message ?? "").replaceAll(pass, "***").slice(0, 200)})`);
  process.exitCode = 1;
}
