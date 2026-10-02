#!/usr/bin/env bash
# Cloudflare(무료) + Supabase 배포 한 번에 (docs/운영/01-배포-가이드.md)
# 필요한 환경 값 (터미널에 직접 입력하지 말고 환경 설정·비밀값으로 넣는다):
#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID   — Cloudflare
#   PROD_DATABASE_URL                             — Supabase Transaction pooler(6543) 주소
#   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM — 다우오피스 (없으면 메일 없이 올리고 나중에 다시 실행)
#   ADMINS="이름:이메일,이름:이메일"  (선택, 처음 관리자)   CEO="이름:이메일" (선택)
# 값은 화면에 찍지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."
need() { [ -n "${!1:-}" ] || { echo "환경 값 $1 이 없습니다"; exit 1; }; }
need CLOUDFLARE_API_TOKEN; need CLOUDFLARE_ACCOUNT_ID; need PROD_DATABASE_URL
put() { printf '%s' "$2" | npx wrangler secret put "$1" ${3:+--config "$3"} >/dev/null; echo "  비밀값 $1 저장"; }
rand() { node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'; }

echo "1) DB 표 만들기·잠금 (Supabase)"
DATABASE_URL="$PROD_DATABASE_URL" npm run -s db:migrate
if [ -n "${ADMINS:-}" ]; then IFS=',' read -ra A <<< "$ADMINS"; DATABASE_URL="$PROD_DATABASE_URL" npm run -s seed:admins -- "${A[@]}"; fi
if [ -n "${CEO:-}" ]; then DATABASE_URL="$PROD_DATABASE_URL" npm run -s seed:ceo -- "$CEO"; fi

CRON="${CRON_SECRET:-$(rand)}"
MAILER=workers/mailer/wrangler.jsonc
HAS_SMTP=$([ -n "${SMTP_HOST:-}" ] && echo 1 || echo 0)
if [ "$HAS_SMTP" = 0 ] && [ "${ALLOW_LOG_MODE:-}" != 1 ]; then
  echo "SMTP 값이 없습니다. 운영에서는 메일 내용(인증번호·이름)을 기록에 남기면 안 되므로 멈춥니다 (ADR-0018)."
  echo "파트장 본인만 보는 1회 시험이면 ALLOW_LOG_MODE=1 을 붙여 다시 실행하세요 (인증번호는 Cloudflare 기록에서 확인)."
  exit 1
fi

echo "2) 메일 Worker 먼저 (서로 가리키지 않는 형태로)"
(cd workers/mailer && npx wrangler deploy --env bootstrap >/dev/null)

echo "3) 본 프로그램 빌드·배포"
npm run -s build:cf >/dev/null
MODE=$([ "$HAS_SMTP" = 1 ] && echo smtp || echo log)
OUT=$(npx wrangler deploy --var "MAIL_MODE:$MODE" 2>&1)
URL=$(printf '%s' "$OUT" | grep -oE 'https://hr-eval\.[a-z0-9-]+\.workers\.dev' | head -1)
APP_URL="${APP_URL:-$URL}"
echo "  주소: $APP_URL"
put DATABASE_URL "$PROD_DATABASE_URL"
npx wrangler secret list 2>/dev/null | grep -q '"AUTH_SECRET"' || put AUTH_SECRET "$(rand)"
put APP_URL "$APP_URL"
put CRON_SECRET "$CRON"
[ -n "${MAIL_FROM:-}" ] && put MAIL_FROM "$MAIL_FROM"

echo "4) 메일 Worker 완성 (예약 실행·SMTP)"
(cd workers/mailer && npx wrangler deploy >/dev/null)
put CRON_SECRET "$CRON" "$MAILER"
if [ "$HAS_SMTP" = 1 ]; then
  for k in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS MAIL_FROM; do put "$k" "${!k}" "$MAILER"; done
else
  echo "  ※ 시험용(MAIL_MODE=log)으로 올렸습니다. 직원에게 열기 전에 SMTP 값을 넣고 이 스크립트를 다시 실행하세요."
fi
echo "끝: $APP_URL"
