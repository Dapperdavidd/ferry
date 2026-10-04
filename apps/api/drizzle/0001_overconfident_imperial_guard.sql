ALTER TABLE "cashouts" ADD COLUMN "payout_provider" text;--> statement-breakpoint
ALTER TABLE "cashouts" ADD COLUMN "payout_data" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payout_account" jsonb;