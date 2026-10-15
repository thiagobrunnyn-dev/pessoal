CREATE TABLE `work_order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`action` text NOT NULL,
	`snapshot` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`photo_count` integer DEFAULT 0 NOT NULL,
	`request_fingerprint` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_order_events_request_id_unique` ON `work_order_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_work_order_events_order` ON `work_order_events` (`work_order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `work_order_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`event_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`position` integer NOT NULL,
	`uploaded_at` text NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `work_order_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_work_order_photos_order` ON `work_order_photos` (`work_order_id`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`client_id` text,
	`cost_center_id` text,
	`property_name` text NOT NULL,
	`address` text NOT NULL,
	`client_name` text,
	`cost_center_name` text,
	`description` text NOT NULL,
	`origin` text DEFAULT '' NOT NULL,
	`responsible` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`opened_on` text NOT NULL,
	`closed_on` text,
	`pending_note` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_event_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_work_orders_owner_status` ON `work_orders` (`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_work_orders_property` ON `work_orders` (`property_id`);--> statement-breakpoint
ALTER TABLE `property_geolocations` ADD `accuracy_m` real;