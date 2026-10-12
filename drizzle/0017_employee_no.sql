ALTER TABLE "app_users" ADD COLUMN "employee_no" text;--> statement-breakpoint
ALTER TABLE "cycle_people" ADD COLUMN "employee_no" text;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_employee_no_unique" UNIQUE("employee_no");--> statement-breakpoint
ALTER TABLE "cycle_people" ADD CONSTRAINT "cycle_people_cycle_employee_no" UNIQUE("cycle_id","employee_no");