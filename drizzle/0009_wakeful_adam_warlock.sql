CREATE TABLE `equipment_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`equipment_id` text NOT NULL,
	`before_snapshot` text NOT NULL,
	`after_snapshot` text NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`revision` integer NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_changes_request_id_unique` ON `equipment_changes` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_equipment_changes_equipment` ON `equipment_changes` (`equipment_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `equipment` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `equipment` ADD `last_change_id` text;--> statement-breakpoint
ALTER TABLE `maintenance` ADD `equipment_snapshot` text;