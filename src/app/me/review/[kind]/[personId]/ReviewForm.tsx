"use client";

import { fmtWhen } from "@/lib/time";
import { ArrowRight, Undo2, CircleAlert, CircleCheck, EyeOff, Info, Loader2, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Input, Textarea } from "@/components/ui/input";
import type { FormType, Item } from "@/domain/forms";
import { ACHIEVEMENT, AVG_RANGE, AVG_TARGET, AVG_TOLERANCE, averageGuide, parseScore, raterTotal, REVIEW, type ReviewKind } from "@/domain/review";
import { cn } from "@/lib/utils";
import { cancelReviewAction, saveReviewAction } from "../../actions";
import { BonusBox } from "@/components/BonusBox";
import { CardNav, FlowRail, Kbd, ModeSwitch, ScaleButtons, useCardKeys, useFlowMode, type FlowStep } from "@/components/flow/Flow";
import type { BonusView } from "@/server/repo/bonus";
import { josa } from "@/lib/josa";

const AUTOSAVE_MS = 1200;
const COMMENT_MAX = 1000;
const RANGE_MSG = "1~10 사이, 소수 첫째 자리까지 넣을 수 있습니다";
const whenFull = (iso: string) => `${fmtWhen(iso)} 제출`;
const hhmm = (iso: string) => new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(iso));

type Props = {
  kind: ReviewKind;
  label: string;
  person: { id: string; name: string; department: string; position: string; formType: FormType; pay?: string | null };
  items: Item[];
  year: number;
  visible: boolean;
  editable: boolean;
  /** 내 점수 칸을 보일지 (기간 전에는 칸 자체가 없다) */
  showMine: boolean;
  notice: string | null;
  self: { scores: Record<string, number>; achievement: string; improvement: string; submitted: boolean } | null;
  firstScores: Record<string, number> | null;
  /** 2차 평가자에게만 1차 평가의견 */
  firstComment: string | null;
  initial: { scores: Record<string, number>; comment: string; version: number; submittedAt: string | null };
  /** 아직 제출하지 않은 다음 사람 (없으면 null) */
  nextHref: string | null;
  /** 내 평가 현황 (모두 제출하면 여기로) */
  overviewHref: string;
  /** 같은 묶음 사람들의 내 점수 (평균 80점 확인) */
  bundle: { id: string; name: string; total: number | null; ach: number | null; submitted: boolean }[];
  /** 가점 (2026-10-15: 평가자에게도 보임) */
  bonus?: BonusView | null;
  bonusFinal?: boolean;
};

type Save = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "conflict" } | { kind: "error"; message: string };

export function ReviewForm(p: Props) {
  const router = useRouter();
  const [raw, setRaw] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(p.initial.scores).map(([k, v]) => [k, String(v)])));
  const [save, setSave] = useState<Save>({ kind: "idle" });
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [avgBlock, setAvgBlock] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(p.initial.submittedAt);
  // 2026-10-20: 제출하면 잠긴다. 기간 안이면 [제출 취소]로 다시 연다
  const canEdit = p.editable && !submitted;
  const [cancelling, startCancel] = useTransition();
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const cancelSubmit = () =>
    startCancel(async () => {
      const r = await cancelReviewAction({ kind: p.kind, personId: p.person.id });
      if (!r.ok) return setCancelErr(r.message);
      version.current = r.value.version;
      setCancelErr(null);
      setSubmitted(null);
      setJustSent(false);
      router.refresh();
    });
  const [submitting, startSubmit] = useTransition();
  const [justSent, setJustSent] = useState(false);
  const version = useRef(p.initial.version);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const latest = useRef(raw);
  latest.current = raw;
  const [comment, setComment] = useState(p.initial.comment);
  const [mode, setMode] = useFlowMode("card");
  const [cur, setCur] = useState(0);
  const latestComment = useRef(comment);
  latestComment.current = comment;

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
      const r = await saveReviewAction({ kind: p.kind, personId: p.person.id, version: version.current, scores: valid(latest.current), comment: latestComment.current }, false);
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
  }, [raw, comment, flush, save.kind]);

  function change(code: string, v: string) {
    dirty.current = true;
    setRaw((r) => ({ ...r, [code]: v }));
  }

  function submit() {
    startSubmit(async () => {
      await flush();
      const bad = Object.values(latest.current).some((v) => parseScore(v) === "invalid");
      if (bad) return setSave({ kind: "error", message: RANGE_MSG });
      const r = await saveReviewAction({ kind: p.kind, personId: p.person.id, version: version.current, scores: valid(latest.current), comment: latestComment.current }, true);
      if (r.ok) {
        version.current = r.value.version;
        setMissing(new Set());
        setAvgBlock(null);
        setSubmitted(r.value.savedAt);
        setSave({ kind: "saved", at: r.value.savedAt });
        // 2026-10-20: 저절로 넘어가지 않고, 알림 안의 단추로 다음 사람(없으면 내 평가 현황)으로 간다
        setJustSent(true);
        router.refresh();
      } else if (r.code === "average") {
        setAvgBlock(r.message);
        document.getElementById("average-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    if (!canEdit) return <span className="text-center font-semibold tabular-nums">{p.initial.scores[code] ?? "—"}</span>;
    return (
      <div className="flex flex-col items-center gap-0.5">
        <Input
          id={`score-${code}`}
          inputMode="decimal"
          aria-label={`${name} ${REVIEW[p.kind].column} 점수`}
          aria-invalid={!!err}
          value={v}
          onChange={(e) => change(code, e.target.value)}
          className="h-8 w-16 text-center tabular-nums"
          maxLength={4}
        />
        {err && (
          <span role="alert" className="text-center text-label leading-tight text-danger">
            {err}
          </span>
        )}
      </div>
    );
  };

  // ── 한 장씩 보기 (2026-10-19 화면 개편) ──
  const codes = [...p.items.map((i) => i.code), ACHIEVEMENT];
  const vals = valid(raw);
  const steps: FlowStep[] = [
    ...p.items.map((it) => ({ key: it.code, group: it.group, label: it.name, done: vals[it.code] !== undefined, value: vals[it.code]?.toFixed(1), error: missing.has(it.code) })),
    { key: ACHIEVEMENT, group: "업적", label: "업적 점수", done: vals[ACHIEVEMENT] !== undefined, value: vals[ACHIEVEMENT]?.toFixed(1), error: missing.has(ACHIEVEMENT) },
    ...(p.showMine ? [{ key: "_comment", group: "의견", label: "평가의견 (선택)", done: comment.trim().length > 0, value: comment.trim() ? "작성함" : undefined }] : []),
    { key: "_done", group: "마무리", label: canEdit ? "마지막 확인" : "요약", done: false },
  ];
  const stepKeys = steps.map((x) => x.key);
  const at = Math.min(cur, steps.length - 1);
  const step = steps[at]!;
  const item = p.items.find((it) => it.code === step.key);
  const isScoreStep = !!item || step.key === ACHIEVEMENT;
  const go = (i: number) => setCur(Math.max(0, Math.min(steps.length - 1, i)));
  const setScore = (code: string, n: number) => change(code, String(Math.round(Math.min(10, Math.max(1, n)) * 10) / 10));
  useCardKeys(mode === "card" && canEdit && p.showMine, isScoreStep ? (n) => setScore(step.key, n) : null, () => step.key !== "_done" && go(at + 1));
  const total = raterTotal(p.person.formType, vals);
  const filled = steps.filter((x) => x.key !== "_done" && x.key !== "_comment" && x.done).length;
  const need = codes.length;
  const sideCard = (
    <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-20">
      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
        <h4 className="mb-2 text-caption font-semibold text-muted-foreground">본인이 쓴 업적</h4>
        <p className="max-h-80 overflow-y-auto text-body leading-relaxed whitespace-pre-wrap text-text-secondary">{p.self.achievement || "(빈칸)"}</p>
      </div>
      <BonusBox bonus={p.bonus ?? null} final={p.bonusFinal} />
    </aside>
  );
  const cardView = (
    <div className="grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_19rem]">
      <FlowRail steps={steps} current={at} onPick={go} caption={`${p.person.name} · ${p.label}`} />
      <section aria-live="polite" className="flex min-h-[28rem] min-w-0 flex-col rounded-2xl border border-border/70 bg-card px-5 py-7 shadow-card sm:px-10 sm:py-9" data-testid="flow-card" data-step={step.key}>
        <p className="mb-2.5 flex flex-wrap items-center gap-2 text-caption font-semibold text-brand">
          {step.group} · {Math.min(at, steps.length - 2) + 1}/{steps.length - 1}
          {item && p.self.scores[item.code] !== undefined && <span className="rounded-full bg-hl-orange-bg px-2.5 py-0.5 text-label text-hl-orange">주황 밑줄 = 본인평가 {p.self.scores[item.code]}점</span>}
          {isScoreStep && p.firstScores?.[step.key] !== undefined && <span className="rounded-full bg-muted px-2.5 py-0.5 text-label text-text-secondary">1차 {p.firstScores[step.key]}점</span>}
        </p>
        {isScoreStep ? (
          <>
            <h2 className="text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">{item ? `${p.person.name} 님의 ${josa(item.name, "은/는")} 어땠나요?` : `${p.person.name} 님의 업적 점수`}</h2>
            <p className="mt-2.5 max-w-[60ch] text-subsection-title text-text-secondary">{item ? item.desc : "본인이 쓴 업적을 읽고 매겨 주세요. 업적은 최종점수의 70%입니다."}</p>
            {!item && (
              <div className="mt-5 grid gap-3 xl:hidden">
                <ReadText title={`${p.year}년 개인역할 및 업적`} text={p.self.achievement} />
              </div>
            )}
            {step.error && <p className="mt-2 text-caption text-danger">점수를 넣어 주세요</p>}
            {p.showMine ? (
              <div className="mt-8 flex flex-col gap-4">
                <ScaleButtons label={item?.name ?? "업적"} value={vals[step.key]} disabled={!canEdit} selfMark={item ? p.self.scores[item.code] : undefined} onPick={(n) => setScore(step.key, n)} />
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-caption text-muted-foreground">0.1점 단위</span>
                  <span className="inline-flex items-center overflow-hidden rounded-xl border">
                    <button type="button" aria-label="0.1점 내리기" disabled={!canEdit} className="h-10 w-10 bg-muted text-section-title font-bold disabled:opacity-50" onClick={() => setScore(step.key, (vals[step.key] ?? 8) - 0.1)}>
                      −
                    </button>
                    <output className="min-w-16 text-center text-section-title font-extrabold tabular-nums" aria-live="polite">
                      {vals[step.key] !== undefined ? vals[step.key]!.toFixed(1) : "—"}
                    </output>
                    <button type="button" aria-label="0.1점 올리기" disabled={!canEdit} className="h-10 w-10 bg-muted text-section-title font-bold disabled:opacity-50" onClick={() => setScore(step.key, (vals[step.key] ?? 8) + 0.1)}>
                      +
                    </button>
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-6 text-caption text-muted-foreground">{p.notice}</p>
            )}
          </>
        ) : step.key === "_comment" ? (
          <>
            <h2 className="text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">{p.person.name} 님께 남길 평가의견</h2>
            <p className="mt-2.5 mb-5 text-subsection-title text-text-secondary">해당 의견란은 피평가자에게 표시됩니다. · 선택 · {COMMENT_MAX.toLocaleString()}자까지</p>
            {p.firstComment !== null && <ReadText title="1차 평가의견" text={p.firstComment} />}
            {canEdit ? (
              <Textarea
                id="review-comment"
                aria-label={`${REVIEW[p.kind].column} 평가의견`}
                value={comment}
                maxLength={COMMENT_MAX}
                onChange={(e) => {
                  dirty.current = true;
                  setComment(e.target.value);
                }}
                className="mt-3 min-h-40 resize-y"
              />
            ) : (
              <ReadText title={`${REVIEW[p.kind].column} 평가의견`} text={comment} />
            )}
          </>
        ) : (
          <>
            <h2 className="text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">
              {submitted && p.editable ? `${p.person.name} 님 평가를 제출했습니다` : !canEdit ? `${p.person.name} 님 평가 요약` : filled === need ? `${p.person.name} 님 평가를 제출할까요?` : `아직 ${need - filled}칸이 비어 있어요`}
            </h2>
            <p className="mt-2.5 text-subsection-title text-text-secondary">
              {submitted && p.editable ? `${whenFull(submitted)} · 다음 사람은 아래 [다음 사람 평가하기]를 눌러 넘어갑니다. 고치려면 [제출 취소]` : !canEdit ? (p.notice ?? "") : filled === need ? "제출하면 잠깁니다. 다음 사람으로는 제출 뒤 [다음 사람 평가하기]를 눌러 넘어갑니다. 기간 안에는 [제출 취소] 후 다시 고칠 수 있습니다." : "왼쪽 흐름에서 회색 항목을 눌러 채워 주세요."}
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ["이 사람 점수", total === null ? "—" : total.toFixed(1)],
                ["역량 합계", p.items.every((it) => vals[it.code] !== undefined) ? p.items.reduce((a, it) => a + vals[it.code]!, 0).toFixed(1) : "—"],
                ["업적", vals[ACHIEVEMENT] !== undefined ? vals[ACHIEVEMENT]!.toFixed(1) : "—"],
              ].map(([l, v]) => (
                <div key={l} className="rounded-2xl bg-muted px-4 py-3.5">
                  <span className="text-label font-semibold text-muted-foreground">{l}</span>
                  <b className="mt-0.5 block text-section-title tabular-nums">{v}</b>
                </div>
              ))}
            </div>
            <div className="mt-auto flex flex-wrap justify-between gap-3 pt-8">
              <Button variant="outline" size="lg" onClick={() => setMode("all")}>
                한눈에 다시 보기
              </Button>
              {canEdit && (
                <Button size="lg" onClick={submit} disabled={submitting || save.kind === "conflict"}>
                  {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
                  제출
                </Button>
              )}
              {/* 2026-10-26: 제출 뒤 넘어가는 단추를 카드 안(보고 있는 자리)에도 둔다 — 위쪽 알림은 평균 상자에 가려 안 보일 수 있음 */}
              {submitted && (
                <div className="flex flex-wrap gap-2">
                  {p.editable && (
                    <Button variant="outline" size="lg" onClick={cancelSubmit} disabled={cancelling} data-testid="card-cancel-submit">
                      <Undo2 aria-hidden="true" />
                      제출 취소
                    </Button>
                  )}
                  <Link href={p.nextHref ?? `${p.overviewHref}${justSent ? "?done=1" : ""}`} className={buttonVariants({ size: "lg" })} data-testid="card-go-next">
                    {p.nextHref ? "다음 사람 평가하기" : "내 평가 현황"}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
        {step.key !== "_done" && (
          <CardNav
            prevDisabled={at === 0}
            onPrev={() => go(at - 1)}
            onNext={() => go(at + 1)}
            hint={
              isScoreStep ? (
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
      <div className="lg:col-span-2 xl:col-span-1">{sideCard}</div>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-section-title font-bold">{p.person.name}</h2>
          <p className="text-caption text-muted-foreground">
            {p.person.department} · {p.person.position}
            {p.person.pay && <b className="font-semibold text-foreground" data-testid="pay-label"> · {p.person.pay}</b>} · {p.person.formType === "leader" ? "팀장용 인사평가지" : "팀원용 인사평가지"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SaveLine save={save} editable={canEdit} />
          <ModeSwitch mode={mode} onChange={setMode} />
        </div>
      </div>

      {p.showMine && <AveragePanel bundle={p.bundle} personId={p.person.id} current={raterTotal(p.person.formType, valid(raw))} currentAch={valid(raw)[ACHIEVEMENT] ?? null} block={avgBlock} />}

      {submitted && (
        <Alert variant={justSent ? "success" : "default"} data-testid={justSent ? "submitted-toast" : "submitted-banner"}>
          <CircleCheck aria-hidden="true" />
          <AlertTitle>
            {justSent ? `${p.person.name} 님 ${p.label}를 제출했습니다` : `제출한 평가입니다`} · <span className="tabular-nums" data-testid="submitted-at">{whenFull(submitted)}</span>
          </AlertTitle>
          <AlertDescription>
            <p>{p.editable ? "제출하면 잠깁니다. 고치려면 [제출 취소]를 누른 뒤 고쳐서 다시 제출하세요 (기간 안에서만)." : "기간이 끝나 고칠 수 없습니다."}</p>
            <div className="flex flex-wrap gap-2">
              {p.nextHref && (
                <Link href={p.nextHref} className={buttonVariants({ size: "sm" })} data-testid="go-next">
                  다음 사람 평가하기
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
              <Link href={`${p.overviewHref}${justSent && !p.nextHref ? "?done=1" : ""}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                내 평가 현황
              </Link>
              {p.editable && (
                <Button variant="outline" size="sm" onClick={cancelSubmit} disabled={cancelling} data-testid="cancel-submit">
                  <Undo2 aria-hidden="true" />
                  제출 취소
                </Button>
              )}
            </div>
            {cancelErr && <p className="mt-1 text-danger">{cancelErr}</p>}
          </AlertDescription>
        </Alert>
      )}

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

      {mode === "card" ? cardView : (
      <>
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
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>업적 평가 (비중 70%)</CardTitle>
            <CardDescription>직원이 쓴 글을 읽고 1~10점(소수 첫째 자리까지)을 매깁니다 · 최종점수의 70%</CardDescription>
          </div>
          {/* 2026-10-20: 배점이 큰 업적 점수는 오른쪽 위, 굵게 */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-foreground/80 bg-muted/40 px-4 py-2.5" data-testid="ach-score-box">
            {showFirst && (
              <span className="text-body text-text-secondary">
                1차 업적 <b className="tabular-nums text-foreground">{p.firstScores![ACHIEVEMENT] ?? "—"}</b>
              </span>
            )}
            {p.showMine && (
              <label className="flex items-center gap-3 text-subsection-title font-extrabold">
                {REVIEW[p.kind].column} 업적 점수
                {scoreCell(ACHIEVEMENT, "업적")}
              </label>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4">
            <ReadText title={`${p.year}년 개인역할 및 업적`} text={p.self.achievement} />
            <ReadText title={`${p.year + 1}년 개선 및 발전`} text={p.self.improvement} />
          </div>
        </CardContent>
      </Card>

      {(p.showMine || p.firstComment) && (
        <Card>
          <CardHeader>
            <CardTitle>평가의견 (선택)</CardTitle>
            <CardDescription>해당 의견란은 피평가자에게 표시됩니다. · {COMMENT_MAX.toLocaleString()}자까지</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {p.firstComment !== null && <ReadText title="1차 평가의견" text={p.firstComment} />}
            {p.showMine &&
              (canEdit ? (
                <div className="flex flex-col gap-1">
                  <Textarea
                    id="review-comment"
                    aria-label={`${REVIEW[p.kind].column} 평가의견`}
                    value={comment}
                    maxLength={COMMENT_MAX}
                    onChange={(e) => {
                      dirty.current = true;
                      setComment(e.target.value);
                    }}
                    className="min-h-28 resize-y"
                  />
                  <span className="ml-auto text-label text-muted-foreground tabular-nums">
                    {comment.length.toLocaleString()} / {COMMENT_MAX.toLocaleString()}자
                  </span>
                </div>
              ) : (
                <ReadText title={`${REVIEW[p.kind].column} 평가의견`} text={comment} />
              ))}
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {submitted && (
            <span className="flex items-center gap-1.5 text-caption text-success">
              <CircleCheck className="size-3.5" aria-hidden="true" />
              제출함 · 기간 안에서는 고쳐서 다시 제출할 수 있습니다
            </span>
          )}
          {submitted && (
            <Link href={p.nextHref ?? p.overviewHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
              {p.nextHref ? "다음 사람" : "내 평가 현황"}
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
          <Button size="lg" onClick={submit} disabled={submitting || save.kind === "conflict"}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            제출
          </Button>
        </div>
      )}
      <BonusBox bonus={p.bonus ?? null} final={p.bonusFinal} />
      </>
      )}
    </div>
  );
}

function ReadText({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-medium text-text-secondary">{title}</span>
      <p className="min-h-32 whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2 text-body">{text || <span className="text-muted-foreground">(빈칸)</span>}</p>
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

/**
 * 내가 준 점수 평균 (평가자 평균 80 ± 0.5). 화면 위쪽에 붙어 있어 점수를 넣는 동안 계속 보인다.
 * 이 사람 점수는 지금 넣고 있는 값으로 바로 다시 계산하고, 어느 사람의 업적을 몇 점으로 고치면 되는지 제안한다.
 */
function AveragePanel({ bundle, personId, current, currentAch, block }: { bundle: Props["bundle"]; personId: string; current: number | null; currentAch: number | null; block: string | null }) {
  const rows = bundle.map((b) => (b.id === personId ? { ...b, total: current, ach: currentAch } : b));
  const g = averageGuide(rows, personId);
  const avg = g.kind === "na" ? null : g.avg;
  const tone = g.kind === "ok" ? "text-success" : g.kind === "off" ? "text-danger" : "text-foreground";
  return (
    <Card id="average-panel" className="sticky top-[4.5rem] z-10 gap-2 py-4 shadow-md" data-testid="average-panel">
      <CardHeader className="px-5">
        <CardTitle className="flex flex-wrap items-baseline gap-x-3 text-body">
          내가 준 점수 평균 <span className="text-caption font-normal text-muted-foreground">(평가 대상 {rows.length}명 · 기준 {AVG_TARGET}점, 허용 {AVG_RANGE})</span>
          <span className={cn("text-section-title tabular-nums", tone)} data-testid="my-average">
            {avg === null ? "—" : `${avg.toFixed(2)}점`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-5">
        {g.kind === "na" && <p className="text-caption text-muted-foreground">맡은 사람이 1명이라 평균 80점 규칙을 적용하지 않습니다.</p>}
        {g.kind === "pending" && (
          <p className="text-caption text-text-secondary" data-testid="average-advice">
            {g.n}명 중 {g.filled}명 입력.{" "}
            {g.perPerson !== null ? (
              <>
                남은 {g.n - g.filled}명에게 평균 <b className="text-foreground tabular-nums">{g.perPerson.toFixed(1)}점</b>을 주면 80점이 됩니다 (모든 칸을 {(g.perPerson / 10).toFixed(1)}점으로 매기면 {g.perPerson.toFixed(1)}점).
              </>
            ) : (
              "남은 사람 점수로는 80점을 맞추기 어렵습니다. 이미 넣은 점수를 고쳐 주세요."
            )}
          </p>
        )}
        {g.kind === "ok" && <p className="text-caption text-success">기준 안에 있습니다. 제출할 수 있습니다.</p>}
        {g.kind === "off" && (
          <div className="flex flex-col gap-1.5" data-testid="average-advice">
            {block && (
              <p className="text-caption font-semibold text-danger" data-testid="average-block">
                평균이 80점에 맞지 않아 제출할 수 없습니다.
              </p>
            )}
            <p className="text-caption text-danger">아래 중 하나로 고치면 80점이 됩니다.</p>
            {g.options.map((o) => (
              <div key={o.title} className="rounded-md border bg-muted/40 px-3 py-1.5 text-caption">
                <b>{o.title}</b> → 평균 {o.after.toFixed(2)}점 :{" "}
                {o.changes.map((c) => `${c.name} 업적 ${c.from.toFixed(1)} → ${c.to.toFixed(1)}`).join(" · ")}
              </div>
            ))}
            <p className="text-label text-muted-foreground">역량 항목으로 맞춰도 됩니다 (항목 0.1점 = 업적 0.1점의 1/23 정도 효과).</p>
          </div>
        )}
        {g.kind !== "na" && <AvgTrack avg={avg} people={rows.filter((b) => b.total !== null).map((b) => ({ name: b.name, total: b.total!, me: b.id === personId }))} />}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-label text-text-secondary" aria-label="사람별 내가 준 점수">
          {rows.map((b) => (
            <li key={b.id} className={cn("tabular-nums", b.id === personId && "font-semibold text-foreground")}>
              {b.name} {b.total === null ? "—" : b.total.toFixed(1)}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * 평균 게이지 (2026-10-20 보완): 70~90점 막대 위에 기준 띠(80 ± 허용오차)와 "기준 80" 이름표,
 * 지금 평균은 말풍선("지금 평균 81.3 · 기준보다 +1.3")으로 위치를 짚는다. 사람별 점은 이름을 마우스로.
 */
function AvgTrack({ avg, people }: { avg: number | null; people: { name: string; total: number; me: boolean }[] }) {
  const lo = 70;
  const hi = 90;
  const pct = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
  const pos = (v: number) => `${pct(v)}%`;
  const ok = avg !== null && Math.abs(avg - AVG_TARGET) <= AVG_TOLERANCE + 1e-9;
  const diff = avg === null ? 0 : avg - AVG_TARGET;
  return (
    <div className="relative mt-2 mb-1 h-[5.25rem]" data-testid="avg-track">
      {avg !== null && (
        <span
          className={cn("absolute top-0 -translate-x-1/2 rounded-lg px-2 py-0.5 text-label font-bold whitespace-nowrap tabular-nums text-white", ok ? "bg-success" : "bg-foreground")}
          style={{ left: `clamp(3.5rem, ${pct(avg)}%, calc(100% - 3.5rem))` }}
          data-testid="avg-bubble"
        >
          지금 평균 {avg.toFixed(1)} · {ok ? "기준 안" : `기준보다 ${diff > 0 ? "+" : ""}${diff.toFixed(1)}`}
        </span>
      )}
      <div className="absolute inset-x-0 top-9 h-2 rounded-full bg-muted" />
      <div className="absolute top-[1.9rem] h-5 rounded border-2 border-hl-green bg-hl-green-bg" style={{ left: pos(AVG_TARGET - AVG_TOLERANCE), width: `calc(${pos(AVG_TARGET + AVG_TOLERANCE)} - ${pos(AVG_TARGET - AVG_TOLERANCE)})` }} />
      {people.map((q) => (
        <span key={q.name} title={`${q.name} ${q.total.toFixed(1)}`} className={cn("absolute top-[2.05rem] size-3.5 -translate-x-1/2 rounded-full border-2 border-card", q.me ? "bg-foreground" : "bg-brand/70")} style={{ left: pos(q.total) }} />
      ))}
      {avg !== null && <span className="absolute top-6 h-9 w-1 -translate-x-1/2 rounded bg-foreground" style={{ left: pos(avg) }} />}
      {[70, 75, 85, 90].map((t) => (
        <span key={t} className="absolute top-[3.4rem] -translate-x-1/2 text-[11px] text-muted-foreground tabular-nums" style={{ left: pos(t) }}>
          {t}
        </span>
      ))}
      <span className="absolute top-[3.4rem] -translate-x-1/2 text-[11px] font-bold text-hl-green tabular-nums" style={{ left: pos(AVG_TARGET) }}>
        기준 {AVG_TARGET} ({AVG_RANGE})
      </span>
    </div>
  );
}
