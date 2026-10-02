# 파워넷 인사평가

연 1회 정기평가를 처리하는 사내 웹 서비스. 기획·결정 문서는 `docs/` (도메인 → UX → UI → 기술 → PRD 순).

## 개인 PC에서 실행

1. PostgreSQL 16을 띄우고 `.env.example`을 `.env.local`로 복사해 값을 채운다.
2. `npm install`
3. `npm run db:migrate` — 표 만들기
4. `npm run seed:admins -- "이름:이메일" "이름:이메일"` — 처음 관리자 등록
   `npm run seed:ceo -- "이름:이메일"` — 대표이사 등록 (등급 결과 보기 전용)
5. `npm run dev` → http://localhost:3000 (MAIL_MODE=log면 인증번호가 터미널에 찍힌다)

확인: `npm run typecheck`, `npm test`, `npm run build:node`, `npm run build:cf`
화면 확인(선택): 서버를 띄운 뒤 `npx tsx tests/e2e/01-login.e2e.ts`

## Cloudflare에 올리기 (무료 플랜)

1. Supabase(서울)에 프로젝트를 만들고 **Settings → Data API를 끈다**. 연결 문자열은 Transaction pooler(6543)를 쓴다.
2. `DATABASE_URL=... npm run db:migrate` 후 `npm run seed:admins -- ...`
3. 발송 전용 Worker: `cd workers/mailer && npx wrangler deploy` (루트에서 `npm install`을 먼저 한다)
   비밀값: `npx wrangler secret put SMTP_HOST` (SMTP_PORT·SMTP_USER·SMTP_PASS·MAIL_FROM·CRON_SECRET 동일)
4. 본 프로그램 비밀값: `npx wrangler secret put DATABASE_URL` (AUTH_SECRET·APP_URL·CRON_SECRET·MAIL_FROM 동일), `wrangler.jsonc`의 `MAIL_MODE`를 `smtp`로.
5. `npm run deploy:cf`

## 회사 서버로 옮길 때

`npm run build:node` → `.next/standalone`(+ `.next/static` 복사)을 `node server.js`로 실행. 메일은 nodemailer로 바로 보낸다(SMTP_* 환경 값). 1분마다 `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://주소/api/cron/tick`을 cron에 등록.
