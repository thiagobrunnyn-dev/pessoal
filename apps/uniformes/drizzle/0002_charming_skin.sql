CREATE TABLE `record_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`mode` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`reason` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	`request_id` text NOT NULL,
	`request_json` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `correction_request_unique` ON `record_corrections` (`tenant`,`mode`,`request_id`);--> statement-breakpoint
CREATE INDEX `correction_entity` ON `record_corrections` (`tenant`,`mode`,`entity_kind`,`entity_id`);--> statement-breakpoint
ALTER TABLE `uniform_audit` ADD `request_json` text;--> statement-breakpoint
ALTER TABLE `transport_trips` ADD `revision` integer DEFAULT 0 NOT NULL;