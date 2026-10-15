ALTER TABLE `mobilization_photos` ADD `equipment_item_id` text;--> statement-breakpoint
ALTER TABLE `mobilization_photos` ADD `equipment_item_snapshot` text;--> statement-breakpoint
CREATE INDEX `idx_mobilization_photos_item` ON `mobilization_photos` (`owner_id`,`mobilization_id`,`equipment_item_id`,`uploaded_at`);