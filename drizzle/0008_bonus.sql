CREATE TABLE "bonus_points" (
	"person_id" uuid NOT NULL,
	"item" text NOT NULL,
	"points" numeric(6, 2) NOT NULL,
	"note" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bonus_points_person_id_item_pk" PRIMARY KEY("person_id","item")
);
--> statement-breakpoint
ALTER TABLE "bonus_points" ADD CONSTRAINT "bonus_points_person_id_cycle_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."cycle_people"("id") ON DELETE cascade ON UPDATE no action;