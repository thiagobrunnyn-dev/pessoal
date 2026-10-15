CREATE TABLE `guest_document_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`state_code` text NOT NULL,
	`profile_revision` integer NOT NULL,
	`label` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `person_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_document_assets_object_key_unique` ON `guest_document_assets` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_document_assets_request_id_unique` ON `guest_document_assets` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_guest_documents_profile` ON `guest_document_assets` (`owner_id`,`profile_id`);
--> statement-breakpoint
CREATE TRIGGER guest_documents_no_update BEFORE UPDATE ON guest_document_assets BEGIN SELECT RAISE(ABORT,'guest_document_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER guest_documents_no_delete BEFORE DELETE ON guest_document_assets BEGIN SELECT RAISE(ABORT,'guest_document_immutable'); END;
