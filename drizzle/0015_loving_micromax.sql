CREATE TABLE `execution_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`attribution_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`act_kind` text NOT NULL,
	`source_revision` integer NOT NULL,
	`source_digest` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_user_id` text,
	`grant_id` text,
	`session_id` text,
	`actor_name` text NOT NULL,
	`accepted_at` text NOT NULL,
	`statement_version` text NOT NULL,
	`statement_text` text NOT NULL,
	`signature_object_key` text NOT NULL,
	`signature_content_type` text NOT NULL,
	`signature_size` integer NOT NULL,
	`signature_sha256` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	FOREIGN KEY (`attribution_id`) REFERENCES `service_attributions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `execution_acceptances_request_id_unique` ON `execution_acceptances` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_acceptance_attribution` ON `execution_acceptances` (`attribution_id`);--> statement-breakpoint
CREATE TABLE `person_photo_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `person_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `person_profile_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`before_snapshot` text NOT NULL,
	`after_snapshot` text NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `person_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_profile_events_request_id_unique` ON `person_profile_events` (`request_id`);--> statement-breakpoint
CREATE TABLE `person_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`directory` text NOT NULL,
	`display_name` text NOT NULL,
	`job_title` text NOT NULL,
	`state_code` text,
	`supervisor_profile_id` text,
	`app_member_user_id` text,
	`current_photo_asset_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`last_event_id` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_people_owner_state` ON `person_profiles` (`owner_id`,`state_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_people_member` ON `person_profiles` (`owner_id`,`app_member_user_id`) WHERE "person_profiles"."app_member_user_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `service_attributions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`act_kind` text NOT NULL,
	`source_revision` integer NOT NULL,
	`executor_profile_id` text,
	`executor_name` text NOT NULL,
	`executor_title` text DEFAULT '' NOT NULL,
	`executor_photo_asset_id` text,
	`executor_user_id` text,
	`principal_kind` text NOT NULL,
	`actor_user_id` text,
	`grant_id` text,
	`actor_name` text NOT NULL,
	`actor_title` text DEFAULT '' NOT NULL,
	`actor_profile_id` text,
	`actor_photo_asset_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`executor_profile_id`) REFERENCES `person_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`executor_photo_asset_id`) REFERENCES `person_photo_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attribution_record_revision` ON `service_attributions` (`owner_id`,`entity_type`,`entity_id`,`act_kind`,`source_revision`);
--> statement-breakpoint
CREATE TRIGGER regional_person_epoch AFTER UPDATE ON person_profiles WHEN OLD.state_code IS NOT NEW.state_code OR OLD.app_member_user_id IS NOT NEW.app_member_user_id OR OLD.status IS NOT NEW.status BEGIN
 UPDATE regional_epoch SET version=version+1 WHERE id=1;
END;
--> statement-breakpoint
CREATE TRIGGER regional_capture_service_attribution AFTER INSERT ON service_attributions BEGIN
 INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,created_at)
 SELECT 'service_attribution:'||NEW.id,'service_attribution',NEW.id,p.id,p.state_code,p.worksite_id,NEW.created_at FROM properties p WHERE p.id=(CASE NEW.entity_type
 WHEN 'maintenance' THEN (SELECT e.property_id FROM maintenance m JOIN equipment e ON e.id=m.equipment_id WHERE m.id=NEW.entity_id AND m.owner_id=NEW.owner_id)
 WHEN 'cleaning_record' THEN (SELECT l.property_id FROM cleaning_records r JOIN cleaning_locations l ON l.id=r.location_id WHERE r.id=NEW.entity_id AND r.owner_id=NEW.owner_id)
 WHEN 'work_order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.entity_id AND owner_id=NEW.owner_id)
 WHEN 'handover' THEN (SELECT property_id FROM housing_handovers WHERE id=NEW.entity_id AND owner_id=NEW.owner_id) END);
END;
