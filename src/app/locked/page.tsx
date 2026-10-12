import { Lock } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** 보안 열쇠가 잠긴 동안 직원·대표이사에게 보이는 안내 (ADR-0021). 아무 정보도 읽지 않는다 */
export default function LockedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-md" data-testid="locked">
        <CardHeader>
          <Lock className="size-6 text-muted-foreground" aria-hidden="true" />
          <CardTitle>잠시 이용할 수 없습니다</CardTitle>
          <CardDescription>서버 점검 뒤 인사담당자가 보안 확인을 하고 있습니다. 잠시 뒤 다시 열어 주세요. 계속 열리지 않으면 인사담당자에게 알려 주세요.</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
