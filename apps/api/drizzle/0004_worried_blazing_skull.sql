CREATE TYPE "public"."referral_status" AS ENUM('PENDING', 'QUALIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."reward_event_kind" AS ENUM('transfer_milestone', 'flow_milestone', 'cashout_milestone', 'referral_inviter', 'referral_invitee', 'adjustment');--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"inviter_user_id" text NOT NULL,
	"invitee_user_id" text NOT NULL,
	"code" text NOT NULL,
	"status" "referral_status" DEFAULT 'PENDING' NOT NULL,
	"qualifying_transfer_id" text,
	"qualified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"referral_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_key" text NOT NULL,
	"kind" "reward_event_kind" NOT NULL,
	"points" integer NOT NULL,
	"reference_id" text,
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_invitee_idx" ON "referrals" USING btree ("invitee_user_id");--> statement-breakpoint
CREATE INDEX "referrals_inviter_status_idx" ON "referrals" USING btree ("inviter_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_accounts_referral_code_idx" ON "reward_accounts" USING btree ("referral_code");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_events_event_key_idx" ON "reward_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "reward_events_user_created_idx" ON "reward_events" USING btree ("user_id","created_at");