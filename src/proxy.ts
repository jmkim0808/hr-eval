// 인터넷에 올린 시험 서버(Render 등)용 입구 비밀번호. 시험 모드(HR_DEMO=on, 메일 안 보냄)이고 HR_DEMO_GATE가 있을 때만 막는다.
// 운영(사내 포털)에는 HR_DEMO·HR_DEMO_GATE를 넣지 않으므로 아무 일도 하지 않는다.
import { NextResponse, type NextRequest } from "next/server";

const gate = () => {
  const pass = process.env.HR_DEMO_GATE;
  const demo = process.env.HR_DEMO === "on" && (process.env.MAIL_MODE ?? "log") === "log";
  return demo && pass ? pass : null;
};

function passed(req: NextRequest, pass: string) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Basic ")) return false;
  try {
    const raw = atob(h.slice(6));
    const given = raw.slice(raw.indexOf(":") + 1);
    if (given.length !== pass.length) return false;
    let diff = 0;
    for (let i = 0; i < pass.length; i++) diff |= given.charCodeAt(i) ^ pass.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

export function proxy(req: NextRequest) {
  const pass = gate();
  if (!pass) return NextResponse.next();
  if (!passed(req, pass)) {
    return new NextResponse("시험 서버 비밀번호가 필요합니다.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="hr-eval-test", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
    });
  }
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

// 상태 확인 주소(/health)는 서버 감시용이라 비밀번호 없이 둔다
export const config = { matcher: ["/((?!health$|_next/static|_next/image|favicon).*)"] };
