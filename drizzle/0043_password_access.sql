CREATE TABLE `password_sessions` (
	`session_hash` text PRIMARY KEY NOT NULL,
	`provider_origin` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`member_revision` integer,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_password_session_expiry` ON `password_sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `app_members` ADD `password_change_required` integer DEFAULT 0 NOT NULL;