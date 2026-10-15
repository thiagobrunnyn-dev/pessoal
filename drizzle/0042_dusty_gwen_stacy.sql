CREATE TABLE `integration_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`last_used_at` text,
	`rate_window` integer DEFAULT 0 NOT NULL,
	`rate_count` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "integration_permission" CHECK("integration_keys"."permission" IN ('read','write'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_keys_token_hash_unique` ON `integration_keys` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_keys_owner` ON `integration_keys` (`owner_id`);