"use client";

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";
import { handleBonusRequestAction } from "./actions";

type Req = { id: string; name: string; department: string; at: string; message: string; status: "open" | "done"; reply: string | null; handledBy: string | null };
const when = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/** 직원 정정 요청 목록: 가점을 고친 뒤(표에서 바로 수정) [처리 완료]를 누르면 직원 화면에 답변과 함께 표시 */
export function BonusRequests({ rows }: { rows: Req[] }) {
  return (
    <ul className="flex flex-col gap-3" data-testid="bonus-requests">
      {rows.map((r) => (
        <Item key={r.id} r={r} />
      ))}
    </ul>
  );
}

function Item({ r }: { r: Req }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-col gap-2 rounded-md border px-4 py-3" data-request={r.name}>
      <span className="flex flex-wrap items-center gap-2 text-label text-muted-foreground">
        <b className="text-foreground">{r.name}</b> {r.department} · {when(r.at)}
        {r.status === "open" ? <Badge variant="warning">처리 전</Badge> : <Badge variant="success">처리 완료 · {r.handledBy}</Badge>}
      </span>
      <span className="whitespace-pre-wrap">{r.message}</span>
      {r.status === "done" ? (
        r.reply && <span className="text-label text-muted-foreground">답변: {r.reply}</span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={500} placeholder="직원에게 보일 답변 (선택) 예) 자격증 1점 반영했습니다" className="min-w-64 flex-1" aria-label={`${r.name} 답변`} />
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const x = await handleBonusRequestAction(r.id, reply);
                if (!x.ok) return setError(x.message);
                router.refresh();
              })
            }
          >
            <CircleCheck aria-hidden="true" />
            처리 완료
          </Button>
          <FieldError>{error}</FieldError>
        </div>
      )}
    </li>
  );
}
