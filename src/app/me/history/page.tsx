import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { requireParticipant } from "@/server/authz/actor";
import { listHistory } from "@/server/repo/history";

// 지난 평가 기록 (2026-10-15): 결과 알림을 보낸 해의 내 평가지·결과, 그 해 내가 평가한 사람의 평가지·결과
export default async function HistoryPage() {
  const a = await requireParticipant();
  const years = await listHistory(a);
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader back={{ href: "/me", label: "내 할 일" }} title="지난 평가 기록" description="결과가 나온 해의 평가지(업적 글 포함)와 평가결과 · 대외비이므로 다른 사람에게 보여 주지 마세요" />
      {years.length === 0 ? (
        <Card>
          <Empty icon={<History aria-hidden="true" />} title="아직 볼 수 있는 지난 기록이 없습니다">
            평가결과가 나온 뒤부터 여기에 쌓입니다.
          </Empty>
        </Card>
      ) : (
        years.map((y) => (
          <Card key={y.year} data-year={y.year}>
            <CardHeader>
              <CardTitle>{y.year}년 정기평가</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {y.mine && <Row href={`/me/history/${y.mine}`} title="내 평가지 · 평가결과" badge={<Badge variant="primary">본인</Badge>} />}
              {y.reviewed.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-caption font-medium text-text-secondary">그 해 내가 평가한 사람 ({y.reviewed.length}명)</span>
                  <ul className="flex flex-col divide-y rounded-md border" data-testid={`reviewed-${y.year}`}>
                    {y.reviewed.map((r) => (
                      <li key={r.id}>
                        <Row
                          href={`/me/history/${r.id}`}
                          title={`${r.name} · ${r.department || "—"} ${r.position}`}
                          badge={<Badge variant="secondary">{r.leader ? "팀장 평가" : r.role === "first" ? "1차 평가" : "2차 평가"}</Badge>}
                          plain
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </main>
  );
}

function Row({ href, title, badge, plain }: { href: string; title: string; badge: React.ReactNode; plain?: boolean }) {
  return (
    <Link href={href} className={`group flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted ${plain ? "" : "rounded-md border"}`}>
      <span className="flex items-center gap-2">
        {badge}
        <span className="font-medium">{title}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
