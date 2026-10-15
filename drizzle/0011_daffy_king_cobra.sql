CREATE TABLE `operation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_snapshot` text NOT NULL,
	`after_snapshot` text NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operation_events_request_id_unique` ON `operation_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_operation_event_entity` ON `operation_events` (`owner_id`,`kind`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `operation_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`routine_id` text DEFAULT '' NOT NULL,
	`cycle_id` text DEFAULT '' NOT NULL,
	`due_date` text,
	`responsible` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_event_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operation_plan_scope` ON `operation_plans` (`owner_id`,`item_type`,`item_id`,`routine_id`);--> statement-breakpoint
CREATE TABLE `service_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`source_revision` integer NOT NULL,
	`decision` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`actor_name` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_event_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_service_review_scope` ON `service_reviews` (`owner_id`,`item_type`,`item_id`);