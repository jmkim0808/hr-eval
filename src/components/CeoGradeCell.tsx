"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { GRADES, type Grade } from "@/domain/grading";
import { setCeoGradeAction } from "@/app/report/actions";

/**
 * 대표이사 조정 칸 (2026-10-15): 등급별 비중과 상관없이 S~D 중 고르면 바로 저장된다. 밀려나는 사람은 없다.
 * "조정 없음"을 고르면 대표이사 조정을 지우고 관리자 조정 등급으로 돌아간다.
 */
export function CeoGradeCell({ personId, name, value, base, version, editable, note }: { personId: string; name: string; value: Grade | null; base: Grade; version: number; editable: boolean; note?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!editable) return <span className="font-bold">{value ?? "—"}</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2">
      <span className="w-5 text-subsection-title font-bold" data-grade>
        {value ?? base}
      </span>
      <NativeSelect
        aria-label={`${name} 대표이사 조정`}
        value={value ?? ""}
        className="w-36 min-w-36"
        disabled={pending}
        data-ceo-cell={name}
        onChange={(e) => {
          const to = (e.target.value || null) as Grade | null;
          start(async () => {
            const r = await setCeoGradeAction({ personId, to, version });
            setError(r.ok ? null : r.message);
            router.refresh();
          });
        }}
      >
        <option value="">조정 없음 ({base})</option>
        {GRADES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </NativeSelect>
      </span>
      {note && <span className="text-label text-muted-foreground">{note}</span>}
      {error && (
        <span role="alert" className="max-w-48 text-label text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
