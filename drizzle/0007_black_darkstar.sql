CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`request_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_request_id_unique` ON `clients` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_clients_owner` ON `clients` (`owner_id`);--> statement-breakpoint
CREATE TABLE `cost_centers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`request_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_centers_request_id_unique` ON `cost_centers` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_cost_centers_owner_client` ON `cost_centers` (`owner_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `housing_handovers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`client_id` text NOT NULL,
	`cost_center_id` text NOT NULL,
	`property_name` text NOT NULL,
	`address` text NOT NULL,
	`client_name` text NOT NULL,
	`cost_center_name` text NOT NULL,
	`slots` integer NOT NULL,
	`level` text NOT NULL,
	`delivered_on` text NOT NULL,
	`returned_on` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`returned_by` text,
	`returned_at` text,
	`request_id` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `housing_handovers_request_id_unique` ON `housing_handovers` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_housing_owner_delivery` ON `housing_handovers` (`owner_id`,`delivered_on`);--> statement-breakpoint
CREATE INDEX `idx_housing_property` ON `housing_handovers` (`property_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_housing_open_property` ON `housing_handovers` (`property_id`) WHERE "housing_handovers"."returned_on" IS NULL;