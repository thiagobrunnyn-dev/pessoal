CREATE TABLE `cleaning_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`location_id` text NOT NULL,
	`person_name` text NOT NULL,
	`role` text NOT NULL,
	`code_hash` text NOT NULL,
	`code_salt` text NOT NULL,
	`created_at` integer NOT NULL,
	`code_expires_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`redeemed_at` integer,
	`redeemed_session_id` text,
	FOREIGN KEY (`location_id`) REFERENCES `cleaning_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cleaning_grants_location` ON `cleaning_grants` (`location_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cleaning_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`catalog` text NOT NULL,
	`share_token` text,
	`share_enabled` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cleaning_locations_owner` ON `cleaning_locations` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_cleaning_locations_share` ON `cleaning_locations` (`share_token`);--> statement-breakpoint
CREATE TABLE `cleaning_page_opens` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`opened_at` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `cleaning_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cleaning_opens_location` ON `cleaning_page_opens` (`location_id`,`opened_at`);--> statement-breakpoint
CREATE TABLE `cleaning_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`record_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`phase` text NOT NULL,
	`position` integer NOT NULL,
	`uploaded_at` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `cleaning_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cleaning_photos_record` ON `cleaning_photos` (`record_id`);--> statement-breakpoint
CREATE TABLE `cleaning_records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`location_id` text NOT NULL,
	`service_date` text NOT NULL,
	`service_time` text NOT NULL,
	`responsible` text NOT NULL,
	`frequency` text NOT NULL,
	`checklist` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`linens` text DEFAULT '{}' NOT NULL,
	`completion_status` text NOT NULL,
	`evidence_status` text NOT NULL,
	`photo_count` integer DEFAULT 0 NOT NULL,
	`recorded_via` text NOT NULL,
	`grant_id` text,
	`is_test` integer DEFAULT 0 NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `cleaning_locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_id`) REFERENCES `cleaning_grants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cleaning_records_request_id_unique` ON `cleaning_records` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_cleaning_records_location_date` ON `cleaning_records` (`location_id`,`service_date`);--> statement-breakpoint
CREATE TABLE `cleaning_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`grant_id`) REFERENCES `cleaning_grants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cleaning_sessions_token_hash_unique` ON `cleaning_sessions` (`token_hash`);