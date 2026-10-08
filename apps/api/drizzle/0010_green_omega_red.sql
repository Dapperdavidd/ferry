ALTER TABLE "bills" ADD COLUMN "recurring_template_id" text;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "recurrence_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "bills_recurrence_idx" ON "bills" USING btree ("recurring_template_id","recurrence_key");