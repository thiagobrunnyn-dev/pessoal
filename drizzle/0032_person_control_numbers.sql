CREATE TABLE `person_number_counters` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`last_number` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "person_counter_nonnegative" CHECK(typeof("person_number_counters"."last_number")='integer' AND "person_number_counters"."last_number">=0)
);
--> statement-breakpoint
ALTER TABLE `person_profiles` ADD `control_number` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_people_control_number` ON `person_profiles` (`owner_id`,`control_number`);
--> statement-breakpoint
CREATE TRIGGER person_control_server_only BEFORE INSERT ON person_profiles WHEN NEW.control_number IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'O número do colaborador é gerado automaticamente');
END;
--> statement-breakpoint
CREATE TRIGGER person_control_allocate AFTER INSERT ON person_profiles WHEN NEW.directory<>'guest' BEGIN
 INSERT INTO person_number_counters(owner_id,last_number) VALUES(NEW.owner_id,0) ON CONFLICT(owner_id) DO NOTHING;
 UPDATE person_number_counters SET last_number=MAX(last_number,COALESCE((SELECT MAX(control_number) FROM person_profiles WHERE owner_id=NEW.owner_id),0))+1 WHERE owner_id=NEW.owner_id;
 UPDATE person_profiles SET control_number=(SELECT last_number FROM person_number_counters WHERE owner_id=NEW.owner_id) WHERE id=NEW.id AND owner_id=NEW.owner_id;
END;
--> statement-breakpoint
CREATE TRIGGER person_control_validate BEFORE UPDATE OF control_number,directory ON person_profiles WHEN NEW.control_number IS NOT NULL AND (typeof(NEW.control_number)<>'integer' OR NEW.control_number<1 OR NEW.directory='guest') BEGIN
 SELECT RAISE(ABORT,'Número de colaborador inválido');
END;
--> statement-breakpoint
CREATE TRIGGER person_control_immutable BEFORE UPDATE OF control_number,id,owner_id ON person_profiles WHEN OLD.control_number IS NOT NULL AND (OLD.control_number IS NOT NEW.control_number OR OLD.id IS NOT NEW.id OR OLD.owner_id IS NOT NEW.owner_id) BEGIN
 SELECT RAISE(ABORT,'O número de controle do colaborador é permanente');
END;
--> statement-breakpoint
CREATE TRIGGER person_control_preserve BEFORE DELETE ON person_profiles WHEN OLD.control_number IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'Arquive o cadastro para preservar seu número e histórico');
END;
--> statement-breakpoint
CREATE TRIGGER person_counter_monotonic BEFORE UPDATE ON person_number_counters WHEN NEW.last_number<OLD.last_number OR NEW.owner_id IS NOT OLD.owner_id BEGIN
 SELECT RAISE(ABORT,'A sequência de colaboradores não pode retroceder');
END;
--> statement-breakpoint
CREATE TRIGGER person_counter_preserve BEFORE DELETE ON person_number_counters BEGIN
 SELECT RAISE(ABORT,'A sequência de colaboradores é permanente');
END;
