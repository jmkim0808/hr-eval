CREATE TABLE "final_results" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"blank" boolean DEFAULT false NOT NULL,
	"competency_score" numeric(6, 2),
	"achievement_score" numeric(6, 2),
	"first_total" numeric(6, 2),
	"second_total" numeric(6, 2),
	"bonus_total" numeric(6, 2),
	"final_score" numeric(6, 2),
	"group_rank" integer,
	"draft_grade" text,
	"final_grade" text,
	"tie_rule" boolean DEFAULT false NOT NULL,
	"change_kind" text DEFAULT 'none' NOT NULL,
	"display_percentile" numeric(5, 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "final_results" ADD CONSTRAINT "final_results_person_id_cycle_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."cycle_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_results" ADD CONSTRAINT "final_results_cycle_id_review_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycles"("id") ON DELETE cascade ON UPDATE no action;