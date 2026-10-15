CREATE TABLE `vehicle_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`state_code` text,
	`previous_state_code` text,
	`before_snapshot` text NOT NULL,
	`after_snapshot` text NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "vehicle_event_action" CHECK("vehicle_events"."action" IN ('create','update','archive','restore')),
	CONSTRAINT "vehicle_event_snapshots" CHECK(json_valid("vehicle_events"."before_snapshot") AND json_valid("vehicle_events"."after_snapshot"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_vehicle_events_request` ON `vehicle_events` (`owner_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_vehicle_events_revision` ON `vehicle_events` (`vehicle_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_vehicle_events_history` ON `vehicle_events` (`owner_id`,`vehicle_id`,`revision`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`plate` text NOT NULL,
	`brand` text,
	`model` text,
	`year` integer,
	`state_code` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`last_event_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "vehicle_plate_valid" CHECK(length("vehicles"."plate")=7 AND "vehicles"."plate" GLOB '[A-Z][A-Z][A-Z][0-9][A-Z0-9][0-9][0-9]'),
	CONSTRAINT "vehicle_revision_valid" CHECK("vehicles"."revision" >= 1),
	CONSTRAINT "vehicle_year_valid" CHECK("vehicles"."year" IS NULL OR (typeof("vehicles"."year")='integer' AND "vehicles"."year" BETWEEN 1886 AND 9999)),
	CONSTRAINT "vehicle_state_valid" CHECK("vehicles"."state_code" IS NULL OR "vehicles"."state_code" IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_vehicles_owner_plate` ON `vehicles` (`owner_id`,`plate`);--> statement-breakpoint
CREATE INDEX `idx_vehicles_owner_state` ON `vehicles` (`owner_id`,`state_code`);--> statement-breakpoint
CREATE TRIGGER vehicles_identity_immutable BEFORE UPDATE OF id,owner_id,created_by,created_at ON vehicles
BEGIN SELECT RAISE(ABORT,'Vehicle identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER vehicles_no_delete BEFORE DELETE ON vehicles
BEGIN SELECT RAISE(ABORT,'Vehicles must be archived'); END;
--> statement-breakpoint
CREATE TRIGGER vehicles_valid_insert BEFORE INSERT ON vehicles
WHEN NEW.revision!=1 OR NEW.archived_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Invalid initial vehicle revision'); END;
--> statement-breakpoint
CREATE TRIGGER vehicles_valid_update BEFORE UPDATE ON vehicles
WHEN NEW.revision!=OLD.revision+1 OR NEW.last_event_id=OLD.last_event_id
BEGIN SELECT RAISE(ABORT,'Invalid vehicle revision'); END;
--> statement-breakpoint
CREATE TRIGGER regional_epoch_vehicles AFTER UPDATE OF state_code ON vehicles WHEN OLD.state_code IS NOT NEW.state_code
BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER vehicle_events_immutable_update BEFORE UPDATE ON vehicle_events
BEGIN SELECT RAISE(ABORT,'Vehicle history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER vehicle_events_immutable_delete BEFORE DELETE ON vehicle_events
BEGIN SELECT RAISE(ABORT,'Vehicle history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER vehicle_events_valid_insert BEFORE INSERT ON vehicle_events
WHEN NOT EXISTS(SELECT 1 FROM vehicles v WHERE v.id=NEW.vehicle_id AND v.owner_id=NEW.owner_id AND v.last_event_id=NEW.id
 AND v.revision=NEW.revision AND v.revision=json_extract(NEW.after_snapshot,'$.revision')
 AND v.plate=json_extract(NEW.after_snapshot,'$.plate') AND v.brand IS json_extract(NEW.after_snapshot,'$.brand')
 AND v.model IS json_extract(NEW.after_snapshot,'$.model') AND v.year IS json_extract(NEW.after_snapshot,'$.year')
 AND v.state_code IS NEW.state_code AND v.state_code IS json_extract(NEW.after_snapshot,'$.state_code')
 AND v.archived_at IS json_extract(NEW.after_snapshot,'$.archived_at')
 AND NEW.previous_state_code IS json_extract(NEW.before_snapshot,'$.state_code'))
 OR (NEW.action='create' AND (NEW.revision!=1 OR json_type(NEW.before_snapshot)!='null' OR json_extract(NEW.after_snapshot,'$.archived_at') IS NOT NULL))
 OR (NEW.action!='create' AND NOT EXISTS(SELECT 1 FROM vehicle_events previous WHERE previous.vehicle_id=NEW.vehicle_id AND previous.owner_id=NEW.owner_id AND previous.revision=NEW.revision-1 AND previous.after_snapshot=NEW.before_snapshot))
 OR (NEW.action='update' AND json_extract(NEW.before_snapshot,'$.archived_at') IS NOT json_extract(NEW.after_snapshot,'$.archived_at'))
 OR (NEW.action='archive' AND (json_extract(NEW.before_snapshot,'$.archived_at') IS NOT NULL OR json_extract(NEW.after_snapshot,'$.archived_at') IS NULL))
 OR (NEW.action='restore' AND (json_extract(NEW.before_snapshot,'$.archived_at') IS NULL OR json_extract(NEW.after_snapshot,'$.archived_at') IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Invalid vehicle history'); END;
