"use client";

import { CalendarPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { createCycleAction } from "./actions";

export function CreateCycle({ defaultYear, blocked }: { defaultYear: number; blocked: string | null }) {
  const router = useRouter();
  const [year, setYear] = useState(String(defaultYear));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-year">평가 연도</Label>
          <Input id="new-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} className="w-28" disabled={!!blocked} />
        </div>
        <Button
          disabled={pending || !!blocked}
          onClick={() =>
            start(async () => {
              const r = await createCycleAction(Number(year));
              if (!r.ok) return setError(r.message);
              router.push("/admin/setup");
            })
          }
        >
          <CalendarPlus aria-hidden="true" />새 정기평가 만들기
        </Button>
      </div>
      <FieldError>{error ?? blocked}</FieldError>
    </div>
  );
}
