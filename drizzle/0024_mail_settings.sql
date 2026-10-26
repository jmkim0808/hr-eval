CREATE TABLE "mail_settings" (
	"id" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"host" text NOT NULL,
	"port" smallint NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"from_name" text NOT NULL,
	"from_address" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_settings" ENABLE ROW LEVEL SECURITY;