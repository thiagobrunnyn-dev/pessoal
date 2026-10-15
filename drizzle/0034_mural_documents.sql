CREATE TABLE `mural_document_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`document_id` text NOT NULL,
	`property_id` text,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer DEFAULT 0 NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`before_snapshot` text NOT NULL,
	`after_snapshot` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `mural_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mural_event_action" CHECK("mural_document_events"."action" IN ('create','replace','update','archive','restore'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mural_document_events_request_id_unique` ON `mural_document_events` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mural_event_revision` ON `mural_document_events` (`document_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_mural_events_history` ON `mural_document_events` (`owner_id`,`document_id`,`revision`);--> statement-breakpoint
CREATE TABLE `mural_document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`document_id` text NOT NULL,
	`property_id` text,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer DEFAULT 0 NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`original_name` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text DEFAULT 'application/pdf' NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`page_count` integer NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `mural_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mural_pdf_size" CHECK("mural_document_versions"."size">0 AND "mural_document_versions"."size"<=12582912 AND "mural_document_versions"."page_count" BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mural_document_versions_object_key_unique` ON `mural_document_versions` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mural_file_version` ON `mural_document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_mural_versions_history` ON `mural_document_versions` (`owner_id`,`document_id`,`version`);--> statement-breakpoint
CREATE TABLE `mural_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`current_version_id` text NOT NULL,
	`file_version` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`last_event_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mural_revision_positive" CHECK("mural_documents"."revision">0 AND "mural_documents"."file_version">0)
);
--> statement-breakpoint
CREATE INDEX `idx_mural_documents_scope` ON `mural_documents` (`owner_id`,`property_id`,`archived_at`);
--> statement-breakpoint
CREATE TRIGGER mural_version_immutable_update BEFORE UPDATE ON mural_document_versions BEGIN SELECT RAISE(ABORT,'mural_version_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER mural_version_immutable_delete BEFORE DELETE ON mural_document_versions BEGIN SELECT RAISE(ABORT,'mural_version_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER mural_event_immutable_update BEFORE UPDATE ON mural_document_events BEGIN SELECT RAISE(ABORT,'mural_event_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER mural_event_immutable_delete BEFORE DELETE ON mural_document_events BEGIN SELECT RAISE(ABORT,'mural_event_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER mural_document_keep_identity BEFORE UPDATE OF owner_id,property_id ON mural_documents WHEN OLD.owner_id IS NOT NEW.owner_id OR OLD.property_id IS NOT NEW.property_id BEGIN SELECT RAISE(ABORT,'mural_identity_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER mural_document_preserve BEFORE DELETE ON mural_documents BEGIN SELECT RAISE(ABORT,'mural_use_archive'); END;
