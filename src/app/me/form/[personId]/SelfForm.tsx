"use client";

import { CircleAlert, CircleCheck, Info, Loader2, Lock, RefreshCw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FORMS, SCALE_LEGEND, TEXT_MAX, type FormType, type SelfDraft, type SubmitIssues } from "@/domain/forms";
import { cn } from "@/lib/utils";
import { saveSelfAction, submitSelfAction } from "../../actions";

const AUTOSAVE_MS = 1200;
const SCORES = Array.from({ length: 10 }, (_, i) => String(i + 1));
const hhmm = (iso: string) => new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(iso));

type Save = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "conflict" } | { kind: "error"; message: string };

type Props = {
  personId: string;
  formType: FormType;
  year: number;
  editable: boolean;
  initial: { draft: SelfDraft; version: number; savedAt: string | null; submittedAt: string | null };
  /** 잠겼을 때 보일 안내 (관리자 보기 전용 등) */
  lockedNote?: string;
};

export function SelfForm({ personId, formType, year, editable, initial, lockedNote = "개인작성 기간이 끝나 고칠 수 없습니다." }: Props) {
  const router = useRouter();
  const items = FORMS[formType];
  const [draft, setDraft] = useState<SelfDraft>(initial.draft);
  const [save, setSave] = useState<Save>(initial.savedAt ? { kind: "saved", at: initial.savedAt } : { kind: "idle" });
  const [issues, setIssues] = useState<SubmitIssues | null>(null);
  const [submitting, startSubmit] = useTransition();
  const version = useRef(initial.version);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const latest = useRef(draft);
  latest.current = draft;

  const flush = useCallback(async () => {
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return;
    dirty.current = false;
    setSave({ kind: "saving" });
    const run = (async () => {
      const r = await saveSelfAction({ personId, version: version.current, draft: latest.current });
      if (r.ok) {
        version.current = r.value.version;
        setSave(dirty.current ? { kind: "saving" } : { kind: "saved", at: r.value.savedAt });
      } else if (r.code === "conflict") setSave({ kind: "conflict" });
      else {
        dirty.current = true;
        setSave({ kind: "error", message: r.message });
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, [personId]);

  // 쓰다가 멈추면 저절로 저장
  useEffect(() => {
    if (!dirty.current || save.kind === "conflict") return;
    const t = setTimeout(flush, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft, flush, save.kind]);

  // 저장 안 된 채 창을 닫으려 하면 알림
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  function change(next: Partial<SelfDraft>) {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...next }));
  }

  function submit() {
    startSubmit(async () => {
      await flush();
      const r = await submitSelfAction({ personId, version: version.current, draft: latest.current });
      if (r.ok) {
        version.current = r.value.version;
        setIssues(null);
        router.push("/me");
        return;
      }
      if (r.code === "incomplete" && "issues" in r) {
        setIssues(r.issues);
        const first = r.issues.missingItems[0] ? `item-${r.issues.missingItems[0]}` : r.issues.achievement ? "achievement" : "improvement";
        document.getElementById(first)?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (r.code === "conflict") setSave({ kind: "conflict" });
      else setSave({ kind: "error", message: r.message });
    });
  }

  const missing = new Set(issues?.missingItems ?? []);
  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SaveStatus save={save} editable={editable} />
        {initial.submittedAt && editable && (
          <span className="flex items-center gap-1.5 text-caption text-success">
            <CircleCheck className="size-3.5" aria-hidden="true" />
            제출함 · 기간 안에서는 고쳐서 다시 제출할 수 있습니다
          </span>
        )}
      </div>

      {save.kind === "conflict" && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>다른 창에서 고친 내용이 있습니다</AlertTitle>
          <AlertDescription>
            <p>이 창의 내용은 저장되지 않았습니다. 최신 내용을 불러온 뒤 다시 고쳐 주세요.</p>
            <Button variant="outline" size="sm" className="mt-1" onClick={() => window.location.reload()}>
              <RefreshCw aria-hidden="true" />
              최신 내용 불러오기
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {issues && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>빠진 칸이 있습니다</AlertTitle>
          <AlertDescription>빨간 테두리 칸을 채운 뒤 다시 [제출]을 눌러 주세요.</AlertDescription>
        </Alert>
      )}

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>역량 평가 (비중 30%)</CardTitle>
          <CardDescription>항목마다 본인평가 점수를 고르세요 · {SCALE_LEGEND} · 본인평가는 최종 점수에 반영되지 않습니다</CardDescription>
        </CardHeader>
        <div className="border-t">
          {groups.map((g) => (
            <section key={g} aria-label={g} className="border-b last:border-b-0">
              <h3 className="bg-muted/60 px-5 py-2 text-label font-semibold text-muted-foreground">{g}</h3>
              {items
                .filter((i) => i.group === g)
                .map((it) => (
                  <div
                    key={it.code}
                    id={`item-${it.code}`}
                    className={cn("grid grid-cols-1 items-center gap-3 border-t px-5 py-3 first-of-type:border-t-0 lg:grid-cols-[1fr_auto]", missing.has(it.code) && !draft.scores[it.code] && "bg-danger-bg")}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span id={`label-${it.code}`} className="font-semibold">
                        {it.name}
                      </span>
                      <span className="text-caption text-muted-foreground">{it.desc}</span>
                      {missing.has(it.code) && !draft.scores[it.code] && <FieldError>점수를 골라 주세요</FieldError>}
                    </div>
                    <ToggleGroup
                      aria-labelledby={`label-${it.code}`}
                      value={draft.scores[it.code] ? [String(draft.scores[it.code])] : []}
                      onValueChange={(v) => {
                        const n = Number(v[0]);
                        const scores = { ...draft.scores };
                        if (n) scores[it.code] = n;
                        else delete scores[it.code];
                        change({ scores });
                      }}
                      disabled={!editable}
                      className={cn(missing.has(it.code) && !draft.scores[it.code] && "border-danger")}
                    >
                      {SCORES.map((s) => (
                        <ToggleGroupItem key={s} value={s} aria-label={`${s}점`}>
                          {s}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                ))}
            </section>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>업적 평가 (비중 70%)</CardTitle>
          <CardDescription>자신의 고유 업무 분야에서 지난 1년간 이루어낸 업적을 적고, 내년에 그 업적을 어떻게 발전시킬지 적어 주세요</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <TextField id="achievement" label={`${year}년 개인역할 및 업적`} value={draft.achievement} error={draft.achievement.trim() ? undefined : issues?.achievement} disabled={!editable} onChange={(v) => change({ achievement: v })} />
          <TextField id="improvement" label={`${year + 1}년 개선 및 발전`} value={draft.improvement} error={draft.improvement.trim() ? undefined : issues?.improvement} disabled={!editable} onChange={(v) => change({ improvement: v })} />
        </CardContent>
      </Card>

      <Alert variant="neutral">
        <Info aria-hidden="true" />
        <AlertDescription>가점은 관리자가 입력합니다.</AlertDescription>
      </Alert>

      {editable ? (
        <div className="flex justify-end">
          <Button size="lg" onClick={submit} disabled={submitting || save.kind === "conflict"}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            제출
          </Button>
        </div>
      ) : (
        <Alert variant="neutral">
          <Lock aria-hidden="true" />
          <AlertDescription>{lockedNote}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function SaveStatus({ save, editable }: { save: Save; editable: boolean }) {
  if (!editable) return <span />;
  const base = "flex items-center gap-1.5 text-caption";
  if (save.kind === "saving")
    return (
      <span role="status" className={cn(base, "text-muted-foreground")}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        저장 중
      </span>
    );
  if (save.kind === "saved")
    return (
      <span role="status" className={cn(base, "text-muted-foreground")}>
        <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
        저장됨 {hhmm(save.at)}
      </span>
    );
  if (save.kind === "error")
    return (
      <span role="status" className={cn(base, "text-danger")}>
        <CircleAlert className="size-3.5" aria-hidden="true" />
        저장하지 못했습니다 · {save.message}
      </span>
    );
  return <span className={cn(base, "text-muted-foreground")}>쓰다가 멈추면 저절로 저장됩니다</span>;
}

function TextField(p: { id: string; label: string; value: string; error?: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={p.id} className="text-body text-foreground">
        {p.label}
      </Label>
      <Textarea id={p.id} value={p.value} onChange={(e) => p.onChange(e.target.value)} disabled={p.disabled} aria-invalid={!!p.error} maxLength={TEXT_MAX} className="min-h-56" />
      <div className="flex items-start justify-between gap-3">
        <FieldError>{p.error}</FieldError>
        <span className="ml-auto text-label text-muted-foreground tabular-nums">
          {p.value.length.toLocaleString()} / {TEXT_MAX.toLocaleString()}자
        </span>
      </div>
    </div>
  );
}
