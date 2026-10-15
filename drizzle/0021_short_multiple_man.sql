CREATE TABLE `property_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`preview_request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`document_hash` text NOT NULL,
	`source_format` text NOT NULL,
	`status` text DEFAULT 'preview' NOT NULL,
	`review_hash` text NOT NULL,
	`catalog_snapshot` text NOT NULL,
	`catalog_counter` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`commit_token` text,
	`confirm_request_id` text,
	`confirm_fingerprint` text,
	`confirmed_by` text,
	`completed_at` text,
	`selected_row_ids_json` text DEFAULT '[]' NOT NULL,
	`selected_count` integer DEFAULT 0 NOT NULL,
	`created_count` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "property_import_batch_status" CHECK("property_import_batches"."status" IN ('preview','committing','completed')),
	CONSTRAINT "property_import_batch_counts" CHECK("property_import_batches"."selected_count" BETWEEN 0 AND 100 AND "property_import_batches"."created_count" BETWEEN 0 AND "property_import_batches"."selected_count"),
	CONSTRAINT "property_import_batch_complete" CHECK("property_import_batches"."status" != 'completed' OR ("property_import_batches"."created_count" = "property_import_batches"."selected_count" AND "property_import_batches"."selected_count" > 0 AND "property_import_batches"."completed_at" IS NOT NULL AND "property_import_batches"."confirmed_by" IS NOT NULL AND "property_import_batches"."commit_token" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_import_preview_request` ON `property_import_batches` (`owner_id`,`preview_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_import_confirm_request` ON `property_import_batches` (`owner_id`,`confirm_request_id`);--> statement-breakpoint
CREATE INDEX `idx_property_import_owner_created` ON `property_import_batches` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `property_import_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`position` integer NOT NULL,
	`source_key` text NOT NULL,
	`original_json` text NOT NULL,
	`normalized_json` text NOT NULL,
	`address_key` text NOT NULL,
	`state_code` text,
	`status` text NOT NULL,
	`issues_json` text NOT NULL,
	`duplicate_json` text,
	`result_status` text DEFAULT 'pending' NOT NULL,
	`property_id` text,
	`control_number` integer,
	FOREIGN KEY (`batch_id`) REFERENCES `property_import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "property_import_row_status" CHECK("property_import_rows"."status" IN ('valid','duplicate','invalid')),
	CONSTRAINT "property_import_result_status" CHECK("property_import_rows"."result_status" IN ('pending','created','ignored')),
	CONSTRAINT "property_import_created_result" CHECK(("property_import_rows"."result_status" = 'created' AND "property_import_rows"."property_id" IS NOT NULL AND "property_import_rows"."control_number" IS NOT NULL AND "property_import_rows"."control_number" > 0) OR ("property_import_rows"."result_status" != 'created' AND "property_import_rows"."property_id" IS NULL AND "property_import_rows"."control_number" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_import_row_position` ON `property_import_rows` (`batch_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_import_row_property` ON `property_import_rows` (`property_id`);
--> statement-breakpoint
CREATE TRIGGER property_import_batch_source_immutable BEFORE UPDATE OF owner_id,preview_request_id,request_fingerprint,document_hash,source_format,review_hash,catalog_snapshot,catalog_counter,created_by,created_at ON property_import_batches BEGIN SELECT RAISE(ABORT,'property import source is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_import_batch_completed_immutable BEFORE UPDATE ON property_import_batches WHEN OLD.status='completed' BEGIN SELECT RAISE(ABORT,'property import receipt is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_import_batch_no_delete BEFORE DELETE ON property_import_batches BEGIN SELECT RAISE(ABORT,'property import source is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_import_row_source_immutable BEFORE UPDATE OF batch_id,position,source_key,original_json,normalized_json,address_key,state_code,status,issues_json,duplicate_json ON property_import_rows BEGIN SELECT RAISE(ABORT,'property import source is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_import_row_result_immutable BEFORE UPDATE ON property_import_rows WHEN OLD.result_status!='pending' BEGIN SELECT RAISE(ABORT,'property import receipt is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER property_import_row_no_delete BEFORE DELETE ON property_import_rows BEGIN SELECT RAISE(ABORT,'property import source is immutable'); END;

