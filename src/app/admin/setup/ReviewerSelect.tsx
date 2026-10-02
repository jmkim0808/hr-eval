"use client";

import { useState, useTransition } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { updateReviewerAction } from "./actions";

export type Candidate = { id: string; label: string; executive: boolean };

export function ReviewerSelect({ personId, slot, value, candidates, executivesOnly, disabled }: { personId: string; slot: "first" | "second"; value: string | null; candidates: Candidate[]; executivesOnly: boolean; disabled?: boolean }) {
  const [v, setV] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const options = candidates.filter((c) => !executivesOnly || c.executive);
  return (
    <div className="space-y-1">
      <NativeSelect
        aria-label={slot === "first" ? "1차 평가자" : "2차 평가자"}
        value={v}
        disabled={disabled || pending}
        aria-invalid={!v || !!error || undefined}
        onChange={(e) => {
          const next = e.target.value;
          const prev = v;
          setV(next);
          setError(null);
          start(async () => {
            const r = await updateReviewerAction({ personId, slot, reviewerId: next || null });
            if (!r.ok) {
              setV(prev);
              setError(r.message);
            }
          });
        }}
      >
        <option value="">평가자를 고르세요</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </NativeSelect>
      {error && <p className="text-label text-danger">{error}</p>}
    </div>
  );
}
