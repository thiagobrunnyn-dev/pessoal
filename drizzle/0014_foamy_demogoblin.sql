CREATE TABLE `property_number_counter` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_number` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `properties` ADD `control_number` integer;
--> statement-breakpoint
WITH numbered AS (SELECT id,row_number() OVER(ORDER BY created_at,id) value FROM properties)
UPDATE properties SET control_number=(SELECT value FROM numbered WHERE numbered.id=properties.id) WHERE control_number IS NULL;
--> statement-breakpoint
INSERT INTO property_number_counter(id,last_number) SELECT 1,coalesce(max(control_number),0) FROM properties;
--> statement-breakpoint
CREATE UNIQUE INDEX idx_properties_control_number ON properties(control_number);
--> statement-breakpoint
CREATE TRIGGER property_number_allocate AFTER INSERT ON properties WHEN NEW.control_number IS NULL BEGIN
 UPDATE property_number_counter SET last_number=last_number+1 WHERE id=1;
 UPDATE properties SET control_number=(SELECT last_number FROM property_number_counter WHERE id=1) WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER property_number_server_only BEFORE INSERT ON properties WHEN NEW.control_number IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'O número do imóvel é gerado automaticamente');
END;
--> statement-breakpoint
CREATE TRIGGER property_number_immutable BEFORE UPDATE OF control_number ON properties WHEN OLD.control_number IS NOT NULL AND OLD.control_number IS NOT NEW.control_number BEGIN
 SELECT RAISE(ABORT,'O número de controle do imóvel é permanente');
END;
