CREATE TYPE "public"."flow_configuration_status" AS ENUM('PREPARED', 'SUBMITTING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."flow_payment_status" AS ENUM('PREPARED', 'SUBMITTING', 'PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED');--> statement-breakpoint
ALTER TYPE "public"."intent_kind" ADD VALUE 'flow_config';--> statement-breakpoint
ALTER TYPE "public"."intent_kind" ADD VALUE 'flow_payment';--> statement-breakpoint
CREATE TABLE "flow_configurations" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"owner_address" text NOT NULL,
	"destinations" jsonb NOT NULL,
	"configuration_nonce" text NOT NULL,
	"version" integer NOT NULL,
	"status" "flow_configuration_status" DEFAULT 'PREPARED' NOT NULL,
	"tx_hash" text,
	"error_code" text,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"from_address" text NOT NULL,
	"owner_address" text NOT NULL,
	"amount_raw" text NOT NULL,
	"status" "flow_payment_status" DEFAULT 'PREPARED' NOT NULL,
	"tx_hash" text,
	"error_code" text,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "flow_configurations_intent_idx" ON "flow_configurations" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "flow_configurations_user_created_idx" ON "flow_configurations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "flow_configurations_status_idx" ON "flow_configurations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_payments_intent_idx" ON "flow_payments" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "flow_payments_user_created_idx" ON "flow_payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "flow_payments_status_idx" ON "flow_payments" USING btree ("status");
