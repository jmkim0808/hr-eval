// 포털 상태 확인 (사양 5): GET <base_path>/health → 200 {"status":"ok"}. 로그인 없이 열리고 아무 정보도 주지 않는다.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
