CREATE TABLE `transport_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`mode` text NOT NULL,
	`trip_id` text NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transport_event_request` ON `transport_events` (`tenant`,`mode`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transport_trip_event` ON `transport_events` (`tenant`,`mode`,`trip_id`,`kind`);--> statement-breakpoint
CREATE TABLE `transport_memberships` (
	`subject` text NOT NULL,
	`tenant` text NOT NULL,
	`mode` text NOT NULL,
	`driver_id` text NOT NULL,
	`display_name` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`subject`, `tenant`, `mode`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transport_driver_unique` ON `transport_memberships` (`tenant`,`mode`,`driver_id`);--> statement-breakpoint
CREATE TABLE `transport_trips` (
	`id` text NOT NULL,
	`tenant` text NOT NULL,
	`mode` text NOT NULL,
	`driver_id` text,
	`route` text NOT NULL,
	`base` text NOT NULL,
	`leg` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`lot_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`created_request` text NOT NULL,
	`departed_at` text,
	`arrived_at` text,
	`last_request` text,
	PRIMARY KEY(`tenant`, `mode`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transport_create_request` ON `transport_trips` (`tenant`,`mode`,`created_request`);--> statement-breakpoint
CREATE INDEX `transport_trip_driver` ON `transport_trips` (`tenant`,`mode`,`driver_id`);