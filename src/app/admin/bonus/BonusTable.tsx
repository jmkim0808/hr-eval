"use client";

import { CircleAlert, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BONUS_ITEMS, checkValues, parsePoints, type BonusCode, type BonusRow, type BonusValues } from "@/domain/bonus";
import { cn } from "@/lib/utils";
import { setBonusAction } from "./actions";

const fmt = (n: number) => (n === 0 ? "0" : n.toFixed(2).replace(/\.?0+$/, ""));

export function BonusTable({ rows, locked }: { rows: BonusRow[]; locked: boolean }) {
  const [edit, setEdit] = useState<BonusRow | null>(null);
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>부서</TableHead>
            {BONUS_ITEMS.map((i) => (
              <TableHead key={i.code} className="text-right">
                {i.label}
              </TableHead>
            ))}
            <TableHead className="text-right">가점 합계</TableHead>
            {!locked && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} data-person={r.name} className={cn(!locked && "cursor-pointer")} onClick={() => !locked && setEdit(r)}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell>{r.department || "—"}</TableCell>
              {BONUS_ITEMS.map((i) => (
                <TableCell key={i.code} className={cn("text-right tabular-nums", i.code === "discipline" && r.values && r.values[i.code] < 0 && "text-danger")}>
                  {"leaderOnly" in i && !r.isLeader ? <span className="text-muted-foreground">—</span> : r.values ? fmt(r.values[i.code]) : <span className="text-muted-foreground">·</span>}
                </TableCell>
              ))}
              <TableCell className="text-right font-semibold tabular-nums">{r.total === null ? <span className="font-normal text-muted-foreground">미반영</span> : fmt(r.total)}</TableCell>
              {!locked && (
                <TableCell className="py-1 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEdit(r);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    입력
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>{edit && <EditForm row={edit} onDone={() => setEdit(null)} />}</DialogContent>
      </Dialog>
    </>
  );
}

function EditForm({ row, onDone }: { row: BonusRow; onDone: () => void }) {
  const router = useRouter();
  const [raw, setRaw] = useState<Record<string, string>>(() => Object.fromEntries(BONUS_ITEMS.map((i) => [i.code, row.values && row.values[i.code] !== 0 ? String(row.values[i.code]) : ""])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const parsed = Object.fromEntries(BONUS_ITEMS.map((i) => [i.code, parsePoints(raw[i.code] ?? "")])) as Record<BonusCode, number | "invalid">;
  const problem = checkValues(parsed, row.isLeader);

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (problem) return setError(problem);
        start(async () => {
          const r = await setBonusAction({ personId: row.id, values: parsed as BonusValues });
          if (!r.ok) return setError(r.message);
          router.refresh();
          onDone();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>{row.name} 가점</DialogTitle>
        <DialogDescription>
          {row.department} · 빈칸은 0점 · 징계사항은 0 이하{row.isLeader ? "" : " · 팀원은 다면평가가 없습니다"}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        {BONUS_ITEMS.map((i) => {
          const disabled = "leaderOnly" in i && !row.isLeader;
          return (
            <div key={i.code} className="flex flex-col gap-1">
              <Label htmlFor={`b-${i.code}`}>{i.label}</Label>
              <Input
                id={`b-${i.code}`}
                inputMode="decimal"
                value={disabled ? "—" : raw[i.code]}
                disabled={disabled}
                placeholder={"negative" in i ? "-1" : "0"}
                aria-invalid={parsed[i.code] === "invalid"}
                onChange={(e) => setRaw((s) => ({ ...s, [i.code]: e.target.value }))}
                className="text-right tabular-nums"
              />
            </div>
          );
        })}
      </div>
      {error && (
        <FieldError>
          <CircleAlert className="size-3.5" aria-hidden="true" />
          {error}
        </FieldError>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          저장
        </Button>
      </DialogFooter>
    </form>
  );
}
