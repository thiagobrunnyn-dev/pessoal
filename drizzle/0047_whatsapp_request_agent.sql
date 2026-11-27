CREATE TABLE `request_agent_intakes` (
	`owner_id` text NOT NULL,
	`session` text NOT NULL,
	`event_hash` text NOT NULL,
	`sender_hash` text NOT NULL,
	`intake_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `session`, `event_hash`),
	FOREIGN KEY (`intake_id`) REFERENCES `request_intakes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_agent_intakes_intake_id_unique` ON `request_agent_intakes` (`intake_id`);