CREATE TABLE `analysis_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`as_of` text NOT NULL,
	`generated_at` text NOT NULL,
	`engine` text NOT NULL,
	`model` text,
	`quality_status` text NOT NULL,
	`input_json` text NOT NULL,
	`result_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analysis_runs_generated_at_idx` ON `analysis_runs` (`generated_at`);--> statement-breakpoint
CREATE INDEX `analysis_runs_as_of_idx` ON `analysis_runs` (`as_of`);