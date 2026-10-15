CREATE TABLE `correction_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_snapshot` text NOT NULL,
	`after_snapshot` text NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`revision` integer NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `correction_events_request_id_unique` ON `correction_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_correction_entity` ON `correction_events` (`owner_id`,`entity_type`,`entity_id`,`revision`);--> statement-breakpoint
ALTER TABLE `cleaning_locations` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cleaning_locations` ADD `last_correction_id` text;--> statement-breakpoint
ALTER TABLE `cleaning_records` ADD `rule_snapshot` text;--> statement-breakpoint
ALTER TABLE `cleaning_records` ADD `location_snapshot` text;--> statement-breakpoint
ALTER TABLE `cleaning_records` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cleaning_records` ADD `last_correction_id` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `last_correction_id` text;--> statement-breakpoint
ALTER TABLE `cost_centers` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cost_centers` ADD `last_correction_id` text;--> statement-breakpoint
ALTER TABLE `housing_handovers` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `housing_handovers` ADD `last_correction_id` text;--> statement-breakpoint
ALTER TABLE `maintenance` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenance` ADD `last_correction_id` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `last_correction_id` text;