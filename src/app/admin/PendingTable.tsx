"use client";

import { CircleAlert, Clock, FilePen, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PendingRow } from "@/server/repo/progress";
import { sendRemindersAction } from "./actions";

const day = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(iso)).replace(/\.\s?/g, "/").replace(/\/$/, "");

export function PendingTable({ rows, canRemind }: { rows: PendingRow[]; canRemind: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const all = rows.length > 0 && picked.size === rows.length;

  function toggle(id: string, on: boolean) {
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  function remind() {
    start(async () => {
      const r = await sendRemindersAction([...picked]);
      setMessage(r.ok ? { ok: true, text: `${r.value.count}명에게 독촉 이메일을 보내고 있습니다.` } : { ok: false, text: r.message });
      if (r.ok) setPicked(new Set());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canRemind && (
        <div className="flex flex-wrap items-center gap-3 px-5">
          <Button variant="outline" disabled={picked.size === 0 || pending} onClick={remind}>
            <Mail aria-hidden="true" />
            독촉 이메일{picked.size > 0 && ` (${picked.size}명)`}
          </Button>
          {message && (
            <span role="status" className={`flex items-center gap-1.5 text-caption ${message.ok ? "text-success" : "text-danger"}`}>
              {!message.ok && <CircleAlert className="size-3.5" aria-hidden="true" />}
              {message.text}
            </span>
          )}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {canRemind && (
              <TableHead className="w-10">
                <Checkbox aria-label="모두 고르기" checked={all} indeterminate={picked.size > 0 && !all} onCheckedChange={(on) => setPicked(on ? new Set(rows.map((r) => r.personId)) : new Set())} />
              </TableHead>
            )}
            <TableHead>이름</TableHead>
            <TableHead>부서</TableHead>
            <TableHead>역할</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>마지막 독촉</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.personId} data-state={picked.has(r.personId) ? "selected" : undefined}>
              {canRemind && (
                <TableCell>
                  <Checkbox aria-label={`${r.name} 고르기`} checked={picked.has(r.personId)} onCheckedChange={(on) => toggle(r.personId, on)} />
                </TableCell>
              )}
              <TableCell>
                {r.formHref ? (
                  <Link href={r.formHref} className="font-medium text-primary underline-offset-4 hover:underline">
                    {r.name}
                  </Link>
                ) : (
                  <span className="font-medium">{r.name}</span>
                )}
              </TableCell>
              <TableCell>{r.department || "—"}</TableCell>
              <TableCell className="text-text-secondary">{r.role}</TableCell>
              <TableCell>
                {r.status === "writing" ? (
                  <Badge variant="info">
                    <FilePen aria-hidden="true" />
                    작성 중
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <Clock aria-hidden="true" />
                    작성 전
                  </Badge>
                )}
              </TableCell>
              <TableCell className="tabular-nums text-text-secondary">{r.lastReminder ? day(r.lastReminder) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && (
        <Alert variant="success" className="mx-5 mb-5 w-auto">
          <AlertDescription>미제출 0명 · 모두 제출했습니다.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
