CREATE TYPE "public"."drop_status" AS ENUM('PREPARED', 'FUNDING_PENDING', 'OPEN', 'CLAIM_PENDING', 'CLAIMED', 'REFUND_PENDING', 'REFUNDED', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."intent_kind" ADD VALUE 'drop_create';--> statement-breakpoint
CREATE TABLE "ferry_drops" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_hash" text NOT NULL,
	"sender_user_id" text NOT NULL,
	"sender_address" text NOT NULL,
	"amount_raw" text NOT NULL,
	"memo" text,
	"status" "drop_status" DEFAULT 'PREPARED' NOT NULL,
	"intent_id" text,
	"funding_tx_hash" text,
	"claimant_user_id" text,
	"claimant_address" text,
	"claim_tx_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ferry_drops_claim_hash_idx" ON "ferry_drops" USING btree ("claim_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "ferry_drops_intent_idx" ON "ferry_drops" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "ferry_drops_sender_created_idx" ON "ferry_drops" USING btree ("sender_user_id","created_at");--> statement-breakpoint
CREATE INDEX "ferry_drops_status_idx" ON "ferry_drops" USING btree ("status");