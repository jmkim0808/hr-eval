-- 암호화 전환 (ADR-0021). 새로 설치하는 DB 기준이다: 이미 평문 점수가 들어 있는 DB라면 이 이관 전에 백업 후 비워야 한다(평문 값은 읽기에서 거부된다).

CREATE TABLE "key_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"salt" text NOT NULL,
	"iterations" integer NOT NULL,
	"wrapped" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bonus_points" ALTER COLUMN "points" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ALTER COLUMN "score" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "competency_score" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "achievement_score" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "first_total" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "second_total" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "bonus_total" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "final_score" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "group_rank" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "tie_rule" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "tie_rule" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "tie_rule" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "change_kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "change_kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "final_results" ALTER COLUMN "display_percentile" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "grade_adjustments" ALTER COLUMN "person_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "grade_adjustments" ADD COLUMN "subject" text;