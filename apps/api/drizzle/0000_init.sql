CREATE TYPE "public"."intent_kind" AS ENUM('transfer', 'cashout');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."transfer_direction" AS ENUM('SEND', 'RECEIVE');--> statement-breakpoint
CREATE TYPE "public"."transfer_kind" AS ENUM('transfer', 'receive', 'cashout', 'funding');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('PENDING', 'CONFIRMED', 'FAILED');--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"nonce" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashouts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"transfer_id" text,
	"quote_id" text NOT NULL,
	"amount_in_raw" text NOT NULL,
	"out_token" text NOT NULL,
	"out_decimals" integer NOT NULL,
	"out_amount_raw" text NOT NULL,
	"min_out_raw" text NOT NULL,
	"rate" text NOT NULL,
	"fee_raw" text DEFAULT '0' NOT NULL,
	"local_amount" text,
	"local_currency" text,
	"fx_rate" text,
	"fx_source" text,
	"payout_to" text NOT NULL,
	"salt" text NOT NULL,
	"payout_status" "payout_status" DEFAULT 'PENDING' NOT NULL,
	"payout_ref" text,
	"tx_hash" text,
	"status" "transfer_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "intents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "intent_kind" NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"amount_raw" text NOT NULL,
	"nonce" text NOT NULL,
	"typed_data" jsonb NOT NULL,
	"details" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_devices" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "transfer_kind" NOT NULL,
	"direction" "transfer_direction" NOT NULL,
	"token" text DEFAULT 'AUSD' NOT NULL,
	"amount_raw" text NOT NULL,
	"decimals" integer DEFAULT 6 NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"status" "transfer_status" DEFAULT 'PENDING' NOT NULL,
	"tx_hash" text,
	"log_index" integer,
	"block_number" integer,
	"intent_id" text,
	"memo" text,
	"usd_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"handle" text,
	"display_name" text,
	"home_currency" text DEFAULT 'USD' NOT NULL,
	"country" text,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "intents_user_idx" ON "intents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intents_nonce_idx" ON "intents" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "push_devices_user_idx" ON "push_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transfers_user_created_idx" ON "transfers" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transfers_user_tx_log_idx" ON "transfers" USING btree ("user_id","tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "transfers_status_idx" ON "transfers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_address_idx" ON "users" USING btree ("address");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_idx" ON "users" USING btree ("handle");