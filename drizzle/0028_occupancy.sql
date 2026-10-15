CREATE TABLE `occupancy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`room_id` text NOT NULL,
	`stay_id` text,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer NOT NULL,
	`action` text NOT NULL,
	`revision` integer NOT NULL,
	`before_snapshot` text NOT NULL,
	`after_snapshot` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `occupancy_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stay_id`) REFERENCES `occupancy_stays`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `occupancy_events_request_id_unique` ON `occupancy_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_occupancy_events_property` ON `occupancy_events` (`owner_id`,`property_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `occupancy_property_scopes` (
	`property_id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `occupancy_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`capacity` integer,
	`capacity_confirmed` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_event_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "occupancy_room_capacity" CHECK(("occupancy_rooms"."capacity" IS NULL AND "occupancy_rooms"."capacity_confirmed"=0) OR (typeof("occupancy_rooms"."capacity")='integer' AND "occupancy_rooms"."capacity" BETWEEN 0 AND 200 AND "occupancy_rooms"."capacity_confirmed"=1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_occupancy_room_name` ON `occupancy_rooms` (`owner_id`,`property_id`,`scope_version`,`name_key`);--> statement-breakpoint
CREATE INDEX `idx_occupancy_rooms_property` ON `occupancy_rooms` (`owner_id`,`property_id`,`scope_version`);--> statement-breakpoint
CREATE TABLE `occupancy_stays` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`property_id` text NOT NULL,
	`room_id` text NOT NULL,
	`state_code` text,
	`worksite_id` text,
	`scope_version` integer NOT NULL,
	`room_name` text NOT NULL,
	`slot_number` integer NOT NULL,
	`person_profile_id` text NOT NULL,
	`person_name` text NOT NULL,
	`person_title` text DEFAULT '' NOT NULL,
	`shift` text DEFAULT '' NOT NULL,
	`entry_on` text NOT NULL,
	`exit_on` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_event_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `occupancy_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_profile_id`) REFERENCES `person_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_occupancy_active_slot` ON `occupancy_stays` (`owner_id`,`room_id`,`slot_number`) WHERE "occupancy_stays"."exit_on" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_occupancy_active_person` ON `occupancy_stays` (`owner_id`,`person_profile_id`) WHERE "occupancy_stays"."exit_on" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_occupancy_stays_property` ON `occupancy_stays` (`owner_id`,`property_id`,`entry_on`);--> statement-breakpoint
CREATE INDEX `idx_occupancy_stays_person_interval` ON `occupancy_stays` (`owner_id`,`person_profile_id`,`entry_on`,`exit_on`);--> statement-breakpoint
CREATE INDEX `idx_occupancy_stays_slot_interval` ON `occupancy_stays` (`owner_id`,`room_id`,`slot_number`,`entry_on`,`exit_on`);
--> statement-breakpoint
-- Append after generated schema; metadata only, no seed occupancy.
CREATE TRIGGER occupancy_block_active_property_move BEFORE UPDATE OF state_code,worksite_id ON properties WHEN (OLD.state_code IS NOT NEW.state_code OR OLD.worksite_id IS NOT NEW.worksite_id) AND EXISTS(SELECT 1 FROM occupancy_stays WHERE property_id=OLD.id AND owner_id=OLD.owner_id AND exit_on IS NULL) BEGIN SELECT RAISE(ABORT,'Registre a saída dos ocupantes antes de transferir a UF ou obra do imóvel.'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_block_active_property_archive BEFORE UPDATE OF archived_at ON properties WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND EXISTS(SELECT 1 FROM occupancy_stays WHERE property_id=OLD.id AND owner_id=OLD.owner_id AND exit_on IS NULL) BEGIN SELECT RAISE(ABORT,'Registre a saída dos ocupantes antes de arquivar o imóvel.'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_property_scope_version AFTER UPDATE OF state_code,worksite_id ON properties WHEN OLD.state_code IS NOT NEW.state_code OR OLD.worksite_id IS NOT NEW.worksite_id BEGIN INSERT INTO occupancy_property_scopes(property_id,version) VALUES(NEW.id,1) ON CONFLICT(property_id) DO UPDATE SET version=version+1; END;
--> statement-breakpoint
CREATE TRIGGER occupancy_rooms_no_delete BEFORE DELETE ON occupancy_rooms BEGIN SELECT RAISE(ABORT,'occupancy_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_stays_no_delete BEFORE DELETE ON occupancy_stays BEGIN SELECT RAISE(ABORT,'occupancy_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_events_no_delete BEFORE DELETE ON occupancy_events BEGIN SELECT RAISE(ABORT,'occupancy_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_property_scopes_no_delete BEFORE DELETE ON occupancy_property_scopes BEGIN SELECT RAISE(ABORT,'occupancy_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_events_no_update BEFORE UPDATE ON occupancy_events BEGIN SELECT RAISE(ABORT,'occupancy_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_room_identity BEFORE UPDATE OF id,owner_id,property_id,state_code,worksite_id,scope_version,created_at ON occupancy_rooms BEGIN SELECT RAISE(ABORT,'occupancy_identity_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_room_valid_insert BEFORE INSERT ON occupancy_rooms WHEN NOT (length(trim(NEW.name)) BETWEEN 1 AND 100 AND length(NEW.name_key) BETWEEN 1 AND 100 AND typeof(NEW.revision)='integer' AND NEW.revision>=1 AND typeof(NEW.scope_version)='integer' AND NEW.scope_version>=0 AND EXISTS(SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.owner_id=NEW.owner_id AND p.archived_at IS NULL AND p.state_code IS NEW.state_code AND p.worksite_id IS NEW.worksite_id AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=NEW.scope_version) AND NEW.revision=1) BEGIN SELECT RAISE(ABORT,'occupancy_room_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_room_valid_update BEFORE UPDATE ON occupancy_rooms WHEN NOT (length(trim(NEW.name)) BETWEEN 1 AND 100 AND length(NEW.name_key) BETWEEN 1 AND 100 AND typeof(NEW.revision)='integer' AND NEW.revision>=1 AND typeof(NEW.scope_version)='integer' AND NEW.scope_version>=0 AND EXISTS(SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.owner_id=NEW.owner_id AND p.archived_at IS NULL AND p.state_code IS NEW.state_code AND p.worksite_id IS NEW.worksite_id AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=NEW.scope_version) AND NEW.revision=OLD.revision+1 AND NEW.last_event_id<>OLD.last_event_id AND NEW.request_id<>OLD.request_id) BEGIN SELECT RAISE(ABORT,'occupancy_room_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_room_active_capacity BEFORE UPDATE OF capacity,capacity_confirmed ON occupancy_rooms WHEN EXISTS(SELECT 1 FROM occupancy_stays WHERE room_id=OLD.id AND owner_id=OLD.owner_id AND exit_on IS NULL AND (NEW.capacity IS NULL OR NEW.capacity_confirmed<>1 OR slot_number>NEW.capacity)) BEGIN SELECT RAISE(ABORT,'occupancy_capacity_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_stay_identity BEFORE UPDATE OF id,owner_id,property_id,room_id,state_code,worksite_id,scope_version,room_name,slot_number,person_profile_id,person_name,person_title,shift,entry_on,created_at ON occupancy_stays BEGIN SELECT RAISE(ABORT,'occupancy_identity_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_stay_valid_insert BEFORE INSERT ON occupancy_stays WHEN NOT (EXISTS(SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.owner_id=NEW.owner_id AND p.archived_at IS NULL AND p.state_code IS NEW.state_code AND p.worksite_id IS NEW.worksite_id AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=NEW.scope_version) AND typeof(NEW.slot_number)='integer' AND NEW.slot_number BETWEEN 1 AND 200 AND typeof(NEW.revision)='integer' AND NEW.revision>=1 AND typeof(NEW.scope_version)='integer' AND NEW.scope_version>=0 AND length(NEW.entry_on)=10 AND NEW.entry_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(NEW.entry_on,'+0 days') IS NEW.entry_on AND NEW.entry_on<=date('now','-3 hours') AND (NEW.exit_on IS NULL OR (length(NEW.exit_on)=10 AND NEW.exit_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(NEW.exit_on,'+0 days') IS NEW.exit_on AND NEW.exit_on<=date('now','-3 hours') AND NEW.exit_on>=NEW.entry_on)) AND NEW.revision=1 AND EXISTS(SELECT 1 FROM occupancy_rooms r WHERE r.id=NEW.room_id AND r.owner_id=NEW.owner_id AND r.property_id=NEW.property_id AND r.scope_version=NEW.scope_version AND r.state_code IS NEW.state_code AND r.worksite_id IS NEW.worksite_id AND r.capacity_confirmed=1 AND NEW.slot_number<=r.capacity AND r.name=NEW.room_name) AND NEW.state_code IS NOT NULL AND EXISTS(SELECT 1 FROM person_profiles p WHERE p.id=NEW.person_profile_id AND p.owner_id=NEW.owner_id AND p.status='active' AND p.state_code=NEW.state_code AND p.display_name=NEW.person_name AND p.job_title=NEW.person_title)) BEGIN SELECT RAISE(ABORT,'occupancy_stay_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_stay_valid_update BEFORE UPDATE ON occupancy_stays WHEN NOT (EXISTS(SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.owner_id=NEW.owner_id AND p.archived_at IS NULL AND p.state_code IS NEW.state_code AND p.worksite_id IS NEW.worksite_id AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=NEW.scope_version) AND typeof(NEW.slot_number)='integer' AND NEW.slot_number BETWEEN 1 AND 200 AND typeof(NEW.revision)='integer' AND NEW.revision>=1 AND typeof(NEW.scope_version)='integer' AND NEW.scope_version>=0 AND length(NEW.entry_on)=10 AND NEW.entry_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(NEW.entry_on,'+0 days') IS NEW.entry_on AND NEW.entry_on<=date('now','-3 hours') AND (NEW.exit_on IS NULL OR (length(NEW.exit_on)=10 AND NEW.exit_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(NEW.exit_on,'+0 days') IS NEW.exit_on AND NEW.exit_on<=date('now','-3 hours') AND NEW.exit_on>=NEW.entry_on)) AND OLD.exit_on IS NULL AND NEW.exit_on IS NOT NULL AND NEW.revision=OLD.revision+1 AND NEW.last_event_id<>OLD.last_event_id AND NEW.request_id<>OLD.request_id) BEGIN SELECT RAISE(ABORT,'occupancy_stay_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_stay_overlap_insert BEFORE INSERT ON occupancy_stays WHEN (NEW.exit_on IS NULL OR NEW.entry_on<NEW.exit_on) AND EXISTS(SELECT 1 FROM occupancy_stays s WHERE s.owner_id=NEW.owner_id AND s.id<>NEW.id AND (s.person_profile_id=NEW.person_profile_id OR (s.room_id=NEW.room_id AND s.slot_number=NEW.slot_number)) AND (s.exit_on IS NULL OR s.entry_on<s.exit_on) AND NEW.entry_on<COALESCE(s.exit_on,'9999-12-31') AND s.entry_on<COALESCE(NEW.exit_on,'9999-12-31')) BEGIN SELECT RAISE(ABORT,'occupancy_interval_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_stay_overlap_update BEFORE UPDATE ON occupancy_stays WHEN (NEW.exit_on IS NULL OR NEW.entry_on<NEW.exit_on) AND EXISTS(SELECT 1 FROM occupancy_stays s WHERE s.owner_id=NEW.owner_id AND s.id<>NEW.id AND (s.person_profile_id=NEW.person_profile_id OR (s.room_id=NEW.room_id AND s.slot_number=NEW.slot_number)) AND (s.exit_on IS NULL OR s.entry_on<s.exit_on) AND NEW.entry_on<COALESCE(s.exit_on,'9999-12-31') AND s.entry_on<COALESCE(NEW.exit_on,'9999-12-31')) BEGIN SELECT RAISE(ABORT,'occupancy_interval_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_rooms_event_insert AFTER INSERT ON occupancy_rooms BEGIN INSERT INTO occupancy_events(id,owner_id,property_id,room_id,stay_id,state_code,worksite_id,scope_version,action,revision,before_snapshot,after_snapshot,actor_user_id,actor_name,request_id,request_fingerprint,created_at) VALUES(NEW.last_event_id,NEW.owner_id,NEW.property_id,NEW.id,NULL,NEW.state_code,NEW.worksite_id,NEW.scope_version,'room_create',NEW.revision,'null',json_object('id',NEW.id,'property_id',NEW.property_id,'state_code',NEW.state_code,'worksite_id',NEW.worksite_id,'scope_version',NEW.scope_version,'name',NEW.name,'capacity',NEW.capacity,'capacity_confirmed',NEW.capacity_confirmed,'revision',NEW.revision),NEW.actor_user_id,NEW.actor_name,NEW.request_id,NEW.request_fingerprint,NEW.updated_at); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_rooms_event_update AFTER UPDATE ON occupancy_rooms BEGIN INSERT INTO occupancy_events(id,owner_id,property_id,room_id,stay_id,state_code,worksite_id,scope_version,action,revision,before_snapshot,after_snapshot,actor_user_id,actor_name,request_id,request_fingerprint,created_at) VALUES(NEW.last_event_id,NEW.owner_id,NEW.property_id,NEW.id,NULL,NEW.state_code,NEW.worksite_id,NEW.scope_version,'room_update',NEW.revision,json_object('id',OLD.id,'property_id',OLD.property_id,'state_code',OLD.state_code,'worksite_id',OLD.worksite_id,'scope_version',OLD.scope_version,'name',OLD.name,'capacity',OLD.capacity,'capacity_confirmed',OLD.capacity_confirmed,'revision',OLD.revision),json_object('id',NEW.id,'property_id',NEW.property_id,'state_code',NEW.state_code,'worksite_id',NEW.worksite_id,'scope_version',NEW.scope_version,'name',NEW.name,'capacity',NEW.capacity,'capacity_confirmed',NEW.capacity_confirmed,'revision',NEW.revision),NEW.actor_user_id,NEW.actor_name,NEW.request_id,NEW.request_fingerprint,NEW.updated_at); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_stays_event_insert AFTER INSERT ON occupancy_stays BEGIN INSERT INTO occupancy_events(id,owner_id,property_id,room_id,stay_id,state_code,worksite_id,scope_version,action,revision,before_snapshot,after_snapshot,actor_user_id,actor_name,request_id,request_fingerprint,created_at) VALUES(NEW.last_event_id,NEW.owner_id,NEW.property_id,NEW.room_id,NEW.id,NEW.state_code,NEW.worksite_id,NEW.scope_version,'check_in',NEW.revision,'null',json_object('id',NEW.id,'property_id',NEW.property_id,'room_id',NEW.room_id,'state_code',NEW.state_code,'worksite_id',NEW.worksite_id,'scope_version',NEW.scope_version,'room_name',NEW.room_name,'slot_number',NEW.slot_number,'person_profile_id',NEW.person_profile_id,'person_name',NEW.person_name,'person_title',NEW.person_title,'shift',NEW.shift,'entry_on',NEW.entry_on,'exit_on',NEW.exit_on,'revision',NEW.revision),NEW.actor_user_id,NEW.actor_name,NEW.request_id,NEW.request_fingerprint,NEW.updated_at); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_stays_event_update AFTER UPDATE ON occupancy_stays BEGIN INSERT INTO occupancy_events(id,owner_id,property_id,room_id,stay_id,state_code,worksite_id,scope_version,action,revision,before_snapshot,after_snapshot,actor_user_id,actor_name,request_id,request_fingerprint,created_at) VALUES(NEW.last_event_id,NEW.owner_id,NEW.property_id,NEW.room_id,NEW.id,NEW.state_code,NEW.worksite_id,NEW.scope_version,'check_out',NEW.revision,json_object('id',OLD.id,'property_id',OLD.property_id,'room_id',OLD.room_id,'state_code',OLD.state_code,'worksite_id',OLD.worksite_id,'scope_version',OLD.scope_version,'room_name',OLD.room_name,'slot_number',OLD.slot_number,'person_profile_id',OLD.person_profile_id,'person_name',OLD.person_name,'person_title',OLD.person_title,'shift',OLD.shift,'entry_on',OLD.entry_on,'exit_on',OLD.exit_on,'revision',OLD.revision),json_object('id',NEW.id,'property_id',NEW.property_id,'room_id',NEW.room_id,'state_code',NEW.state_code,'worksite_id',NEW.worksite_id,'scope_version',NEW.scope_version,'room_name',NEW.room_name,'slot_number',NEW.slot_number,'person_profile_id',NEW.person_profile_id,'person_name',NEW.person_name,'person_title',NEW.person_title,'shift',NEW.shift,'entry_on',NEW.entry_on,'exit_on',NEW.exit_on,'revision',NEW.revision),NEW.actor_user_id,NEW.actor_name,NEW.request_id,NEW.request_fingerprint,NEW.updated_at); END;
--> statement-breakpoint
CREATE TRIGGER occupancy_event_valid BEFORE INSERT ON occupancy_events WHEN NOT (json_valid(NEW.before_snapshot) AND json_valid(NEW.after_snapshot) AND NEW.action IN('room_create','room_update','check_in','check_out') AND EXISTS(SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.owner_id=NEW.owner_id AND p.archived_at IS NULL AND p.state_code IS NEW.state_code AND p.worksite_id IS NEW.worksite_id AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=NEW.scope_version) AND ((NEW.action IN('room_create','room_update') AND NEW.stay_id IS NULL AND EXISTS(SELECT 1 FROM occupancy_rooms r WHERE r.id=NEW.room_id AND r.property_id=NEW.property_id AND r.owner_id=NEW.owner_id AND r.last_event_id=NEW.id AND r.request_id=NEW.request_id AND r.request_fingerprint=NEW.request_fingerprint AND r.revision=NEW.revision AND r.scope_version=NEW.scope_version AND r.state_code IS NEW.state_code AND r.worksite_id IS NEW.worksite_id)) OR (NEW.action IN('check_in','check_out') AND EXISTS(SELECT 1 FROM occupancy_stays s WHERE s.id=NEW.stay_id AND s.room_id=NEW.room_id AND s.property_id=NEW.property_id AND s.owner_id=NEW.owner_id AND s.last_event_id=NEW.id AND s.request_id=NEW.request_id AND s.request_fingerprint=NEW.request_fingerprint AND s.revision=NEW.revision AND s.scope_version=NEW.scope_version AND s.state_code IS NEW.state_code AND s.worksite_id IS NEW.worksite_id)))) BEGIN SELECT RAISE(ABORT,'occupancy_event_invalid'); END;
