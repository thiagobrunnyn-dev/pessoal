CREATE TABLE `mobilization_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`mobilization_id` text NOT NULL,
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
	FOREIGN KEY (`mobilization_id`) REFERENCES `mobilizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobilization_events_request_id_unique` ON `mobilization_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_mobilization_events_history` ON `mobilization_events` (`owner_id`,`mobilization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `mobilization_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`mobilization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`position` integer NOT NULL,
	`uploaded_at` text NOT NULL,
	FOREIGN KEY (`mobilization_id`) REFERENCES `mobilizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `mobilization_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobilization_photos_object_key_unique` ON `mobilization_photos` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_mobilization_photos_history` ON `mobilization_photos` (`owner_id`,`mobilization_id`,`uploaded_at`);--> statement-breakpoint
CREATE TABLE `mobilizations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`client_id` text NOT NULL,
	`cost_center_id` text NOT NULL,
	`property_name` text NOT NULL,
	`address` text NOT NULL,
	`client_name` text NOT NULL,
	`cost_center_name` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`housing_type` text NOT NULL,
	`building_type` text NOT NULL,
	`environments` text DEFAULT '[]' NOT NULL,
	`responsible` text NOT NULL,
	`due_on` text,
	`planned_slots` integer,
	`stage` text NOT NULL,
	`equipment` text NOT NULL,
	`checklist` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`pending_count` integer DEFAULT 0 NOT NULL,
	`equipment_shortfall_count` integer DEFAULT 0 NOT NULL,
	`equipment_unknown_count` integer DEFAULT 0 NOT NULL,
	`handover_id` text,
	`handover_snapshot` text,
	`version` integer DEFAULT 1 NOT NULL,
	`last_event_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`handover_id`) REFERENCES `housing_handovers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mobilizations_owner_stage` ON `mobilizations` (`owner_id`,`stage`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_mobilizations_property` ON `mobilizations` (`property_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mobilizations_handover` ON `mobilizations` (`handover_id`);
--> statement-breakpoint
--> statement-breakpoint
CREATE TRIGGER mobilization_events_immutable_update BEFORE UPDATE ON mobilization_events BEGIN SELECT RAISE(ABORT,'Mobilization history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER mobilization_events_immutable_delete BEFORE DELETE ON mobilization_events BEGIN SELECT RAISE(ABORT,'Mobilization history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER mobilization_photos_immutable_update BEFORE UPDATE ON mobilization_photos BEGIN SELECT RAISE(ABORT,'Mobilization photos are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER mobilization_photos_immutable_delete BEFORE DELETE ON mobilization_photos BEGIN SELECT RAISE(ABORT,'Mobilization photos are immutable'); END;

--> statement-breakpoint
-- Append to the new migration; schema-only. No backfill or reclassification of old records.
--> statement-breakpoint
CREATE TRIGGER regional_epoch_mobilizations AFTER UPDATE ON mobilizations WHEN OLD.property_id IS NOT NEW.property_id OR OLD.client_id IS NOT NEW.client_id OR OLD.cost_center_id IS NOT NEW.cost_center_id BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER regional_capture_mobilization_insert AFTER INSERT ON mobilizations BEGIN
 INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at)
 VALUES('mobilization:'||NEW.id,'mobilization',NEW.id,NEW.property_id,NEW.state_code,NEW.worksite_id,NULL,NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER regional_capture_mobilization_event_insert AFTER INSERT ON mobilization_events BEGIN
 INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,previous_worksite_id,created_at)
 VALUES('mobilization_event:'||NEW.id,'mobilization_event',NEW.id,json_extract(NEW.after_snapshot,'$.property_id'),json_extract(NEW.after_snapshot,'$.state_code'),json_extract(NEW.after_snapshot,'$.worksite_id'),CASE WHEN json_type(NEW.before_snapshot)='null' THEN NULL ELSE COALESCE(json_extract(NEW.before_snapshot,'$.state_code'),'UNKNOWN') END,json_extract(NEW.before_snapshot,'$.worksite_id'),NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER regional_invalidate_transfer_mobilizations AFTER UPDATE ON mobilizations WHEN OLD.property_id IS NOT NEW.property_id BEGIN UPDATE regional_snapshots SET state_code=NULL WHERE entity_type='mobilization' AND entity_id=NEW.id; END;

--> statement-breakpoint
--> statement-breakpoint
CREATE TRIGGER active_parent_mobilizations BEFORE INSERT ON mobilizations WHEN NOT (EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND owner_id=NEW.owner_id AND archived_at IS NULL) AND EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND owner_id=NEW.owner_id AND archived_at IS NULL) AND EXISTS(SELECT 1 FROM cost_centers WHERE id=NEW.cost_center_id AND owner_id=NEW.owner_id AND client_id=NEW.client_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Cadastro arquivado ou vínculo indisponível'); END;

--> statement-breakpoint
--> statement-breakpoint
CREATE TRIGGER valid_mobilization_insert BEFORE INSERT ON mobilizations WHEN NOT (NEW.housing_type IN('republic','lodging') AND NEW.building_type IN('house','building') AND NEW.stage IN('new','survey','preparation','inspection','ready') AND json_valid(NEW.environments) AND json_valid(NEW.equipment) AND json_valid(NEW.checklist) AND (NEW.handover_snapshot IS NULL OR json_valid(NEW.handover_snapshot)) AND (NEW.planned_slots IS NULL OR (typeof(NEW.planned_slots)='integer' AND NEW.planned_slots>=0 AND NEW.planned_slots<=9007199254740991))) BEGIN SELECT RAISE(ABORT,'Dados da mobilização inválidos'); END;

--> statement-breakpoint
--> statement-breakpoint
CREATE TRIGGER valid_mobilization_update BEFORE UPDATE ON mobilizations WHEN NOT (NEW.housing_type IN('republic','lodging') AND NEW.building_type IN('house','building') AND NEW.stage IN('new','survey','preparation','inspection','ready') AND json_valid(NEW.environments) AND json_valid(NEW.equipment) AND json_valid(NEW.checklist) AND (NEW.handover_snapshot IS NULL OR json_valid(NEW.handover_snapshot)) AND (NEW.planned_slots IS NULL OR (typeof(NEW.planned_slots)='integer' AND NEW.planned_slots>=0 AND NEW.planned_slots<=9007199254740991))) BEGIN SELECT RAISE(ABORT,'Dados da mobilização inválidos'); END;
