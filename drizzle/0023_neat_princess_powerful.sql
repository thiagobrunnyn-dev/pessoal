CREATE TABLE `property_creation_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`request_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`property_id` text NOT NULL,
	`property_revision` integer NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`front_photo_asset_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`front_photo_asset_id`) REFERENCES `property_front_photo_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_creation_requests_owner_request` ON `property_creation_requests` (`owner_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_creation_requests_property` ON `property_creation_requests` (`property_id`);--> statement-breakpoint
ALTER TABLE `properties` ADD `property_type` text;
--> statement-breakpoint
CREATE TRIGGER property_creation_requests_immutable_update BEFORE UPDATE ON property_creation_requests BEGIN
  SELECT RAISE(ABORT,'Property creation history is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER property_creation_requests_immutable_delete BEFORE DELETE ON property_creation_requests BEGIN
  SELECT RAISE(ABORT,'Property creation history is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER property_creation_requests_valid_insert BEFORE INSERT ON property_creation_requests
WHEN NOT EXISTS(SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.owner_id=NEW.owner_id
  AND p.revision=NEW.property_revision AND p.state_code IS NEW.state_code AND p.worksite_id IS NEW.worksite_id
  AND p.front_photo_asset_id IS NEW.front_photo_asset_id AND p.created_at=NEW.created_at
  AND (NEW.front_photo_asset_id IS NULL OR EXISTS(SELECT 1 FROM property_front_photo_assets a
    WHERE a.id=NEW.front_photo_asset_id AND a.owner_id=p.owner_id AND a.property_id=p.id
      AND a.property_revision=p.revision AND a.previous_asset_id IS NULL AND a.created_at=p.created_at
      AND a.state_code IS p.state_code AND a.worksite_id IS p.worksite_id AND a.uploaded_by_user_id=NEW.actor_user_id
      AND a.request_fingerprint=NEW.request_fingerprint)))
BEGIN SELECT RAISE(ABORT,'Invalid property creation record'); END;

--> statement-breakpoint
CREATE TRIGGER property_type_valid_insert BEFORE INSERT ON properties WHEN NEW.property_type IS NOT NULL AND NEW.property_type NOT IN ('house','apartment','building') BEGIN SELECT RAISE(ABORT,'Invalid property type'); END;
--> statement-breakpoint
CREATE TRIGGER property_type_valid_update BEFORE UPDATE OF property_type ON properties WHEN NEW.property_type IS NOT NULL AND NEW.property_type NOT IN ('house','apartment','building') BEGIN SELECT RAISE(ABORT,'Invalid property type'); END;
