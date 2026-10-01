"use client";

import { CircleX, Info, LogIn, Mail } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { sendCodeAction, verifyCodeAction, type LoginState, type VerifyState } from "./actions";

const RESEND_SECONDS = 60;

export function LoginForm({ expired, initialEmail }: { expired: boolean; initialEmail: string }) {
  const [sendState, sendAction, sending] = useActionState(sendCodeAction, { step: "email", email: initialEmail } as LoginState);
  const [verifyState, verifyAction, verifying] = useActionState(verifyCodeAction, {} as VerifyState);
  const [now, setNow] = useState(() => Date.now());

  const step = sendState.step;
  const sentAt = sendState.sentAt ?? 0;
  const wait = Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000));
  useEffect(() => {
    if (step !== "code" || wait === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step, wait]);

  // 가장 최근에 일어난 일의 안내만 보인다 (다시 보내기 뒤에는 이전 오류를 지움).
  const error = step === "code" ? ((verifyState.at ?? 0) > sentAt ? verifyState.error : sendState.error) : sendState.error;

  return (
    <div className="box">
      <div className="box__head">
        <h1 className="t-subsection-title">이메일 인증</h1>
      </div>
      <div className="box__body">
        {expired && (
          <div className="banner banner--neutral" role="status">
            <Icon as={Info} size={20} />
            <span className="banner__text">30분 동안 사용하지 않아 다시 인증이 필요합니다.</span>
          </div>
        )}

        {step === "email" ? (
          <form action={sendAction} className="stack">
            <label className="field">
              <span className="field__label">회사 이메일</span>
              <input className={`input${sendState.error ? " is-error" : ""}`} name="email" type="email" autoComplete="email" required defaultValue={sendState.email} />
              {sendState.error && (
                <span className="field__help field__help--error">
                  <Icon as={CircleX} size={14} />
                  {sendState.error}
                </span>
              )}
            </label>
            <button className="btn btn--primary" disabled={sending}>
              <Icon as={Mail} />
              {sending ? "보내는 중" : "인증번호 받기"}
            </button>
          </form>
        ) : (
          <>
            <div className="banner banner--progress" role="status">
              <Icon as={Mail} size={20} />
              <span className="banner__text">{sendState.message ?? "인증번호를 보냈습니다. 메일함을 확인하세요."}</span>
            </div>
            <p className="t-caption">{sendState.email}</p>
            <form action={verifyAction} className="stack">
              <input type="hidden" name="email" value={sendState.email} />
              <label className="field">
                <span className="field__label">인증번호 6자리</span>
                <input className={`input${error ? " is-error" : ""}`} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus />
                {error && (
                  <span className="field__help field__help--error">
                    <Icon as={CircleX} size={14} />
                    {error}
                  </span>
                )}
              </label>
              <button className="btn btn--primary" disabled={verifying}>
                <Icon as={LogIn} />
                {verifying ? "확인 중" : "인증하기"}
              </button>
            </form>
            <form action={sendAction} className="row">
              <input type="hidden" name="email" value={sendState.email} />
              <input type="hidden" name="resend" value="1" />
              <button className="btn btn--secondary btn--small" disabled={wait > 0 || sending}>
                {wait > 0 ? `다시 보내기 (${wait}초 뒤)` : "다시 보내기"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
