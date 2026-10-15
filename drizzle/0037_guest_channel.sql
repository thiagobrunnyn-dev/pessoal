CREATE TABLE `guest_channel_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`property_id` text NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `guest_channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_channel_events_request_id_unique` ON `guest_channel_events` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guest_channel_event_revision` ON `guest_channel_events` (`channel_id`,`revision`);--> statement-breakpoint
CREATE TABLE `guest_channel_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`channel_revision` integer NOT NULL,
	`token_hash` text NOT NULL,
	`challenge_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `guest_channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_channel_sessions_token_hash_unique` ON `guest_channel_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_guest_session_expiry` ON `guest_channel_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `guest_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_value` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer NOT NULL,
	`last_event_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_channels_token_hash_unique` ON `guest_channels` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guest_channel_property` ON `guest_channels` (`owner_id`,`property_id`);--> statement-breakpoint
CREATE TABLE `guest_submission_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`property_id` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`before_status` text,
	`after_status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`actor_user_id` text,
	`actor_name` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `guest_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_submission_events_request_id_unique` ON `guest_submission_events` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guest_submission_event_revision` ON `guest_submission_events` (`submission_id`,`revision`);--> statement-breakpoint
CREATE TABLE `guest_submission_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `guest_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_submission_photos_object_key_unique` ON `guest_submission_photos` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_guest_photo_submission` ON `guest_submission_photos` (`submission_id`);--> statement-breakpoint
CREATE TABLE `guest_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_revision` integer NOT NULL,
	`property_id` text NOT NULL,
	`property_name` text NOT NULL,
	`address` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer NOT NULL,
	`protocol` text NOT NULL,
	`kind` text NOT NULL,
	`values_json` text NOT NULL,
	`received_at` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`linked_order_id` text,
	`last_event_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `guest_channels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "guest_submission_kind" CHECK("guest_submissions"."kind" IN ('maintenance','material','rating')),
	CONSTRAINT "guest_submission_status" CHECK("guest_submissions"."status" IN ('received','reviewing','linked_order','closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_submissions_protocol_unique` ON `guest_submissions` (`protocol`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guest_submission_replay` ON `guest_submissions` (`channel_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `idx_guest_submission_scope` ON `guest_submissions` (`owner_id`,`property_id`,`kind`,`received_at`);--> statement-breakpoint
CREATE TRIGGER guest_submission_original_immutable BEFORE UPDATE ON guest_submissions WHEN NEW.id IS NOT OLD.id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.channel_id IS NOT OLD.channel_id OR NEW.channel_revision IS NOT OLD.channel_revision OR NEW.property_id IS NOT OLD.property_id OR NEW.property_name IS NOT OLD.property_name OR NEW.address IS NOT OLD.address OR NEW.state_code IS NOT OLD.state_code OR NEW.worksite_id IS NOT OLD.worksite_id OR NEW.scope_version IS NOT OLD.scope_version OR NEW.protocol IS NOT OLD.protocol OR NEW.kind IS NOT OLD.kind OR NEW.values_json IS NOT OLD.values_json OR NEW.received_at IS NOT OLD.received_at OR NEW.request_id IS NOT OLD.request_id OR NEW.request_fingerprint IS NOT OLD.request_fingerprint OR NEW.revision<>OLD.revision+1 OR NEW.last_event_id=OLD.last_event_id OR (OLD.linked_order_id IS NOT NULL AND NEW.linked_order_id IS NOT OLD.linked_order_id) BEGIN SELECT RAISE(ABORT,'guest_original_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER guest_submission_no_delete BEFORE DELETE ON guest_submissions BEGIN SELECT RAISE(ABORT,'guest_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER guest_submission_event_no_update BEFORE UPDATE ON guest_submission_events BEGIN SELECT RAISE(ABORT,'guest_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER guest_submission_event_no_delete BEFORE DELETE ON guest_submission_events BEGIN SELECT RAISE(ABORT,'guest_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER guest_channel_event_no_update BEFORE UPDATE ON guest_channel_events BEGIN SELECT RAISE(ABORT,'guest_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER guest_channel_event_no_delete BEFORE DELETE ON guest_channel_events BEGIN SELECT RAISE(ABORT,'guest_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER guest_photo_no_update BEFORE UPDATE ON guest_submission_photos BEGIN SELECT RAISE(ABORT,'guest_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER guest_photo_no_delete BEFORE DELETE ON guest_submission_photos BEGIN SELECT RAISE(ABORT,'guest_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER guest_channel_property_archive AFTER UPDATE OF archived_at ON properties WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL BEGIN
 UPDATE guest_channels SET enabled=0,revision=revision+1,last_event_id=lower(hex(randomblob(16))),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE owner_id=NEW.owner_id AND property_id=NEW.id AND enabled=1;
 INSERT INTO guest_channel_events(id,owner_id,channel_id,property_id,revision,action,actor_user_id,request_id,request_fingerprint,created_at) SELECT last_event_id,owner_id,id,property_id,revision,'property_archived','system:property-archive','archive:'||last_event_id,last_event_id,updated_at FROM guest_channels WHERE owner_id=NEW.owner_id AND property_id=NEW.id AND NOT EXISTS(SELECT 1 FROM guest_channel_events e WHERE e.id=guest_channels.last_event_id);
END;
