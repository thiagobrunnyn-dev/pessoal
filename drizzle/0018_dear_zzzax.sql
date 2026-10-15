CREATE TABLE `property_front_photo_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`uploaded_by_name` text NOT NULL,
	`reason` text NOT NULL,
	`property_revision` integer NOT NULL,
	`previous_asset_id` text,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_front_photo_assets_object_key_unique` ON `property_front_photo_assets` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `property_front_photo_assets_request_id_unique` ON `property_front_photo_assets` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_property_front_photos_history` ON `property_front_photo_assets` (`owner_id`,`property_id`,`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `housing_handovers` ADD `property_details_snapshot` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `bedrooms` integer;--> statement-breakpoint
ALTER TABLE `properties` ADD `bathrooms` integer;--> statement-breakpoint
ALTER TABLE `properties` ADD `front_photo_asset_id` text;
--> statement-breakpoint
CREATE TRIGGER property_front_assets_immutable_update BEFORE UPDATE ON property_front_photo_assets BEGIN SELECT RAISE(ABORT,'Property photo history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_front_assets_immutable_delete BEFORE DELETE ON property_front_photo_assets BEGIN SELECT RAISE(ABORT,'Property photo history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_counts_valid_insert BEFORE INSERT ON properties WHEN NOT ((NEW.bedrooms IS NULL OR (typeof(NEW.bedrooms)='integer' AND NEW.bedrooms>=0 AND NEW.bedrooms<=9007199254740991)) AND (NEW.bathrooms IS NULL OR (typeof(NEW.bathrooms)='integer' AND NEW.bathrooms>=0 AND NEW.bathrooms<=9007199254740991))) BEGIN SELECT RAISE(ABORT,'Invalid property counts'); END;
--> statement-breakpoint
CREATE TRIGGER property_counts_valid_update BEFORE UPDATE OF bedrooms,bathrooms ON properties WHEN NOT ((NEW.bedrooms IS NULL OR (typeof(NEW.bedrooms)='integer' AND NEW.bedrooms>=0 AND NEW.bedrooms<=9007199254740991)) AND (NEW.bathrooms IS NULL OR (typeof(NEW.bathrooms)='integer' AND NEW.bathrooms>=0 AND NEW.bathrooms<=9007199254740991))) BEGIN SELECT RAISE(ABORT,'Invalid property counts'); END;
