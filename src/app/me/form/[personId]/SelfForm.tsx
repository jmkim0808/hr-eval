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
import { proxySaveSelfAction, proxySubmitSelfAction } from "@/app/admin/proxy/actions";
import { CardNav, FlowRail, Kbd, ModeSwitch, ScaleButtons, useCardKeys, useFlowMode, type FlowStep } from "@/components/flow/Flow";
import { saveSelfAction, submitSelfAction } from "../../actions";

const AUTOSAVE_MS = 1200;
const SCORES = Array.from({ length: 10 }, (_, i) => String(i + 1));
const whenText = (iso: string) => new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(iso));
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
  /** 관리자 대신 입력 (2026-10-15): 저장·제출을 관리자용 동작으로 하고, 제출 뒤 관리자 화면으로 */
  proxy?: boolean;
  /** 2026-10-19 화면 개편: flow = 흐름 레일 + 한 장씩/한눈에 보기 (직원 본인). classic = 예전처럼 한 화면 (관리자 대신 입력·보기) */
  layout?: "flow" | "classic";
};

export function SelfForm({ personId, formType, year, editable, initial, lockedNote = "개인작성 기간이 끝나 고칠 수 없습니다.", proxy = false, layout = "classic" }: Props) {
  const saveAct = proxy ? proxySaveSelfAction : saveSelfAction;
  const submitAct = proxy ? proxySubmitSelfAction : submitSelfAction;
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
  const flow = layout === "flow";
  const [mode, setMode] = useFlowMode(editable ? "card" : "all");
  const [cur, setCur] = useState(0);

  const flush = useCallback(async () => {
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return;
    dirty.current = false;
    setSave({ kind: "saving" });
    const run = (async () => {
      const r = await saveAct({ personId, version: version.current, draft: latest.current });
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
      const r = await submitAct({ personId, version: version.current, draft: latest.current });
      if (r.ok) {
        version.current = r.value.version;
        setIssues(null);
        router.push(proxy ? "/admin" : "/me");
        return;
      }
      if (r.code === "incomplete" && "issues" in r) {
        setIssues(r.issues);
        const firstKey = r.issues.missingItems[0] ?? (r.issues.achievement ? "achievement" : "improvement");
        if (flow && mode === "card") setCur(Math.max(0, stepKeys.indexOf(firstKey)));
        else document.getElementById(firstKey === "achievement" || firstKey === "improvement" ? firstKey : `item-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (r.code === "conflict") setSave({ kind: "conflict" });
      else setSave({ kind: "error", message: r.message });
    });
  }

  const missing = new Set(issues?.missingItems ?? []);
  const groups = [...new Set(items.map((i) => i.group))];
  const steps: FlowStep[] = [
    ...items.map((it) => ({ key: it.code, group: it.group, label: it.name, done: !!draft.scores[it.code], value: draft.scores[it.code] ? String(draft.scores[it.code]) : undefined, error: missing.has(it.code) && !draft.scores[it.code] })),
    { key: "achievement", group: "업적", label: `${year}년 개인역할 및 업적`, done: !!draft.achievement.trim(), value: draft.achievement.trim() ? "작성함" : undefined, error: !!issues?.achievement && !draft.achievement.trim() },
    { key: "improvement", group: "업적", label: `${year + 1}년 개선 및 발전`, done: !!draft.improvement.trim(), value: draft.improvement.trim() ? "작성함" : undefined, error: !!issues?.improvement && !draft.improvement.trim() },
    { key: "_done", group: "마무리", label: editable ? "마지막 확인" : "요약", done: false },
  ];
  const stepKeys = steps.map((x) => x.key);
  const step = steps[Math.min(cur, steps.length - 1)]!;
  const item = items.find((it) => it.code === step.key);
  const go = (i: number) => setCur(Math.max(0, Math.min(steps.length - 1, i)));
  const pickScore = (code: string, n: number) => {
    change({ scores: { ...latest.current.scores, [code]: n } });
    go(stepKeys.indexOf(code) + 1);
  };
  useCardKeys(flow && mode === "card" && editable, item ? (n) => pickScore(item.code, n) : null, () => step.key !== "_done" && go(cur + 1));

  const statusLine = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SaveStatus save={save} editable={editable} />
      <div className="flex flex-wrap items-center gap-3">
        {initial.submittedAt && (
          <span className="flex items-center gap-1.5 text-caption text-success">
            <CircleCheck className="size-3.5" aria-hidden="true" />
            <span data-testid="self-submitted-at" className="font-semibold">{whenText(initial.submittedAt)} 제출함</span>
            {editable && " · 기간 안에서는 고쳐서 다시 제출할 수 있습니다"}
          </span>
        )}
        {flow && <ModeSwitch mode={mode} onChange={setMode} />}
      </div>
    </div>
  );
  const alerts = (
    <>
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
          <AlertDescription>{flow ? "왼쪽 흐름에서 빨간 항목을 채운 뒤 다시 제출해 주세요." : "빨간 테두리 칸을 채운 뒤 다시 [제출]을 눌러 주세요."}</AlertDescription>
        </Alert>
      )}
    </>
  );
  const submitArea = editable ? (
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
  );
  const allView = (
    <>
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
        <CardContent className="grid gap-6">
          <TextField id="achievement" label={`${year}년 개인역할 및 업적`} value={draft.achievement} error={draft.achievement.trim() ? undefined : issues?.achievement} disabled={!editable} onChange={(v) => change({ achievement: v })} />
          <TextField id="improvement" label={`${year + 1}년 개선 및 발전`} value={draft.improvement} error={draft.improvement.trim() ? undefined : issues?.improvement} disabled={!editable} onChange={(v) => change({ improvement: v })} />
        </CardContent>
      </Card>

      <Alert variant="neutral">
        <Info aria-hidden="true" />
        <AlertDescription>가점은 관리자가 입력합니다.</AlertDescription>
      </Alert>
      {submitArea}
    </>
  );

  if (!flow)
    return (
      <div className="flex flex-col gap-6">
        {statusLine}
        {alerts}
        {allView}
      </div>
    );

  const filled = steps.filter((x) => x.key !== "_done" && x.done).length;
  const totalSteps = steps.length - 1;
  const scored = items.map((it) => draft.scores[it.code]).filter((x): x is number => !!x);
  return (
    <div className="flex flex-col gap-5">
      {statusLine}
      {alerts}
      <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <FlowRail
          steps={steps}
          current={mode === "card" ? cur : null}
          caption="전체 흐름 · 누르면 그 항목으로"
          onPick={(i) => {
            if (mode === "card") return go(i);
            const k = stepKeys[i]!;
            document.getElementById(k === "achievement" || k === "improvement" ? k : k === "_done" ? "submit-area" : `item-${k}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
        {mode === "all" ? (
          <div className="flex min-w-0 flex-col gap-6" id="submit-area">
            {allView}
          </div>
        ) : (
          <section aria-live="polite" className="flex min-h-[28rem] min-w-0 flex-col rounded-2xl border border-border/70 bg-card px-5 py-7 shadow-card sm:px-10 sm:py-9" data-testid="flow-card" data-step={step.key}>
            <p className="mb-2.5 text-caption font-semibold text-brand">
              {step.group} · {Math.min(cur, totalSteps - 1) + 1}/{totalSteps}
              {step.key === "_done" && " 다음"}
            </p>
            {item ? (
              <>
                <h2 className="text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">{item.name}, 올해 스스로 몇 점인가요?</h2>
                <p className="mt-2.5 max-w-[60ch] text-subsection-title text-text-secondary">{item.desc}</p>
                {step.error && <FieldError className="mt-2">점수를 골라 주세요</FieldError>}
                <div className="mt-8">
                  <ScaleButtons label={item.name} value={draft.scores[item.code]} disabled={!editable} onPick={(n) => pickScore(item.code, n)} />
                </div>
                <p className="mt-3 text-caption text-muted-foreground">{SCALE_LEGEND} · 본인평가는 최종 점수에 반영되지 않습니다</p>
              </>
            ) : step.key === "achievement" || step.key === "improvement" ? (
              <>
                <h2 className="text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">{step.key === "achievement" ? "올해 맡은 역할과 업적을 적어 주세요" : "내년에는 무엇을 더 잘하고 싶나요?"}</h2>
                <p className="mt-2.5 mb-5 max-w-[60ch] text-subsection-title text-text-secondary">
                  {step.key === "achievement" ? "숫자·결과 중심으로 적으면 평가자가 판단하기 쉽습니다. 평가자가 이 글을 읽고 업적 점수(최종점수의 70%)를 매깁니다." : "보완할 점과 내년 계획을 적어 주세요."}
                </p>
                <TextField
                  id={step.key}
                  label={step.label}
                  value={draft[step.key]}
                  error={draft[step.key].trim() ? undefined : step.key === "achievement" ? issues?.achievement : issues?.improvement}
                  disabled={!editable}
                  onChange={(v) => change(step.key === "achievement" ? { achievement: v } : { improvement: v })}
                />
              </>
            ) : (
              <>
                <h2 className="text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">{!editable ? "평가지 요약" : filled === totalSteps ? "다 채웠어요. 제출할까요?" : `아직 ${totalSteps - filled}개가 비어 있어요`}</h2>
                <p className="mt-2.5 text-subsection-title text-text-secondary">
                  {!editable ? lockedNote : filled === totalSteps ? "제출해도 마감 전까지는 고쳐서 다시 제출할 수 있습니다." : "왼쪽 흐름에서 회색 항목을 눌러 채워 주세요. 빈칸이 있으면 제출할 때 알려 드립니다."}
                </p>
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Stat label="역량 평균" value={scored.length ? (scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1) : "—"} />
                  <Stat label="업적 글" value={`${draft.achievement.length.toLocaleString()}자`} />
                  <Stat label="채운 항목" value={`${filled} / ${totalSteps}`} />
                </div>
                <p className="mt-5 text-caption text-muted-foreground">가점은 관리자가 입력합니다.</p>
                <div className="mt-auto flex flex-wrap justify-between gap-3 pt-8" id="submit-area">
                  <Button variant="outline" size="lg" onClick={() => setMode("all")}>
                    한눈에 다시 보기
                  </Button>
                  {editable && (
                    <Button size="lg" onClick={submit} disabled={submitting || save.kind === "conflict"}>
                      {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
                      제출
                    </Button>
                  )}
                </div>
              </>
            )}
            {step.key !== "_done" && (
              <CardNav
                prevDisabled={cur === 0}
                onPrev={() => go(cur - 1)}
                onNext={() => go(cur + 1)}
                hint={
                  item ? (
                    <>
                      <Kbd>1</Kbd>~<Kbd>0</Kbd> 점수 · <Kbd>Enter</Kbd> 다음
                    </>
                  ) : (
                    "쓰다가 멈추면 저절로 저장됩니다"
                  )
                }
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted px-4 py-3.5">
      <span className="text-label font-semibold text-muted-foreground">{label}</span>
      <b className="mt-0.5 block text-section-title tabular-nums">{value}</b>
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
      <Textarea id={p.id} value={p.value} onChange={(e) => p.onChange(e.target.value)} disabled={p.disabled} aria-invalid={!!p.error} maxLength={TEXT_MAX} className="min-h-80 resize-y" />
      <div className="flex items-start justify-between gap-3">
        <FieldError>{p.error}</FieldError>
        <span className="ml-auto text-label text-muted-foreground tabular-nums">
          {p.value.length.toLocaleString()} / {TEXT_MAX.toLocaleString()}자
        </span>
      </div>
    </div>
  );
}
