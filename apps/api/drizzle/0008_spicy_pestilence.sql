CREATE TABLE "ferry_table_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ferry_table_items" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"name" text NOT NULL,
	"price_raw" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ferry_table_members" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ferry_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"host_user_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"tip_basis_points" integer DEFAULT 0 NOT NULL,
	"finalized_bill_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"creator_user_id" text NOT NULL,
	"payer_user_id" text,
	"amount_raw" text NOT NULL,
	"memo" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"transfer_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_bill_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"group_id" text,
	"title" text NOT NULL,
	"note" text,
	"total_raw" text NOT NULL,
	"creator_amount_raw" text NOT NULL,
	"category" text NOT NULL,
	"split_mode" text NOT NULL,
	"due_label" text,
	"cadence" text NOT NULL,
	"shares" jsonb NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_bill_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_legs" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"amount_raw" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"transfer_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"obligations" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ferry_table_claims_item_user_idx" ON "ferry_table_claims" USING btree ("item_id","user_id");--> statement-breakpoint
CREATE INDEX "ferry_table_claims_user_idx" ON "ferry_table_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ferry_table_items_table_idx" ON "ferry_table_items" USING btree ("table_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ferry_table_members_table_user_idx" ON "ferry_table_members" USING btree ("table_id","user_id");--> statement-breakpoint
CREATE INDEX "ferry_table_members_user_idx" ON "ferry_table_members" USING btree ("user_id","joined_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ferry_tables_token_idx" ON "ferry_tables" USING btree ("token");--> statement-breakpoint
CREATE INDEX "ferry_tables_host_created_idx" ON "ferry_tables" USING btree ("host_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_requests_token_idx" ON "payment_requests" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_requests_transfer_idx" ON "payment_requests" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "payment_requests_creator_created_idx" ON "payment_requests" USING btree ("creator_user_id","created_at");--> statement-breakpoint
CREATE INDEX "recurring_templates_owner_idx" ON "recurring_bill_templates" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "recurring_templates_due_idx" ON "recurring_bill_templates" USING btree ("active","next_run_at");--> statement-breakpoint
CREATE INDEX "settlement_legs_run_idx" ON "settlement_legs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "settlement_legs_payer_status_idx" ON "settlement_legs" USING btree ("from_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_legs_transfer_idx" ON "settlement_legs" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "settlement_runs_group_created_idx" ON "settlement_runs" USING btree ("group_id","created_at");