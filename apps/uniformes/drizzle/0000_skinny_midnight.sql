CREATE TABLE `uniform_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`mode` text NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniform_request_unique` ON `uniform_audit` (`tenant`,`mode`,`request_id`);--> statement-breakpoint
CREATE INDEX `uniform_audit_tenant_date` ON `uniform_audit` (`tenant`,`mode`,`created_at`);--> statement-breakpoint
CREATE TABLE `uniform_records` (
	`tenant` text NOT NULL,
	`mode` text NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`company_id` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`tenant`, `mode`, `kind`, `id`)
);
--> statement-breakpoint
CREATE INDEX `uniform_records_company` ON `uniform_records` (`tenant`,`mode`,`company_id`,`kind`);--> statement-breakpoint
CREATE TABLE `uniform_workspaces` (
	`tenant` text NOT NULL,
	`mode` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`last_request` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`tenant`, `mode`)
);
