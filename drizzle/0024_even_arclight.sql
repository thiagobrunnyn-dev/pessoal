CREATE TABLE `property_furniture` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`property_name` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`environments` text NOT NULL,
	`equipment` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_event_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_furniture_property_id_unique` ON `property_furniture` (`property_id`);--> statement-breakpoint
CREATE INDEX `idx_property_furniture_owner` ON `property_furniture` (`owner_id`,`property_id`);--> statement-breakpoint
CREATE TABLE `property_furniture_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`furniture_id` text NOT NULL,
	`property_id` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`action` text NOT NULL,
	`before_snapshot` text NOT NULL,
	`after_snapshot` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`photo_count` integer DEFAULT 0 NOT NULL,
	`request_fingerprint` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`furniture_id`) REFERENCES `property_furniture`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_furniture_events_request_id_unique` ON `property_furniture_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_property_furniture_events_history` ON `property_furniture_events` (`owner_id`,`furniture_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `property_furniture_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`furniture_id` text NOT NULL,
	`event_id` text NOT NULL,
	`equipment_item_id` text NOT NULL,
	`equipment_item_snapshot` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`position` integer NOT NULL,
	`uploaded_at` text NOT NULL,
	FOREIGN KEY (`furniture_id`) REFERENCES `property_furniture`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `property_furniture_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_furniture_photos_object_key_unique` ON `property_furniture_photos` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_property_furniture_photos_item` ON `property_furniture_photos` (`owner_id`,`furniture_id`,`equipment_item_id`,`uploaded_at`);--> statement-breakpoint
CREATE TRIGGER property_furniture_scope_immutable BEFORE UPDATE OF id,owner_id,property_id,property_name,state_code,worksite_id,created_by,created_at ON property_furniture BEGIN SELECT RAISE(ABORT,'Furniture source and scope are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_furniture_no_delete BEFORE DELETE ON property_furniture BEGIN SELECT RAISE(ABORT,'Furniture history cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER property_furniture_valid_insert BEFORE INSERT ON property_furniture
WHEN NEW.version!=1 OR NOT json_valid(NEW.environments) OR NOT json_valid(NEW.equipment)
 OR NOT EXISTS(SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.owner_id=NEW.owner_id AND p.state_code IS NEW.state_code AND p.worksite_id IS NEW.worksite_id AND p.archived_at IS NULL)
 OR EXISTS(SELECT 1 FROM mobilizations m WHERE m.property_id=NEW.property_id AND m.owner_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'Invalid furniture source'); END;
--> statement-breakpoint
CREATE TRIGGER property_furniture_valid_update BEFORE UPDATE ON property_furniture
WHEN NEW.version!=OLD.version+1 OR NOT json_valid(NEW.environments) OR NOT json_valid(NEW.equipment)
 OR NOT EXISTS(SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.owner_id=NEW.owner_id AND p.state_code IS NEW.state_code AND p.worksite_id IS NEW.worksite_id AND p.archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Invalid furniture version or scope'); END;
--> statement-breakpoint
CREATE TRIGGER property_furniture_events_immutable_update BEFORE UPDATE ON property_furniture_events BEGIN SELECT RAISE(ABORT,'Furniture history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_furniture_events_immutable_delete BEFORE DELETE ON property_furniture_events BEGIN SELECT RAISE(ABORT,'Furniture history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_furniture_events_valid_insert BEFORE INSERT ON property_furniture_events
WHEN NOT EXISTS(SELECT 1 FROM property_furniture f WHERE f.id=NEW.furniture_id AND f.owner_id=NEW.owner_id AND f.property_id=NEW.property_id AND f.last_event_id=NEW.id AND f.state_code IS NEW.state_code AND f.worksite_id IS NEW.worksite_id AND f.version=json_extract(NEW.after_snapshot,'$.version') AND f.property_id=json_extract(NEW.after_snapshot,'$.property_id') AND f.state_code IS json_extract(NEW.after_snapshot,'$.state_code') AND f.worksite_id IS json_extract(NEW.after_snapshot,'$.worksite_id'))
BEGIN SELECT RAISE(ABORT,'Invalid furniture event'); END;
--> statement-breakpoint
CREATE TRIGGER property_furniture_photos_immutable_update BEFORE UPDATE ON property_furniture_photos BEGIN SELECT RAISE(ABORT,'Furniture evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_furniture_photos_immutable_delete BEFORE DELETE ON property_furniture_photos BEGIN SELECT RAISE(ABORT,'Furniture evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_furniture_photos_valid_insert BEFORE INSERT ON property_furniture_photos
WHEN NEW.size<1 OR NEW.size>4194304 OR NEW.content_type NOT IN ('image/jpeg','image/png','image/webp') OR NOT EXISTS(SELECT 1 FROM property_furniture_events e JOIN property_furniture f ON f.id=e.furniture_id AND f.owner_id=e.owner_id WHERE e.id=NEW.event_id AND e.furniture_id=NEW.furniture_id AND e.owner_id=NEW.owner_id AND f.last_event_id=e.id AND EXISTS(SELECT 1 FROM json_each(json_extract(e.after_snapshot,'$.equipment')) i WHERE json_extract(i.value,'$.id')=NEW.equipment_item_id) AND json_extract(NEW.equipment_item_snapshot,'$.id')=NEW.equipment_item_id AND json_extract(NEW.equipment_item_snapshot,'$.version')=json_extract(e.after_snapshot,'$.version'))
BEGIN SELECT RAISE(ABORT,'Invalid furniture evidence'); END;
