CREATE TYPE "public"."plus_purchase_status" AS ENUM('PENDING', 'ACTIVE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."sponsorship_plan" AS ENUM('FREE', 'PLUS');--> statement-breakpoint
ALTER TYPE "public"."intent_kind" ADD VALUE 'plus_purchase';--> statement-breakpoint
CREATE TABLE "plus_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount_raw" text NOT NULL,
	"tx_hash" text NOT NULL,
	"status" "plus_purchase_status" DEFAULT 'PENDING' NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "send_sponsorships" (
	"intent_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" "sponsorship_plan" NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plus_purchases_intent_idx" ON "plus_purchases" USING btree ("intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plus_purchases_tx_idx" ON "plus_purchases" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "plus_purchases_user_status_idx" ON "plus_purchases" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "send_sponsorships_user_period_idx" ON "send_sponsorships" USING btree ("user_id","plan","period_start");