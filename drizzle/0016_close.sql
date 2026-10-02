ALTER TABLE "review_cycles" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "closed_by" text;