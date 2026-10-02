CREATE TABLE "evaluation_scores" (
	"evaluation_id" uuid NOT NULL,
	"rater" text NOT NULL,
	"item_code" text NOT NULL,
	"score" smallint NOT NULL,
	"entered_by" text,
	CONSTRAINT "evaluation_scores_evaluation_id_rater_item_code_pk" PRIMARY KEY("evaluation_id","rater","item_code")
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"form_version" smallint DEFAULT 1 NOT NULL,
	"achievement_text" text DEFAULT '' NOT NULL,
	"improvement_text" text DEFAULT '' NOT NULL,
	"self_submitted_at" timestamp with time zone,
	"first_submitted_at" timestamp with time zone,
	"second_submitted_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_person_id_unique" UNIQUE("person_id")
);
--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_person_id_cycle_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."cycle_people"("id") ON DELETE cascade ON UPDATE no action;