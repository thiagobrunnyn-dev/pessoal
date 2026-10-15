CREATE TABLE `occupancy_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`plan` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `person_profiles` ADD `name_pending` integer DEFAULT 0 NOT NULL;