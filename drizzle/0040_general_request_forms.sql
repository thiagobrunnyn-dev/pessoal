CREATE TABLE `request_form_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`token_hash` text NOT NULL,
	`challenge_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_form_sessions_token_hash_unique` ON `request_form_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_request_form_session_expiry` ON `request_form_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `request_intake_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`intake_id` text NOT NULL,
	`revision` integer NOT NULL,
	`state_code` text,
	`action` text NOT NULL,
	`before_status` text,
	`after_status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`actor_user_id` text,
	`actor_name` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`intake_id`) REFERENCES `request_intakes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_intake_events_request_id_unique` ON `request_intake_events` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_request_intake_event_revision` ON `request_intake_events` (`intake_id`,`revision`);--> statement-breakpoint
CREATE TABLE `request_intake_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`intake_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`intake_id`) REFERENCES `request_intakes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_intake_files_object_key_unique` ON `request_intake_files` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_request_intake_file` ON `request_intake_files` (`intake_id`);--> statement-breakpoint
CREATE TABLE `request_intakes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`protocol` text NOT NULL,
	`values_json` text NOT NULL,
	`received_at` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`property_id` text,
	`client_id` text,
	`cost_center_id` text,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer,
	`assigned_at` text,
	`responsible_user_id` text,
	`responsible_name` text DEFAULT '' NOT NULL,
	`linked_order_id` text,
	`last_event_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "request_intake_kind" CHECK("request_intakes"."kind" IN ('maintenance','purchase')),
	CONSTRAINT "request_intake_status" CHECK("request_intakes"."status" IN ('received','reviewing','linked_order','approved','closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_intakes_protocol_unique` ON `request_intakes` (`protocol`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_request_intake_replay` ON `request_intakes` (`owner_id`,`kind`,`request_id`);--> statement-breakpoint
CREATE INDEX `idx_request_intake_list` ON `request_intakes` (`owner_id`,`kind`,`received_at`);--> statement-breakpoint
CREATE TRIGGER request_intake_original_immutable BEFORE UPDATE ON request_intakes WHEN NEW.id IS NOT OLD.id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.kind IS NOT OLD.kind OR NEW.protocol IS NOT OLD.protocol OR NEW.values_json IS NOT OLD.values_json OR NEW.received_at IS NOT OLD.received_at OR NEW.request_id IS NOT OLD.request_id OR NEW.request_fingerprint IS NOT OLD.request_fingerprint OR NEW.revision<>OLD.revision+1 OR NEW.last_event_id=OLD.last_event_id OR (OLD.assigned_at IS NOT NULL AND (NEW.property_id IS NOT OLD.property_id OR NEW.client_id IS NOT OLD.client_id OR NEW.cost_center_id IS NOT OLD.cost_center_id OR NEW.state_code IS NOT OLD.state_code OR NEW.worksite_id IS NOT OLD.worksite_id OR NEW.scope_version IS NOT OLD.scope_version OR NEW.assigned_at IS NOT OLD.assigned_at)) OR (OLD.linked_order_id IS NOT NULL AND NEW.linked_order_id IS NOT OLD.linked_order_id) BEGIN SELECT RAISE(ABORT,'request_original_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER request_intake_no_delete BEFORE DELETE ON request_intakes BEGIN SELECT RAISE(ABORT,'request_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER request_intake_event_no_update BEFORE UPDATE ON request_intake_events BEGIN SELECT RAISE(ABORT,'request_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER request_intake_event_no_delete BEFORE DELETE ON request_intake_events BEGIN SELECT RAISE(ABORT,'request_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER request_intake_file_no_update BEFORE UPDATE ON request_intake_files BEGIN SELECT RAISE(ABORT,'request_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER request_intake_file_no_delete BEFORE DELETE ON request_intake_files BEGIN SELECT RAISE(ABORT,'request_history_immutable'); END;
