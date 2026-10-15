CREATE TABLE `regional_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`previous_state_code` text,
	`state_code` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `regional_epoch` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `regional_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`property_id` text,
	`state_code` text,
	`worksite_id` text,
	`previous_state_code` text,
	`previous_worksite_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_regional_snapshot_entity` ON `regional_snapshots` (`entity_type`,`entity_id`);--> statement-breakpoint
ALTER TABLE `properties` ADD `state_code` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `worksite_id` text;
--> statement-breakpoint
INSERT INTO regional_epoch(id,version) VALUES (1,0);

--> statement-breakpoint
CREATE TRIGGER regional_epoch_properties AFTER UPDATE ON properties WHEN OLD.state_code IS NOT NEW.state_code OR OLD.worksite_id IS NOT NEW.worksite_id BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;

--> statement-breakpoint
CREATE TRIGGER regional_epoch_equipment AFTER UPDATE ON equipment WHEN OLD.property_id IS NOT NEW.property_id BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;

--> statement-breakpoint
CREATE TRIGGER regional_epoch_cleaning_locations AFTER UPDATE ON cleaning_locations WHEN OLD.property_id IS NOT NEW.property_id BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;

--> statement-breakpoint
CREATE TRIGGER regional_epoch_housing_handovers AFTER UPDATE ON housing_handovers WHEN OLD.property_id IS NOT NEW.property_id OR OLD.client_id IS NOT NEW.client_id OR OLD.cost_center_id IS NOT NEW.cost_center_id BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;

--> statement-breakpoint
CREATE TRIGGER regional_epoch_work_orders AFTER UPDATE ON work_orders WHEN OLD.property_id IS NOT NEW.property_id OR OLD.client_id IS NOT NEW.client_id OR OLD.cost_center_id IS NOT NEW.cost_center_id BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;

--> statement-breakpoint
CREATE TRIGGER regional_epoch_cost_centers AFTER UPDATE ON cost_centers WHEN OLD.client_id IS NOT NEW.client_id BEGIN UPDATE regional_epoch SET version=version+1 WHERE id=1; END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_maintenance_insert AFTER INSERT ON maintenance WHEN 1 BEGIN INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'maintenance:'||NEW.id,'maintenance',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(SELECT property_id FROM equipment WHERE id=NEW.equipment_id); END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_cleaning_record_insert AFTER INSERT ON cleaning_records WHEN 1 BEGIN INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'cleaning_record:'||NEW.id,'cleaning_record',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(SELECT property_id FROM cleaning_locations WHERE id=NEW.location_id); END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_handover_insert AFTER INSERT ON housing_handovers WHEN 1 BEGIN INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'handover:'||NEW.id,'handover',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(NEW.property_id); END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_work_order_insert AFTER INSERT ON work_orders WHEN 1 BEGIN INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'work_order:'||NEW.id,'work_order',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(NEW.property_id); END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_work_order_event_insert AFTER INSERT ON work_order_events WHEN 1 BEGIN INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'work_order_event:'||NEW.id,'work_order_event',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(SELECT property_id FROM work_orders WHERE id=NEW.work_order_id); END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_cleaning_open_insert AFTER INSERT ON cleaning_page_opens WHEN 1 BEGIN INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'cleaning_open:'||NEW.id,'cleaning_open',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(SELECT property_id FROM cleaning_locations WHERE id=NEW.location_id); END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_equipment_change_insert AFTER INSERT ON equipment_changes WHEN 1 BEGIN INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'equipment_change:'||NEW.id,'equipment_change',NEW.id,p.id,p.state_code,p.worksite_id,COALESCE((SELECT state_code FROM properties WHERE id=json_extract(NEW.before_snapshot,'$.property_id')),'UNKNOWN'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(SELECT property_id FROM equipment WHERE id=NEW.equipment_id); END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_property_point_insert AFTER INSERT ON property_geolocations WHEN 1 BEGIN INSERT INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'property_point:'||NEW.property_id,'property_point',NEW.property_id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(NEW.property_id) ON CONFLICT(id) DO UPDATE SET property_id=excluded.property_id,state_code=excluded.state_code,worksite_id=excluded.worksite_id,created_at=excluded.created_at; END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_baseline_insert AFTER INSERT ON equipment WHEN NEW.baseline_date IS NOT NULL BEGIN INSERT INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'baseline:'||NEW.id,'baseline',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(NEW.property_id) ON CONFLICT(id) DO UPDATE SET property_id=excluded.property_id,state_code=excluded.state_code,worksite_id=excluded.worksite_id,created_at=excluded.created_at; END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_identification_insert AFTER INSERT ON equipment WHEN NEW.identification_photo_key IS NOT NULL BEGIN INSERT INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'identification:'||NEW.id,'identification',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(NEW.property_id) ON CONFLICT(id) DO UPDATE SET property_id=excluded.property_id,state_code=excluded.state_code,worksite_id=excluded.worksite_id,created_at=excluded.created_at; END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_property_point_update AFTER UPDATE ON property_geolocations WHEN 1 BEGIN INSERT INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'property_point:'||NEW.property_id,'property_point',NEW.property_id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(NEW.property_id) ON CONFLICT(id) DO UPDATE SET property_id=excluded.property_id,state_code=excluded.state_code,worksite_id=excluded.worksite_id,created_at=excluded.created_at; END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_baseline_update AFTER UPDATE ON equipment WHEN NEW.baseline_date IS NOT NULL AND OLD.baseline_date IS NOT NEW.baseline_date BEGIN INSERT INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'baseline:'||NEW.id,'baseline',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(NEW.property_id) ON CONFLICT(id) DO UPDATE SET property_id=excluded.property_id,state_code=excluded.state_code,worksite_id=excluded.worksite_id,created_at=excluded.created_at; END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_identification_update AFTER UPDATE ON equipment WHEN NEW.identification_photo_key IS NOT NULL AND OLD.identification_photo_key IS NOT NEW.identification_photo_key BEGIN INSERT INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'identification:'||NEW.id,'identification',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(NEW.property_id) ON CONFLICT(id) DO UPDATE SET property_id=excluded.property_id,state_code=excluded.state_code,worksite_id=excluded.worksite_id,created_at=excluded.created_at; END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_operation_plan_insert AFTER INSERT ON operation_plans WHEN 1 BEGIN INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'operation_plan:'||NEW.id,'operation_plan',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(CASE NEW.item_type WHEN 'air' THEN (SELECT property_id FROM equipment WHERE id=NEW.item_id) WHEN 'cleaning' THEN (SELECT property_id FROM cleaning_locations WHERE id=NEW.item_id) WHEN 'maintenance' THEN (SELECT e.property_id FROM maintenance m JOIN equipment e ON e.id=m.equipment_id WHERE m.id=NEW.item_id) WHEN 'cleaning_record' THEN (SELECT l.property_id FROM cleaning_records r JOIN cleaning_locations l ON l.id=r.location_id WHERE r.id=NEW.item_id) WHEN 'order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) WHEN 'work_order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) END); END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_service_review_insert AFTER INSERT ON service_reviews WHEN 1 BEGIN INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,previous_state_code,created_at) SELECT 'service_review:'||NEW.id,'service_review',NEW.id,p.id,p.state_code,p.worksite_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM properties p WHERE p.id=(CASE NEW.item_type WHEN 'air' THEN (SELECT property_id FROM equipment WHERE id=NEW.item_id) WHEN 'cleaning' THEN (SELECT property_id FROM cleaning_locations WHERE id=NEW.item_id) WHEN 'maintenance' THEN (SELECT e.property_id FROM maintenance m JOIN equipment e ON e.id=m.equipment_id WHERE m.id=NEW.item_id) WHEN 'cleaning_record' THEN (SELECT l.property_id FROM cleaning_records r JOIN cleaning_locations l ON l.id=r.location_id WHERE r.id=NEW.item_id) WHEN 'order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) WHEN 'work_order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) END); END;

--> statement-breakpoint
CREATE TRIGGER regional_capture_operation_event AFTER INSERT ON operation_events BEGIN INSERT OR IGNORE INTO regional_snapshots(id,entity_type,entity_id,property_id,state_code,worksite_id,created_at) SELECT 'operation_event:'||NEW.id,'operation_event',NEW.id,property_id,state_code,worksite_id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM regional_snapshots WHERE entity_type = CASE NEW.kind WHEN 'plan' THEN 'operation_plan' WHEN 'review' THEN 'service_review' END AND entity_id=NEW.entity_id; END;

--> statement-breakpoint
CREATE TRIGGER regional_invalidate_transfer_work_orders AFTER UPDATE ON work_orders WHEN OLD.property_id IS NOT NEW.property_id BEGIN UPDATE regional_snapshots SET state_code=NULL WHERE entity_type='work_order' AND entity_id=NEW.id; END;

--> statement-breakpoint
CREATE TRIGGER regional_invalidate_transfer_housing_handovers AFTER UPDATE ON housing_handovers WHEN OLD.property_id IS NOT NEW.property_id BEGIN UPDATE regional_snapshots SET state_code=NULL WHERE entity_type='handover' AND entity_id=NEW.id; END;

--> statement-breakpoint
CREATE TRIGGER regional_invalidate_changed_context_operation_plans AFTER UPDATE ON operation_plans BEGIN UPDATE regional_snapshots SET state_code=NULL WHERE entity_type='operation_plan' AND entity_id=NEW.id AND (property_id IS NOT (CASE NEW.item_type WHEN 'air' THEN (SELECT property_id FROM equipment WHERE id=NEW.item_id) WHEN 'cleaning' THEN (SELECT property_id FROM cleaning_locations WHERE id=NEW.item_id) WHEN 'maintenance' THEN (SELECT e.property_id FROM maintenance m JOIN equipment e ON e.id=m.equipment_id WHERE m.id=NEW.item_id) WHEN 'cleaning_record' THEN (SELECT l.property_id FROM cleaning_records r JOIN cleaning_locations l ON l.id=r.location_id WHERE r.id=NEW.item_id) WHEN 'order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) WHEN 'work_order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) END) OR state_code IS NOT (SELECT state_code FROM properties WHERE id=(CASE NEW.item_type WHEN 'air' THEN (SELECT property_id FROM equipment WHERE id=NEW.item_id) WHEN 'cleaning' THEN (SELECT property_id FROM cleaning_locations WHERE id=NEW.item_id) WHEN 'maintenance' THEN (SELECT e.property_id FROM maintenance m JOIN equipment e ON e.id=m.equipment_id WHERE m.id=NEW.item_id) WHEN 'cleaning_record' THEN (SELECT l.property_id FROM cleaning_records r JOIN cleaning_locations l ON l.id=r.location_id WHERE r.id=NEW.item_id) WHEN 'order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) WHEN 'work_order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) END)) OR worksite_id IS NOT (SELECT worksite_id FROM properties WHERE id=(CASE NEW.item_type WHEN 'air' THEN (SELECT property_id FROM equipment WHERE id=NEW.item_id) WHEN 'cleaning' THEN (SELECT property_id FROM cleaning_locations WHERE id=NEW.item_id) WHEN 'maintenance' THEN (SELECT e.property_id FROM maintenance m JOIN equipment e ON e.id=m.equipment_id WHERE m.id=NEW.item_id) WHEN 'cleaning_record' THEN (SELECT l.property_id FROM cleaning_records r JOIN cleaning_locations l ON l.id=r.location_id WHERE r.id=NEW.item_id) WHEN 'order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) WHEN 'work_order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) END))); END;

--> statement-breakpoint
CREATE TRIGGER regional_invalidate_changed_context_service_reviews AFTER UPDATE ON service_reviews BEGIN UPDATE regional_snapshots SET state_code=NULL WHERE entity_type='service_review' AND entity_id=NEW.id AND (property_id IS NOT (CASE NEW.item_type WHEN 'air' THEN (SELECT property_id FROM equipment WHERE id=NEW.item_id) WHEN 'cleaning' THEN (SELECT property_id FROM cleaning_locations WHERE id=NEW.item_id) WHEN 'maintenance' THEN (SELECT e.property_id FROM maintenance m JOIN equipment e ON e.id=m.equipment_id WHERE m.id=NEW.item_id) WHEN 'cleaning_record' THEN (SELECT l.property_id FROM cleaning_records r JOIN cleaning_locations l ON l.id=r.location_id WHERE r.id=NEW.item_id) WHEN 'order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) WHEN 'work_order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) END) OR state_code IS NOT (SELECT state_code FROM properties WHERE id=(CASE NEW.item_type WHEN 'air' THEN (SELECT property_id FROM equipment WHERE id=NEW.item_id) WHEN 'cleaning' THEN (SELECT property_id FROM cleaning_locations WHERE id=NEW.item_id) WHEN 'maintenance' THEN (SELECT e.property_id FROM maintenance m JOIN equipment e ON e.id=m.equipment_id WHERE m.id=NEW.item_id) WHEN 'cleaning_record' THEN (SELECT l.property_id FROM cleaning_records r JOIN cleaning_locations l ON l.id=r.location_id WHERE r.id=NEW.item_id) WHEN 'order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) WHEN 'work_order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) END)) OR worksite_id IS NOT (SELECT worksite_id FROM properties WHERE id=(CASE NEW.item_type WHEN 'air' THEN (SELECT property_id FROM equipment WHERE id=NEW.item_id) WHEN 'cleaning' THEN (SELECT property_id FROM cleaning_locations WHERE id=NEW.item_id) WHEN 'maintenance' THEN (SELECT e.property_id FROM maintenance m JOIN equipment e ON e.id=m.equipment_id WHERE m.id=NEW.item_id) WHEN 'cleaning_record' THEN (SELECT l.property_id FROM cleaning_records r JOIN cleaning_locations l ON l.id=r.location_id WHERE r.id=NEW.item_id) WHEN 'order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) WHEN 'work_order' THEN (SELECT property_id FROM work_orders WHERE id=NEW.item_id) END))); END;
