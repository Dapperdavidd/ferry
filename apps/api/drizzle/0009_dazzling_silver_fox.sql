ALTER TABLE "bills" ADD COLUMN "reminder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "last_reminded_at" timestamp with time zone;