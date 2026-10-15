CREATE TABLE "bonus_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"item" text NOT NULL,
	"from_points" text,
	"to_points" text NOT NULL,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonus_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reply" text,
	"handled_by" text,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bonus_history" ADD CONSTRAINT "bonus_history_person_id_cycle_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."cycle_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_requests" ADD CONSTRAINT "bonus_requests_person_id_cycle_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."cycle_people"("id") ON DELETE cascade ON UPDATE no action;