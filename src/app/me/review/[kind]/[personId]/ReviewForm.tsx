"use client";

import { ArrowRight, CircleAlert, CircleCheck, EyeOff, Info, Loader2, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import type { FormType, Item } from "@/domain/forms";
import { ACHIEVEMENT, parseScore, REVIEW, type ReviewKind } from "@/domain/review";
import { cn } from "@/lib/utils";
import { saveReviewAction } from "../../actions";

const AUTOSAVE_MS = 1200;
const RANGE_MSG = "1~10 사이 숫자만 넣을 수 있습니다";
const hhmm = (iso: string) => new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(iso));

type Props = {
  kind: ReviewKind;
  label: string;
  person: { id: string; name: string; department: string; position: string; formType: FormType };
  items: Item[];
  year: number;
  visible: boolean;
  editable: boolean;
  /** 내 점수 칸을 보일지 (기간 전에는 칸 자체가 없다) */
  showMine: boolean;
  notice: string | null;
  self: { scores: Record<string, number>; achievement: string; improvement: string; submitted: boolean } | null;
  firstScores: Record<string, number> | null;
  initial: { scores: Record<string, number>; version: number; submittedAt: string | null };
  nextHref: string | null;
};

type Save = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "conflict" } | { kind: "error"; message: string };

export function ReviewForm(p: Props) {
  const router = useRouter();
  const [raw, setRaw] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(p.initial.scores).map(([k, v]) => [k, String(v)])));
  const [save, setSave] = useState<Save>({ kind: "idle" });
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState<string | null>(p.initial.submittedAt);
  const [submitting, startSubmit] = useTransition();
  const version = useRef(p.initial.version);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const latest = useRef(raw);
  latest.current = raw;

  const valid = (r: Record<string, string>) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(r)) {
      const n = parseScore(v);
      if (typeof n === "number") out[k] = n;
    }
    return out;
  };

  const flush = useCallback(async () => {
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return;
    dirty.current = false;
    setSave({ kind: "saving" });
    const run = (async () => {
      const r = await saveReviewAction({ kind: p.kind, personId: p.person.id, version: version.current, scores: valid(latest.current) }, false);
      if (r.ok) {
        version.current = r.value.version;
        setSave(dirty.current ? { kind: "saving" } : { kind: "saved", at: r.value.savedAt });
      } else if (r.code === "conflict") setSave({ kind: "conflict" });
      else setSave({ kind: "error", message: r.message });
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, [p.kind, p.person.id]);

  useEffect(() => {
    if (!dirty.current || save.kind === "conflict") return;
    const t = setTimeout(flush, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [raw, flush, save.kind]);

  function change(code: string, v: string) {
    dirty.current = true;
    setRaw((r) => ({ ...r, [code]: v }));
  }

  function submit() {
    startSubmit(async () => {
      await flush();
      const bad = Object.values(latest.current).some((v) => parseScore(v) === "invalid");
      if (bad) return setSave({ kind: "error", message: RANGE_MSG });
      const r = await saveReviewAction({ kind: p.kind, personId: p.person.id, version: version.current, scores: valid(latest.current) }, true);
      if (r.ok) {
        version.current = r.value.version;
        setMissing(new Set());
        setSubmitted(r.value.savedAt);
        setSave({ kind: "saved", at: r.value.savedAt });
        router.refresh();
      } else if (r.code === "incomplete" && "missing" in r) {
        setMissing(new Set(r.missing));
        document.getElementById(`score-${r.missing[0]}`)?.focus();
      } else if (r.code === "conflict") setSave({ kind: "conflict" });
      else setSave({ kind: "error", message: r.message });
    });
  }

  if (!p.visible || !p.self)
    return (
      <Card>
        <Empty icon={<EyeOff aria-hidden="true" />} title={`${p.person.name} 님은 아직 평가지를 제출하지 않았습니다`}>
          제출하면 여기서 볼 수 있습니다.
        </Empty>
      </Card>
    );

  const showFirst = !!p.firstScores;
  const groups = [...new Set(p.items.map((i) => i.group))];
  const cols = cn("grid items-center gap-3 px-5 py-2.5", showFirst ? "grid-cols-[1fr_4rem_4rem_5rem]" : p.showMine ? "grid-cols-[1fr_4rem_5rem]" : "grid-cols-[1fr_4rem]");

  const scoreCell = (code: string, name: string) => {
    const v = raw[code] ?? "";
    const parsed = parseScore(v);
    const err = parsed === "invalid" ? RANGE_MSG : missing.has(code) && !parsed ? "점수를 넣어 주세요" : null;
    if (!p.showMine) return null;
    if (!p.editable) return <span className="text-center font-semibold tabular-nums">{p.initial.scores[code] ?? "—"}</span>;
    return (
      <div className="flex flex-col items-center gap-0.5">
        <Input
          id={`score-${code}`}
          inputMode="numeric"
          aria-label={`${name} ${REVIEW[p.kind].column} 점수`}
          aria-invalid={!!err}
          value={v}
          onChange={(e) => change(code, e.target.value)}
          className="h-8 w-16 text-center tabular-nums"
          maxLength={2}
        />
        {err && (
          <span role="alert" className="text-center text-label leading-tight text-danger">
            {err}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-section-title font-bold">{p.person.name}</h2>
          <p className="text-caption text-muted-foreground">
            {p.person.department} · {p.person.position} · {p.person.formType === "leader" ? "팀장용 인사평가지" : "팀원용 인사평가지"}
          </p>
        </div>
        <SaveLine save={save} editable={p.editable} />
      </div>

      {p.notice && (
        <Alert variant="neutral">
          <Info aria-hidden="true" />
          <AlertDescription>{p.notice}</AlertDescription>
        </Alert>
      )}
      {save.kind === "conflict" && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>다른 창에서 고친 내용이 있습니다</AlertTitle>
          <AlertDescription>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw aria-hidden="true" />
              최신 내용 불러오기
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {missing.size > 0 && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>빈 점수 칸 {missing.size}개를 채운 뒤 다시 [제출]을 눌러 주세요.</AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-3">
          <CardTitle>역량 평가 (비중 30%)</CardTitle>
          <CardDescription>1 미흡 · 약간 미흡 · 5 보통 · 우수 · 10 탁월</CardDescription>
        </CardHeader>
        <div className={cn(cols, "border-y bg-muted text-label font-medium text-muted-foreground")}>
          <span>역량</span>
          <span className="text-center">본인평가</span>
          {showFirst && <span className="text-center">1차</span>}
          {p.showMine && <span className="text-center">{REVIEW[p.kind].column}</span>}
        </div>
        {groups.map((g) => (
          <section key={g} aria-label={g}>
            <h3 className="border-b bg-muted/50 px-5 py-1.5 text-label font-semibold text-muted-foreground">{g}</h3>
            {p.items
              .filter((i) => i.group === g)
              .map((it) => (
                <div key={it.code} className={cn(cols, "border-b last:border-b-0")}>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-semibold">{it.name}</span>
                    <span className="text-caption text-muted-foreground">{it.desc}</span>
                  </div>
                  <span className="text-center tabular-nums text-text-secondary">{p.self!.scores[it.code] ?? "—"}</span>
                  {showFirst && <span className="text-center tabular-nums text-text-secondary">{p.firstScores![it.code] ?? "—"}</span>}
                  {scoreCell(it.code, it.name)}
                </div>
              ))}
          </section>
        ))}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>업적 평가 (비중 70%)</CardTitle>
          <CardDescription>직원이 쓴 글을 읽고 1~10점 하나를 매깁니다</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ReadText title={`${p.year}년 개인역할 및 업적`} text={p.self.achievement} />
            <ReadText title={`${p.year + 1}년 개선 및 발전`} text={p.self.improvement} />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            {showFirst && (
              <span className="text-body text-text-secondary">
                1차 업적 점수 <b className="tabular-nums text-foreground">{p.firstScores![ACHIEVEMENT] ?? "—"}</b>
              </span>
            )}
            {p.showMine && (
              <label className="flex items-center gap-3 font-medium">
                {REVIEW[p.kind].column} 업적 점수
                {scoreCell(ACHIEVEMENT, "업적")}
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      {p.editable && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {submitted && (
            <span className="flex items-center gap-1.5 text-caption text-success">
              <CircleCheck className="size-3.5" aria-hidden="true" />
              제출함 · 기간 안에서는 고쳐서 다시 제출할 수 있습니다
            </span>
          )}
          {submitted && p.nextHref && (
            <Link href={p.nextHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
              다음 사람
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
          <Button size="lg" onClick={submit} disabled={submitting || save.kind === "conflict"}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            제출
          </Button>
        </div>
      )}
    </div>
  );
}

function ReadText({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-medium text-text-secondary">{title}</span>
      <p className="min-h-24 whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2 text-body">{text || <span className="text-muted-foreground">(빈칸)</span>}</p>
    </div>
  );
}

function SaveLine({ save, editable }: { save: Save; editable: boolean }) {
  if (!editable) return null;
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
  return <span className={cn(base, "text-muted-foreground")}>점수를 넣고 멈추면 저절로 저장됩니다</span>;
}
