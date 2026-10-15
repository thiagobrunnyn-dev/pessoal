CREATE TABLE `property_service_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`record_id` text NOT NULL,
	`property_id` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`before_snapshot` text,
	`after_snapshot` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `property_services`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_service_events_request_id_unique` ON `property_service_events` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_service_event_revision` ON `property_service_events` (`record_id`,`revision`);--> statement-breakpoint
CREATE TABLE `property_service_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`record_id` text NOT NULL,
	`event_id` text NOT NULL,
	`property_id` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer NOT NULL,
	`revision` integer NOT NULL,
	`original_name` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`page_count` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `property_services`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `property_service_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_service_files_object_key_unique` ON `property_service_files` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_property_service_files` ON `property_service_files` (`owner_id`,`record_id`,`revision`);--> statement-breakpoint
CREATE TABLE `property_service_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`service_kind` text NOT NULL,
	`record_id` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer NOT NULL,
	`property_name` text NOT NULL,
	`address` text NOT NULL,
	`performed_on` text NOT NULL,
	`due_on` text,
	`alert_on` text,
	`due_confirmed` integer NOT NULL,
	`eligible` integer DEFAULT 0 NOT NULL,
	`cycle_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`record_id`) REFERENCES `property_services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_service_current` ON `property_service_schedule` (`owner_id`,`property_id`,`service_kind`);--> statement-breakpoint
CREATE INDEX `idx_property_service_alert` ON `property_service_schedule` (`owner_id`,`eligible`,`alert_on`);--> statement-breakpoint
CREATE TABLE `property_services` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`service_kind` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer NOT NULL,
	`property_name` text NOT NULL,
	`address` text NOT NULL,
	`performed_on` text NOT NULL,
	`due_on` text,
	`due_confirmed` integer DEFAULT 0 NOT NULL,
	`provider_id` text,
	`provider_snapshot` text,
	`responsible` text NOT NULL,
	`certificate_number` text DEFAULT '' NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`last_event_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `service_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_property_services_history` ON `property_services` (`owner_id`,`property_id`,`service_kind`,`performed_on`);--> statement-breakpoint
CREATE TABLE `service_provider_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`before_snapshot` text,
	`after_snapshot` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `service_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_provider_events_request_id_unique` ON `service_provider_events` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_provider_event_revision` ON `service_provider_events` (`provider_id`,`revision`);--> statement-breakpoint
CREATE TABLE `service_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`tax_registration` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`services` text DEFAULT '' NOT NULL,
	`technical_responsible` text DEFAULT '' NOT NULL,
	`scope_states` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`last_event_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_service_provider_owner` ON `service_providers` (`owner_id`,`archived_at`);
--> statement-breakpoint
CREATE TRIGGER service_provider_scope_epoch AFTER UPDATE OF scope_states ON service_providers WHEN NEW.scope_states<>OLD.scope_states BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER service_provider_no_delete BEFORE DELETE ON service_providers BEGIN SELECT RAISE(ABORT,'archive service provider instead'); END;
--> statement-breakpoint
CREATE TRIGGER property_service_identity_fixed BEFORE UPDATE OF owner_id,property_id,service_kind,state_code,worksite_id,scope_version ON property_services WHEN NEW.owner_id<>OLD.owner_id OR NEW.property_id<>OLD.property_id OR NEW.service_kind<>OLD.service_kind OR NEW.state_code IS NOT OLD.state_code OR NEW.worksite_id IS NOT OLD.worksite_id OR NEW.scope_version<>OLD.scope_version BEGIN SELECT RAISE(ABORT,'service scope is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_service_no_delete BEFORE DELETE ON property_services BEGIN SELECT RAISE(ABORT,'archive property service instead'); END;
--> statement-breakpoint
CREATE TRIGGER property_service_schedule_scope AFTER UPDATE OF state_code,worksite_id,archived_at,name,address ON properties BEGIN
 UPDATE property_service_schedule SET property_name=NEW.name,address=NEW.address,cycle_id=CASE WHEN NEW.archived_at IS NOT NULL OR NEW.state_code IS NOT OLD.state_code OR NEW.worksite_id IS NOT OLD.worksite_id THEN NULL ELSE cycle_id END,
 eligible=CASE WHEN NEW.archived_at IS NULL AND NEW.state_code IS OLD.state_code AND NEW.worksite_id IS OLD.worksite_id AND cycle_id IS NOT NULL AND due_confirmed=1 AND due_on IS NOT NULL AND EXISTS(SELECT 1 FROM property_services r WHERE r.id=property_service_schedule.record_id AND r.owner_id=property_service_schedule.owner_id AND r.archived_at IS NULL AND r.state_code IS NEW.state_code AND r.worksite_id IS NEW.worksite_id AND r.scope_version=COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=NEW.id),0)) THEN 1 ELSE 0 END,
 revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE property_id=NEW.id AND owner_id=NEW.owner_id;
 END;

--> statement-breakpoint
CREATE TRIGGER service_provider_events_immutable_update BEFORE UPDATE ON service_provider_events BEGIN SELECT RAISE(ABORT,'service history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER service_provider_events_immutable_delete BEFORE DELETE ON service_provider_events BEGIN SELECT RAISE(ABORT,'service history is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER property_service_events_immutable_update BEFORE UPDATE ON property_service_events BEGIN SELECT RAISE(ABORT,'service history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_service_events_immutable_delete BEFORE DELETE ON property_service_events BEGIN SELECT RAISE(ABORT,'service history is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER property_service_files_immutable_update BEFORE UPDATE ON property_service_files BEGIN SELECT RAISE(ABORT,'service history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_service_files_immutable_delete BEFORE DELETE ON property_service_files BEGIN SELECT RAISE(ABORT,'service history is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER property_service_file_parent BEFORE INSERT ON property_service_files WHEN NOT EXISTS(SELECT 1 FROM property_services r JOIN property_service_events e ON e.record_id=r.id AND e.owner_id=r.owner_id WHERE r.id=NEW.record_id AND r.owner_id=NEW.owner_id AND r.property_id=NEW.property_id AND r.state_code IS NEW.state_code AND r.worksite_id IS NEW.worksite_id AND r.scope_version=NEW.scope_version AND e.id=NEW.event_id AND e.revision=NEW.revision) BEGIN SELECT RAISE(ABORT,'service file parent mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER property_service_schedule_parent_insert BEFORE INSERT ON property_service_schedule WHEN NOT EXISTS(SELECT 1 FROM property_services r WHERE r.id=NEW.record_id AND r.owner_id=NEW.owner_id AND r.property_id=NEW.property_id AND r.service_kind=NEW.service_kind AND r.state_code IS NEW.state_code AND r.worksite_id IS NEW.worksite_id AND r.scope_version=NEW.scope_version) BEGIN SELECT RAISE(ABORT,'service schedule parent mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER property_service_schedule_parent_update BEFORE UPDATE ON property_service_schedule WHEN NOT EXISTS(SELECT 1 FROM property_services r WHERE r.id=NEW.record_id AND r.owner_id=NEW.owner_id AND r.property_id=NEW.property_id AND r.service_kind=NEW.service_kind AND r.state_code IS NEW.state_code AND r.worksite_id IS NEW.worksite_id AND r.scope_version=NEW.scope_version) BEGIN SELECT RAISE(ABORT,'service schedule parent mismatch'); END;
