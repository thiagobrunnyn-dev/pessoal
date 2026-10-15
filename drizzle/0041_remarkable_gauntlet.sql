ALTER TABLE `properties` ADD `property_level` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `declared_slots` integer;
--> statement-breakpoint
CREATE TRIGGER properties_capacity_validate_insert BEFORE INSERT ON properties
WHEN (NEW.property_level IS NOT NULL AND NEW.property_level NOT IN ('operational','technical','foreman','staff','engineering_coordination','supervisors'))
 OR (NEW.declared_slots IS NOT NULL AND (typeof(NEW.declared_slots)<>'integer' OR NEW.declared_slots<0 OR NEW.declared_slots>9007199254740991))
BEGIN SELECT RAISE(ABORT, 'invalid_property_capacity'); END;
--> statement-breakpoint
CREATE TRIGGER properties_capacity_validate_update BEFORE UPDATE OF property_level,declared_slots ON properties
WHEN (NEW.property_level IS NOT NULL AND NEW.property_level NOT IN ('operational','technical','foreman','staff','engineering_coordination','supervisors'))
 OR (NEW.declared_slots IS NOT NULL AND (typeof(NEW.declared_slots)<>'integer' OR NEW.declared_slots<0 OR NEW.declared_slots>9007199254740991))
BEGIN SELECT RAISE(ABORT, 'invalid_property_capacity'); END;
