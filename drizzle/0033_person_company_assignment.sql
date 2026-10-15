ALTER TABLE `person_profiles` ADD `client_id` text REFERENCES clients(id);--> statement-breakpoint
ALTER TABLE `person_profiles` ADD `cost_center_id` text REFERENCES cost_centers(id);--> statement-breakpoint
CREATE INDEX `idx_people_assignment_center` ON `person_profiles` (`owner_id`,`cost_center_id`);
--> statement-breakpoint
CREATE TRIGGER person_assignment_valid_insert BEFORE INSERT ON person_profiles WHEN (NEW.client_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM clients c WHERE c.id=NEW.client_id AND c.owner_id=NEW.owner_id)) OR (NEW.cost_center_id IS NOT NULL AND (NEW.client_id IS NULL OR NOT EXISTS(SELECT 1 FROM cost_centers c WHERE c.id=NEW.cost_center_id AND c.owner_id=NEW.owner_id AND c.client_id=NEW.client_id))) BEGIN SELECT RAISE(ABORT,'person_assignment_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER person_assignment_valid_update BEFORE UPDATE OF client_id,cost_center_id,owner_id ON person_profiles WHEN (NEW.client_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM clients c WHERE c.id=NEW.client_id AND c.owner_id=NEW.owner_id)) OR (NEW.cost_center_id IS NOT NULL AND (NEW.client_id IS NULL OR NOT EXISTS(SELECT 1 FROM cost_centers c WHERE c.id=NEW.cost_center_id AND c.owner_id=NEW.owner_id AND c.client_id=NEW.client_id))) BEGIN SELECT RAISE(ABORT,'person_assignment_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER person_cost_center_reparent BEFORE UPDATE OF client_id,owner_id ON cost_centers WHEN (NEW.client_id IS NOT OLD.client_id OR NEW.owner_id IS NOT OLD.owner_id) AND EXISTS(SELECT 1 FROM person_profiles p WHERE p.cost_center_id=OLD.id AND p.owner_id=OLD.owner_id) BEGIN SELECT RAISE(ABORT,'person_assignment_reparent'); END;
--> statement-breakpoint
CREATE TRIGGER person_client_owner_transfer BEFORE UPDATE OF owner_id ON clients WHEN NEW.owner_id IS NOT OLD.owner_id AND EXISTS(SELECT 1 FROM person_profiles p WHERE p.client_id=OLD.id AND p.owner_id=OLD.owner_id) BEGIN SELECT RAISE(ABORT,'person_assignment_reparent'); END;
