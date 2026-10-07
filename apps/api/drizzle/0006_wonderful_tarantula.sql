CREATE TYPE "public"."bill_group_role" AS ENUM('OWNER', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."bill_invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."bill_share_status" AS ENUM('PENDING', 'PAYMENT_PENDING', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('OPEN', 'SETTLED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "bill_group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "bill_group_role" DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_id" text NOT NULL,
	"inviter_user_id" text NOT NULL,
	"invitee_user_id" text NOT NULL,
	"status" "bill_invitation_status" DEFAULT 'PENDING' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount_raw" text NOT NULL,
	"status" "bill_share_status" DEFAULT 'PENDING' NOT NULL,
	"transfer_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_user_id" text NOT NULL,
	"group_id" text,
	"title" text NOT NULL,
	"note" text,
	"total_raw" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"category" text NOT NULL,
	"split_mode" text NOT NULL,
	"due_label" text,
	"status" "bill_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bill_group_members_group_user_idx" ON "bill_group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "bill_group_members_user_idx" ON "bill_group_members" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bill_groups_owner_idx" ON "bill_groups" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_invitations_bill_invitee_idx" ON "bill_invitations" USING btree ("bill_id","invitee_user_id");--> statement-breakpoint
CREATE INDEX "bill_invitations_invitee_status_idx" ON "bill_invitations" USING btree ("invitee_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_shares_bill_user_idx" ON "bill_shares" USING btree ("bill_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_shares_transfer_idx" ON "bill_shares" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "bill_shares_user_status_idx" ON "bill_shares" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "bills_creator_created_idx" ON "bills" USING btree ("creator_user_id","created_at");--> statement-breakpoint
CREATE INDEX "bills_group_created_idx" ON "bills" USING btree ("group_id","created_at");