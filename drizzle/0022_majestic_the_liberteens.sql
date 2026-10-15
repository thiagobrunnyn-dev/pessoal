CREATE TABLE `property_inspection_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`inspection_id` text NOT NULL,
	`property_id` text NOT NULL,
	`version` integer NOT NULL,
	`action` text NOT NULL,
	`before_snapshot` text NOT NULL,
	`after_snapshot` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`photo_count` integer DEFAULT 0 NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`inspection_id`) REFERENCES `property_inspections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_inspection_events_request_id_unique` ON `property_inspection_events` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_inspection_event_version` ON `property_inspection_events` (`inspection_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_property_inspection_events_history` ON `property_inspection_events` (`owner_id`,`property_id`,`inspection_id`,`version`);--> statement-breakpoint
CREATE TABLE `property_inspection_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`inspection_id` text NOT NULL,
	`property_id` text NOT NULL,
	`event_id` text NOT NULL,
	`version` integer NOT NULL,
	`item_id` text NOT NULL,
	`item_name` text NOT NULL,
	`environment_name` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`uploaded_at` text NOT NULL,
	`source_photo_id` text,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	FOREIGN KEY (`inspection_id`) REFERENCES `property_inspections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `property_inspection_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_photo_id`) REFERENCES `mobilization_photos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_inspection_photos_object_key_unique` ON `property_inspection_photos` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_property_inspection_photos_version` ON `property_inspection_photos` (`owner_id`,`property_id`,`inspection_id`,`version`);--> statement-breakpoint
CREATE TABLE `property_inspection_signatures` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`inspection_id` text NOT NULL,
	`property_id` text NOT NULL,
	`event_id` text NOT NULL,
	`version` integer NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_snapshot` text NOT NULL,
	`signed_at` text NOT NULL,
	`statement_version` text NOT NULL,
	`statement_text` text NOT NULL,
	`snapshot_sha256` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	FOREIGN KEY (`inspection_id`) REFERENCES `property_inspections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `property_inspection_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_inspection_signatures_object_key_unique` ON `property_inspection_signatures` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `property_inspection_signatures_request_id_unique` ON `property_inspection_signatures` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_inspection_signer_version` ON `property_inspection_signatures` (`inspection_id`,`version`,`actor_user_id`);--> statement-breakpoint
CREATE INDEX `idx_property_inspection_signatures_version` ON `property_inspection_signatures` (`owner_id`,`property_id`,`inspection_id`,`version`);--> statement-breakpoint
CREATE TABLE `property_inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`inspection_type` text NOT NULL,
	`inspected_on` text NOT NULL,
	`inspector` text NOT NULL,
	`snapshot` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_event_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_property_inspections_property` ON `property_inspections` (`owner_id`,`property_id`,`inspected_on`);
--> statement-breakpoint
-- Append after generated tables in the same additive migration. No data updates.
CREATE TRIGGER property_inspection_no_delete BEFORE DELETE ON property_inspections BEGIN SELECT RAISE(ABORT,'Inspection history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_identity_immutable BEFORE UPDATE OF id,owner_id,property_id,state_code,worksite_id,created_by,created_at ON property_inspections BEGIN SELECT RAISE(ABORT,'Inspection identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_valid_insert BEFORE INSERT ON property_inspections WHEN NOT (NEW.version=1 AND NEW.inspection_type IN('entry','return','periodic') AND json_valid(NEW.snapshot) AND json_extract(NEW.snapshot,'$.property_id')=NEW.property_id AND json_extract(NEW.snapshot,'$.property.id')=NEW.property_id AND json_extract(NEW.snapshot,'$.property.state_code') IS NEW.state_code AND json_extract(NEW.snapshot,'$.property.worksite_id') IS NEW.worksite_id AND json_extract(NEW.snapshot,'$.version')=NEW.version AND json_extract(NEW.snapshot,'$.inspection_type')=NEW.inspection_type AND EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND owner_id=NEW.owner_id AND archived_at IS NULL AND state_code IS NEW.state_code AND worksite_id IS NEW.worksite_id)) BEGIN SELECT RAISE(ABORT,'Invalid inspection snapshot'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_valid_update BEFORE UPDATE ON property_inspections WHEN NOT (NEW.version=OLD.version+1 AND EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND owner_id=NEW.owner_id AND state_code IS NEW.state_code AND worksite_id IS NEW.worksite_id AND archived_at IS NULL) AND NEW.last_event_id!=OLD.last_event_id AND NEW.inspection_type IN('entry','return','periodic') AND json_valid(NEW.snapshot) AND json_extract(NEW.snapshot,'$.property_id')=NEW.property_id AND json_extract(NEW.snapshot,'$.property')=json_extract(OLD.snapshot,'$.property') AND json_extract(NEW.snapshot,'$.source_mobilization') IS json_extract(OLD.snapshot,'$.source_mobilization') AND json_extract(NEW.snapshot,'$.source_handover') IS json_extract(OLD.snapshot,'$.source_handover') AND json_extract(NEW.snapshot,'$.version')=NEW.version AND json_extract(NEW.snapshot,'$.inspection_type')=NEW.inspection_type) BEGIN SELECT RAISE(ABORT,'Invalid inspection revision'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_event_valid BEFORE INSERT ON property_inspection_events WHEN NOT (NEW.action IN('create','update') AND json_valid(NEW.before_snapshot) AND json_valid(NEW.after_snapshot) AND NEW.photo_count BETWEEN 0 AND 3 AND EXISTS(SELECT 1 FROM property_inspections WHERE id=NEW.inspection_id AND owner_id=NEW.owner_id AND property_id=NEW.property_id AND version=NEW.version AND last_event_id=NEW.id AND snapshot=NEW.after_snapshot)) BEGIN SELECT RAISE(ABORT,'Invalid inspection event'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_photo_valid BEFORE INSERT ON property_inspection_photos WHEN NOT (NEW.content_type IN('image/jpeg','image/png') AND NEW.size BETWEEN 1 AND 4194304 AND EXISTS(SELECT 1 FROM property_inspection_events e WHERE e.id=NEW.event_id AND e.owner_id=NEW.owner_id AND e.inspection_id=NEW.inspection_id AND e.property_id=NEW.property_id AND e.version=NEW.version AND EXISTS(SELECT 1 FROM json_each(e.after_snapshot,'$.items') j WHERE json_extract(j.value,'$.id')=NEW.item_id))) BEGIN SELECT RAISE(ABORT,'Invalid inspection photo'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_signature_valid BEFORE INSERT ON property_inspection_signatures WHEN NOT (EXISTS(SELECT 1 FROM property_inspections i JOIN properties p ON p.id=i.property_id AND p.owner_id=i.owner_id WHERE i.id=NEW.inspection_id AND p.state_code IS i.state_code AND p.worksite_id IS i.worksite_id AND p.archived_at IS NULL) AND NEW.content_type='image/png' AND NEW.size BETWEEN 1 AND 300000 AND json_valid(NEW.actor_snapshot) AND json_extract(NEW.actor_snapshot,'$.user_id')=NEW.actor_user_id AND EXISTS(SELECT 1 FROM property_inspection_events e JOIN property_inspections i ON i.id=e.inspection_id AND i.owner_id=e.owner_id AND i.property_id=e.property_id WHERE e.id=NEW.event_id AND e.inspection_id=NEW.inspection_id AND e.owner_id=NEW.owner_id AND e.property_id=NEW.property_id AND e.version=NEW.version AND i.version=NEW.version AND i.last_event_id=NEW.event_id)) BEGIN SELECT RAISE(ABORT,'Invalid inspection signature'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_events_no_update BEFORE UPDATE ON property_inspection_events BEGIN SELECT RAISE(ABORT,'Inspection history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_events_no_delete BEFORE DELETE ON property_inspection_events BEGIN SELECT RAISE(ABORT,'Inspection history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_photos_no_update BEFORE UPDATE ON property_inspection_photos BEGIN SELECT RAISE(ABORT,'Inspection photos are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_photos_no_delete BEFORE DELETE ON property_inspection_photos BEGIN SELECT RAISE(ABORT,'Inspection photos are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_signatures_no_update BEFORE UPDATE ON property_inspection_signatures BEGIN SELECT RAISE(ABORT,'Inspection signatures are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_inspection_signatures_no_delete BEFORE DELETE ON property_inspection_signatures BEGIN SELECT RAISE(ABORT,'Inspection signatures are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER regional_capture_property_inspection AFTER INSERT ON property_inspections BEGIN INSERT INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) VALUES('property_inspection:'||NEW.id,'property_inspection',NEW.id,NEW.property_id,NEW.state_code,NEW.worksite_id,NULL,NEW.created_at); END;
--> statement-breakpoint
CREATE TRIGGER regional_capture_property_inspection_event AFTER INSERT ON property_inspection_events BEGIN INSERT INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,previous_worksite_id,created_at) VALUES('property_inspection_event:'||NEW.id,'property_inspection_event',NEW.id,NEW.property_id,json_extract(NEW.after_snapshot,'$.property.state_code'),json_extract(NEW.after_snapshot,'$.property.worksite_id'),CASE WHEN json_type(NEW.before_snapshot)='null' THEN NULL ELSE COALESCE(json_extract(NEW.before_snapshot,'$.property.state_code'),'UNKNOWN') END,json_extract(NEW.before_snapshot,'$.property.worksite_id'),NEW.created_at); END;
--> statement-breakpoint
