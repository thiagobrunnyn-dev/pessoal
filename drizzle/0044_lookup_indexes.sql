CREATE INDEX `idx_equipment_property` ON `equipment` (`property_id`);--> statement-breakpoint
CREATE INDEX `idx_cleaning_locations_property` ON `cleaning_locations` (`property_id`);--> statement-breakpoint
CREATE INDEX `idx_person_profile_events_profile` ON `person_profile_events` (`profile_id`);--> statement-breakpoint
CREATE INDEX `idx_person_photo_assets_profile` ON `person_photo_assets` (`profile_id`);--> statement-breakpoint
CREATE INDEX `idx_archive_events_entity` ON `archive_events` (`owner_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_properties_worksite` ON `properties` (`worksite_id`);--> statement-breakpoint
CREATE INDEX `idx_visit_sessions_grant` ON `visit_sessions` (`grant_id`);--> statement-breakpoint
CREATE INDEX `idx_cleaning_sessions_grant` ON `cleaning_sessions` (`grant_id`);
