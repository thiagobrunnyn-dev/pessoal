CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`brand_model` text DEFAULT '' NOT NULL,
	`serial` text DEFAULT '' NOT NULL,
	`baseline_date` text,
	`checklist` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_equipment_owner` ON `equipment` (`owner_id`);--> statement-breakpoint
CREATE TABLE `maintenance` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`equipment_id` text NOT NULL,
	`service_date` text NOT NULL,
	`service_time` text NOT NULL,
	`responsible` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`checklist` text NOT NULL,
	`created_at` text NOT NULL,
	`photo_count` integer NOT NULL,
	`request_id` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_request_id_unique` ON `maintenance` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_maintenance_equipment_date` ON `maintenance` (`equipment_id`,`service_date`);--> statement-breakpoint
CREATE TABLE `maintenance_schedule` (
	`equipment_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`equipment_name` text NOT NULL,
	`property_name` text NOT NULL,
	`address` text NOT NULL,
	`location` text NOT NULL,
	`last_service_date` text,
	`due_date` text,
	`alert_date` text,
	`interval_days` integer DEFAULT 90 NOT NULL,
	`alert_days_before` integer DEFAULT 5 NOT NULL,
	`cycle_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_owner_due` ON `maintenance_schedule` (`owner_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`maintenance_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`maintenance_id`) REFERENCES `maintenance`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_photos_maintenance` ON `photos` (`maintenance_id`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_properties_owner` ON `properties` (`owner_id`);