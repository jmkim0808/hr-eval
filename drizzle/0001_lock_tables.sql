-- ADR-0003: Supabase 데이터 API로 표에 닿지 못하게 모든 표에 RLS를 켜고 정책은 두지 않는다(전부 거부).
-- 서버는 표 소유자 계정으로 접속하므로 영향을 받지 않는다. 새 표를 만들 때마다 같은 줄을 마이그레이션에 넣는다.
ALTER TABLE "app_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "review_cycles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "error_logs" ENABLE ROW LEVEL SECURITY;
