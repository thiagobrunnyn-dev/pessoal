CREATE TABLE `equipment_public_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`equipment_id` text NOT NULL,
	`enabled` integer NOT NULL,
	`revision` integer NOT NULL,
	`actor_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_equipment_public_revision` ON `equipment_public_events` (`equipment_id`,`revision`);--> statement-breakpoint
ALTER TABLE `equipment` ADD `public_history_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `equipment` ADD `public_history_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenance` ADD `evidence_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenance` ADD `evidence_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `phase` text;
--> statement-breakpoint
CREATE TRIGGER maintenance_evidence_version_fixed BEFORE UPDATE OF evidence_version ON maintenance WHEN NEW.evidence_version<>OLD.evidence_version BEGIN SELECT RAISE(ABORT,'maintenance evidence rule is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER maintenance_phase_fixed BEFORE UPDATE OF phase ON photos WHEN NEW.phase IS NOT OLD.phase BEGIN SELECT RAISE(ABORT,'maintenance photo phase is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER maintenance_phase_valid BEFORE INSERT ON photos WHEN (SELECT evidence_version FROM maintenance WHERE id=NEW.maintenance_id AND owner_id=NEW.owner_id)=2 AND (NEW.phase IS NULL OR NEW.phase NOT IN ('before','after')) BEGIN SELECT RAISE(ABORT,'maintenance photo requires a valid phase'); END;
--> statement-breakpoint
CREATE TRIGGER equipment_public_event_no_update BEFORE UPDATE ON equipment_public_events BEGIN SELECT RAISE(ABORT,'public access audit is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER equipment_public_event_no_delete BEFORE DELETE ON equipment_public_events BEGIN SELECT RAISE(ABORT,'public access audit is immutable'); END;
