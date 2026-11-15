CREATE TABLE `request_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`protocol` text NOT NULL,
	`event` text NOT NULL,
	`event_key` text NOT NULL,
	`target` text NOT NULL,
	`chat_id` text,
	`requester_jid` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` text NOT NULL,
	`claimed_at` text,
	`sent_at` text,
	`wa_message_id` text,
	`error` text,
	`purged_at` text,
	FOREIGN KEY (`chat_id`) REFERENCES `whatsapp_chats`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "request_notice_source" CHECK("request_notices"."source" IN ('intake','guest')),
	CONSTRAINT "request_notice_event" CHECK("request_notices"."event" IN ('received','closed')),
	CONSTRAINT "request_notice_target" CHECK(("request_notices"."target" = 'group' AND "request_notices"."chat_id" IS NOT NULL AND "request_notices"."requester_jid" IS NULL) OR ("request_notices"."target" = 'requester' AND "request_notices"."chat_id" IS NULL)),
	CONSTRAINT "request_notice_status" CHECK("request_notices"."status" IN ('queued','sending','sent','failed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_request_notices_event` ON `request_notices` (`owner_id`,`source`,`event_key`,`target`);--> statement-breakpoint
CREATE INDEX `idx_request_notices_status` ON `request_notices` (`owner_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_request_notices_created` ON `request_notices` (`owner_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `whatsapp_chats` ADD `requests_default` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsapp_chats` ADD `management_default` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whatsapp_chats_requests_default` ON `whatsapp_chats` (`owner_id`) WHERE requests_default = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whatsapp_chats_management_default` ON `whatsapp_chats` (`owner_id`) WHERE management_default = 1;