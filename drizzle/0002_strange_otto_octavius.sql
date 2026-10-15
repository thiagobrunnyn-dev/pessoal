CREATE TABLE `visit_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`equipment_id` text NOT NULL,
	`technician_name` text NOT NULL,
	`code_hash` text NOT NULL,
	`code_salt` text NOT NULL,
	`created_at` integer NOT NULL,
	`code_expires_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`redeemed_at` integer,
	`redeemed_session_id` text,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_visit_grants_equipment` ON `visit_grants` (`equipment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `visit_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_visit_rate_expiry` ON `visit_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `visit_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`grant_id`) REFERENCES `visit_grants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visit_sessions_token_hash_unique` ON `visit_sessions` (`token_hash`);--> statement-breakpoint
ALTER TABLE `maintenance` ADD `completion_status` text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenance` ADD `recorded_via` text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenance` ADD `visit_grant_id` text REFERENCES visit_grants(id);