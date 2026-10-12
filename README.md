# 파워넷 인사평가

연 1회 정기평가를 처리하는 사내 웹 서비스 (서울 본사, 약 120명). 기획·결정 문서는 `docs/` (도메인 → UX → UI → 기술 → PRD 순).

- 사내 포털 앱으로 동작한다: Windows Server · Node.js 20 · `127.0.0.1` + 배정 포트 · 주소 `/hr-eval` (ADR-0019)
- 로그인: 포털 로그인(1차, 사번) + 회사 메일 인증번호(2차) (ADR-0020)
- 점수·업적 글·가점·등급은 암호화해 저장한다. 서버가 켜질 때마다 인사 관리자가 **보안 열쇠**를 열어야 한다 (ADR-0021)

## 사내 서버 설치 (전산 담당자)

자세한 순서와 점검표: `docs/운영/02-사내-포털-설치.md`

1. PostgreSQL에 전용 DB·계정을 만들고 `DATABASE_URL`을 포털 환경 값에 넣는다 (`ax-app.yaml`의 env 목록 참고).
2. `npm ci && npm run build`
3. `npm run db:migrate` — 표 만들기 (처음 한 번, 판 올릴 때마다)
4. `npm run seed:admins -- "이름:이메일:사번"` — 처음 관리자 등록 / `npm run seed:ceo -- "이름:이메일:사번"` — 대표이사(보기 전용)
5. `node scripts/start.mjs --port <배정 포트>` → 포털에서 `/hr-eval` 열기 → `/hr-eval/health` 가 `{"status":"ok"}`
6. 인사 관리자가 `/hr-eval/admin/vault`에서 보안 열쇠를 처음 만든다 (비밀 문구는 인사 담당자만 안다).

## 내 PC에서 시험 (시험 모드)

`시험-설치.bat` → `시험-켜기.bat` (자세히: `docs/운영/03-PC-시험-안내.md`). 가짜 명단, 메일은 화면의 보낸 메일함에만, 인증번호는 화면에 표시. 화면만으로 평가 한 바퀴를 도는 시험: `npx tsx tests/demo/walkthrough.e2e.ts`

## 개발 PC에서 실행

1. PostgreSQL 16, `.env.example` → `.env.local` 복사 후 값 채우기 (`MAIL_MODE=log`, `HR_DEV_PASSPHRASE`는 개발용만)
2. `npm ci`, `npm run db:migrate`, `npm run seed:admins -- "이름:이메일:사번"`
3. `npm run dev` → http://localhost:3000/hr-eval (인증번호는 터미널에 찍힌다)

확인: `npm run typecheck`, `npm test`(계산 규칙·암호화·토큰), 화면 시험: 서버를 띄운 뒤 `npx tsx tests/e2e/01-login.e2e.ts` … `21-roles.e2e.ts`
실제 직원 데이터는 개발 DB에 넣지 않는다 (가짜 명단만).
