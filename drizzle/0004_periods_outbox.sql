CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid,
	"kind" text NOT NULL,
	"to_email" text NOT NULL,
	"person_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"batch_id" uuid NOT NULL,
	"created_by" text,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "self_start" date;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "self_end" date;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "first_start" date;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "first_end" date;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "second_start" date;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "second_end" date;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "bonus_cutoff" date;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_cycle_id_review_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_status_idx" ON "email_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_batch_idx" ON "email_outbox" USING btree ("batch_id");