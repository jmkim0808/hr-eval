ALTER TABLE "review_cycles" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "confirmed_by" text;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "bonus_closed_at" timestamp with time zone;