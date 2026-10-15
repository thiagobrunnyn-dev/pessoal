CREATE TABLE `property_geolocations` (
	`property_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `record_geolocations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`status` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`accuracy_m` real,
	`captured_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_record_geolocations_owner_record` ON `record_geolocations` (`owner_id`,`record_type`,`record_id`);