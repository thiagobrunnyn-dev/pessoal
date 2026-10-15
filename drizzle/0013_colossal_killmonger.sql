CREATE TABLE `archive_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_events_request_id_unique` ON `archive_events` (`request_id`);--> statement-breakpoint
ALTER TABLE `cleaning_locations` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `cleaning_locations` ADD `archive_event_id` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `archive_event_id` text;--> statement-breakpoint
ALTER TABLE `cost_centers` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `cost_centers` ADD `archive_event_id` text;--> statement-breakpoint
ALTER TABLE `equipment` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `equipment` ADD `archive_event_id` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `archive_event_id` text;
--> statement-breakpoint
CREATE TRIGGER regional_archive_epoch_properties AFTER UPDATE ON properties WHEN OLD.archived_at IS NOT NEW.archived_at BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;

--> statement-breakpoint
CREATE TRIGGER regional_archive_epoch_equipment AFTER UPDATE ON equipment WHEN OLD.archived_at IS NOT NEW.archived_at BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;

--> statement-breakpoint
CREATE TRIGGER regional_archive_epoch_cleaning_locations AFTER UPDATE ON cleaning_locations WHEN OLD.archived_at IS NOT NEW.archived_at BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;

--> statement-breakpoint
CREATE TRIGGER regional_archive_epoch_clients AFTER UPDATE ON clients WHEN OLD.archived_at IS NOT NEW.archived_at BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;

--> statement-breakpoint
CREATE TRIGGER regional_archive_epoch_cost_centers AFTER UPDATE ON cost_centers WHEN OLD.archived_at IS NOT NEW.archived_at BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;

--> statement-breakpoint
CREATE TRIGGER active_parent_equipment BEFORE INSERT ON equipment WHEN NOT (EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND owner_id=NEW.owner_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Cadastro arquivado ou vínculo indisponível'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_cleaning_locations BEFORE INSERT ON cleaning_locations WHEN NOT (EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND owner_id=NEW.owner_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Cadastro arquivado ou vínculo indisponível'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_cost_centers BEFORE INSERT ON cost_centers WHEN NOT (EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND owner_id=NEW.owner_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Cadastro arquivado ou vínculo indisponível'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_maintenance BEFORE INSERT ON maintenance WHEN NOT (EXISTS(SELECT 1 FROM equipment e JOIN properties p ON p.id=e.property_id WHERE e.id=NEW.equipment_id AND e.owner_id=NEW.owner_id AND e.archived_at IS NULL AND p.archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Cadastro arquivado ou vínculo indisponível'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_cleaning_records BEFORE INSERT ON cleaning_records WHEN NOT (EXISTS(SELECT 1 FROM cleaning_locations l JOIN properties p ON p.id=l.property_id WHERE l.id=NEW.location_id AND l.owner_id=NEW.owner_id AND l.archived_at IS NULL AND p.archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Cadastro arquivado ou vínculo indisponível'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_work_orders BEFORE INSERT ON work_orders WHEN NOT (EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND owner_id=NEW.owner_id AND archived_at IS NULL) AND (NEW.client_id IS NULL OR EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND archived_at IS NULL)) AND (NEW.cost_center_id IS NULL OR EXISTS(SELECT 1 FROM cost_centers WHERE id=NEW.cost_center_id AND archived_at IS NULL))) BEGIN SELECT RAISE(ABORT,'Cadastro arquivado ou vínculo indisponível'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_housing_handovers BEFORE INSERT ON housing_handovers WHEN NOT (EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND owner_id=NEW.owner_id AND archived_at IS NULL) AND EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND archived_at IS NULL) AND EXISTS(SELECT 1 FROM cost_centers WHERE id=NEW.cost_center_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Cadastro arquivado ou vínculo indisponível'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_update_work_orders BEFORE UPDATE ON work_orders WHEN (NEW.status<>'completed') AND NOT (EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND archived_at IS NULL) AND (NEW.client_id IS NULL OR EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND archived_at IS NULL)) AND (NEW.cost_center_id IS NULL OR EXISTS(SELECT 1 FROM cost_centers WHERE id=NEW.cost_center_id AND archived_at IS NULL))) BEGIN SELECT RAISE(ABORT,'Restaure o cadastro principal antes de reabrir ou transferir'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_update_housing_handovers BEFORE UPDATE ON housing_handovers WHEN (NEW.returned_on IS NULL) AND NOT (EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND archived_at IS NULL) AND EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND archived_at IS NULL) AND EXISTS(SELECT 1 FROM cost_centers WHERE id=NEW.cost_center_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Restaure o cadastro principal antes de reabrir ou transferir'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_update_equipment BEFORE UPDATE ON equipment WHEN (OLD.property_id IS NOT NEW.property_id) AND NOT (EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Restaure o cadastro principal antes de reabrir ou transferir'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_update_cleaning_locations BEFORE UPDATE ON cleaning_locations WHEN (OLD.property_id IS NOT NEW.property_id) AND NOT (EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Restaure o cadastro principal antes de reabrir ou transferir'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_update_cost_centers BEFORE UPDATE ON cost_centers WHEN (OLD.client_id IS NOT NEW.client_id) AND NOT (EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Restaure o cadastro principal antes de reabrir ou transferir'); END;

--> statement-breakpoint
CREATE TRIGGER active_parent_update_properties BEFORE UPDATE ON properties WHEN ((OLD.worksite_id IS NOT NEW.worksite_id OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL)) AND NEW.worksite_id IS NOT NULL) AND NOT (EXISTS(SELECT 1 FROM cost_centers c JOIN clients p ON p.id=c.client_id WHERE c.id=NEW.worksite_id AND c.archived_at IS NULL AND p.archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Restaure o cadastro principal antes de reabrir ou transferir'); END;
