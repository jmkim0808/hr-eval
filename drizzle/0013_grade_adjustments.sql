CREATE TABLE "grade_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"from_grade" text NOT NULL,
	"to_grade" text NOT NULL,
	"kind" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"reverted_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grade_adjustments" ADD CONSTRAINT "grade_adjustments_cycle_id_review_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_adjustments" ADD CONSTRAINT "grade_adjustments_person_id_cycle_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."cycle_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grade_adjustments_cycle_idx" ON "grade_adjustments" USING btree ("cycle_id","created_at");