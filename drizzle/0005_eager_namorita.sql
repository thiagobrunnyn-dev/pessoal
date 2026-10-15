CREATE TABLE `app_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`requested_at` text NOT NULL,
	`approved_at` text,
	`approved_by` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_app_members_email_status` ON `app_members` (`email`,`status`);--> statement-breakpoint
ALTER TABLE `cleaning_records` ADD `recorded_by_user_id` text;--> statement-breakpoint
ALTER TABLE `maintenance` ADD `recorded_by_user_id` text;