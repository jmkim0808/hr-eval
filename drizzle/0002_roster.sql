CREATE TABLE "cycle_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"hire_date" date NOT NULL,
	"is_team_leader" boolean DEFAULT false NOT NULL,
	"is_executive" boolean DEFAULT false NOT NULL,
	"is_target" boolean DEFAULT true NOT NULL,
	"excluded_reason" text,
	"grade_group" smallint,
	"form_type" text,
	"first_reviewer_id" uuid,
	"second_reviewer_id" uuid,
	"access_blocked" boolean DEFAULT false NOT NULL,
	"row_no" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycle_people_cycle_email" UNIQUE("cycle_id","email")
);
--> statement-breakpoint
ALTER TABLE "cycle_people" ADD CONSTRAINT "cycle_people_cycle_id_review_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_people" ADD CONSTRAINT "cycle_people_first_reviewer_id_cycle_people_id_fk" FOREIGN KEY ("first_reviewer_id") REFERENCES "public"."cycle_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_people" ADD CONSTRAINT "cycle_people_second_reviewer_id_cycle_people_id_fk" FOREIGN KEY ("second_reviewer_id") REFERENCES "public"."cycle_people"("id") ON DELETE set null ON UPDATE no action;