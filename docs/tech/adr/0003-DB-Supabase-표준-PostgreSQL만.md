# ADR-0003 DB: Supabase의 PostgreSQL만, 서버에서 직접 연결

- **정해야 했던 것**: 데이터를 어디에 두고 어떻게 연결할지. 나중에 회사 DB로 옮길 수 있어야 한다 (결정권자 요구).
- **선택지**: ① Supabase 전부 활용 (로그인·데이터 API·RLS·저장소) ② Supabase를 **PostgreSQL로만** 사용 ③ 처음부터 회사 DB
- **고른 것**: ② 서울 지역 Supabase 프로젝트를 PostgreSQL로만 쓴다. 연결은 Drizzle ORM + postgres.js로 Supabase 연결 풀(트랜잭션 모드, 6543 포트)에 직접 한다. **Supabase 데이터 API는 끈다.** RLS를 쓰지 않으므로 그 문을 열어 두면 공개 열쇠 하나로 표 전체가 열리기 때문이다. 안전장치로 모든 테이블에 RLS를 "켜고 정책 없음"(전부 거부)으로 두고, 서버는 DB 소유자 계정으로 접속한다. DB 구조 변경은 Drizzle이 만든 마이그레이션 SQL 파일로만 한다.
- **포기한 것**: Supabase 로그인·실시간·파일 저장소·대시보드 자동 API의 편리함. 대신 회사 PostgreSQL 16으로 `pg_dump`/`pg_restore` 한 번에 옮길 수 있다.
- **다시 볼 때**: 회사 서버 이전 결정 시 / 데이터가 500MB(무료 한도)에 가까워질 때 (예상: 수십 년 뒤).
