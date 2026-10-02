"use client";

import { CircleCheck, CircleX, Loader2, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { inviteProgressAction, retryBatchAction } from "@/app/admin/setup/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { BatchProgress as P } from "@/server/repo/outbox";

const POLL_MS = 3000; // ADR-0017

/** 메일 발송 진행 숫자. 화면을 떠났다 와도 서버에 쌓인 숫자를 다시 읽어 이어 보인다. */
export function BatchProgress({ batchId, initial, readOnly = false }: { batchId: string; initial: P; readOnly?: boolean }) {
  const [p, setP] = useState<P>(initial);
  const [retrying, startRetry] = useTransition();

  const refresh = useCallback(async () => {
    const r = await inviteProgressAction(batchId);
    if (r.ok) setP(r.value);
  }, [batchId]);

  useEffect(() => {
    if (p.pending === 0) return;
    const t = setTimeout(refresh, POLL_MS);
    return () => clearTimeout(t);
  }, [p, refresh]);

  const done = p.sent + p.failed;
  if (p.pending > 0) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-body font-medium">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          발송 중 <span className="tabular-nums">{done} / {p.total}</span>
        </div>
        <Progress value={p.total ? (done / p.total) * 100 : 0} aria-label="발송 진행" />
        <p className="text-caption text-muted-foreground">화면을 떠나도 발송은 계속됩니다.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-body font-medium" role="status">
        <CircleCheck className="size-4 text-success" aria-hidden="true" />
        발송 완료 <span className="tabular-nums">{p.sent}</span>
        <span className="text-muted-foreground">·</span>
        <span className={p.failed > 0 ? "text-danger" : "text-muted-foreground"}>
          실패 <span className="tabular-nums">{p.failed}</span>
        </span>
      </div>
      {p.failed > 0 && (
        <Alert variant="destructive">
          <CircleX aria-hidden="true" />
          <AlertTitle>보내지 못한 사람 {p.failed}명</AlertTitle>
          <AlertDescription>
            <p>{p.failedPeople.map((f) => f.name).join(", ")}</p>
            {readOnly ? (
              <p className="text-caption">평가가 마감되어 다시 보낼 수 없습니다. 수기로 전달해 주세요.</p>
            ) : (
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              disabled={retrying}
              onClick={() =>
                startRetry(async () => {
                  await retryBatchAction(batchId);
                  await refresh();
                })
              }
            >
              <RotateCw aria-hidden="true" />
              다시 보내기
            </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
