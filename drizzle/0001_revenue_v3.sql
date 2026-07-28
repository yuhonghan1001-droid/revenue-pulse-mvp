CREATE TABLE `revenue_mapping_profiles_v3` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_email` text NOT NULL,
  `name` text NOT NULL,
  `contract_version` text NOT NULL,
  `profile_json` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `revenue_mapping_profiles_v3_owner_idx` ON `revenue_mapping_profiles_v3` (`owner_email`);
--> statement-breakpoint
CREATE TABLE `revenue_analysis_runs_v3` (
  `id` text PRIMARY KEY NOT NULL,
  `contract_version` text NOT NULL,
  `classification` text NOT NULL,
  `visibility` text NOT NULL,
  `owner_email` text,
  `basis` text NOT NULL,
  `as_of` text NOT NULL,
  `generated_at` text NOT NULL,
  `quality_status` text NOT NULL,
  `review_status` text DEFAULT 'draft' NOT NULL,
  `approved_by` text,
  `approved_at` text,
  `content_digest` text NOT NULL,
  `approved_digest` text,
  `input_json` text NOT NULL,
  `result_json` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `revenue_analysis_runs_v3_generated_idx` ON `revenue_analysis_runs_v3` (`generated_at`);
--> statement-breakpoint
CREATE INDEX `revenue_analysis_runs_v3_owner_idx` ON `revenue_analysis_runs_v3` (`owner_email`);
--> statement-breakpoint
CREATE INDEX `revenue_analysis_runs_v3_public_idx` ON `revenue_analysis_runs_v3` (`classification`, `visibility`, `generated_at`);
--> statement-breakpoint
CREATE TABLE `feishu_delivery_attempts_v3` (
  `id` text PRIMARY KEY NOT NULL,
  `analysis_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `requested_by` text NOT NULL,
  `channel` text NOT NULL,
  `status` text NOT NULL,
  `error` text,
  `requested_at` text NOT NULL,
  `sent_at` text,
  `attempt_number` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feishu_delivery_attempts_v3_key_idx` ON `feishu_delivery_attempts_v3` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `feishu_delivery_attempts_v3_analysis_idx` ON `feishu_delivery_attempts_v3` (`analysis_id`);
