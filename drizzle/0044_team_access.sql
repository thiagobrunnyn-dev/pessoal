CREATE TABLE `team_access_grants` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`member_user_id` text NOT NULL,
	`member_revision` integer NOT NULL,
	`issued_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`code_expires_at` integer NOT NULL,
	`redeemed_at` integer,
	`session_hash` text,
	`session_expires_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`member_user_id`) REFERENCES `app_members`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_access_grants_session_hash_unique` ON `team_access_grants` (`session_hash`);--> statement-breakpoint
CREATE INDEX `idx_team_access_member` ON `team_access_grants` (`member_user_id`);