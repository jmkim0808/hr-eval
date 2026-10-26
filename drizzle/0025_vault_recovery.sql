ALTER TABLE "key_slots" ADD COLUMN "kind" text DEFAULT 'passphrase' NOT NULL;--> statement-breakpoint
ALTER TABLE "key_slots" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "key_slots" ADD COLUMN "used_at" timestamp with time zone;