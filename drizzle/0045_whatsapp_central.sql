CREATE TABLE `whatsapp_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`chat_jid` text NOT NULL,
	`kind` text DEFAULT 'group' NOT NULL,
	`name` text NOT NULL,
	`participants_count` integer,
	`monitored` integer DEFAULT 0 NOT NULL,
	`monitored_changed_at` text,
	`monitored_changed_by` text,
	`property_id` text,
	`last_message_at` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "whatsapp_chat_kind" CHECK("whatsapp_chats"."kind" = 'group'),
	CONSTRAINT "whatsapp_chat_monitored" CHECK("whatsapp_chats"."monitored" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whatsapp_chats_jid` ON `whatsapp_chats` (`owner_id`,`chat_jid`);--> statement-breakpoint
CREATE TABLE `whatsapp_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`wa_message_id` text NOT NULL,
	`direction` text NOT NULL,
	`sender_jid` text,
	`sender_name` text,
	`kind` text DEFAULT 'text' NOT NULL,
	`body` text,
	`has_media` integer DEFAULT 0 NOT NULL,
	`sent_at` text NOT NULL,
	`received_at` text NOT NULL,
	`purged_at` text,
	`analyzed_at` text,
	`category` text,
	`is_request` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `whatsapp_chats`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "whatsapp_message_direction" CHECK("whatsapp_messages"."direction" IN ('in','out'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whatsapp_messages_wa_id` ON `whatsapp_messages` (`owner_id`,`wa_message_id`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_messages_chat` ON `whatsapp_messages` (`owner_id`,`chat_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_messages_pending` ON `whatsapp_messages` (`owner_id`,`analyzed_at`,`sent_at`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_messages_retention` ON `whatsapp_messages` (`owner_id`,`purged_at`,`sent_at`);--> statement-breakpoint
CREATE TABLE `whatsapp_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_by_name` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	`claimed_at` text,
	`sent_at` text,
	`wa_message_id` text,
	`error` text,
	`purged_at` text,
	FOREIGN KEY (`chat_id`) REFERENCES `whatsapp_chats`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "whatsapp_outbox_status" CHECK("whatsapp_outbox"."status" IN ('queued','sending','sent','failed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_outbox_request_id_unique` ON `whatsapp_outbox` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_outbox_status` ON `whatsapp_outbox` (`owner_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `whatsapp_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` text NOT NULL,
	`category` text NOT NULL,
	`urgency` text DEFAULT 'normal' NOT NULL,
	`summary` text NOT NULL,
	`requester_name` text,
	`status` text DEFAULT 'detected' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`handled_by_user_id` text,
	`handled_by_name` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `whatsapp_chats`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `whatsapp_messages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "whatsapp_request_status" CHECK("whatsapp_requests"."status" IN ('detected','accepted','done','dismissed')),
	CONSTRAINT "whatsapp_request_urgency" CHECK("whatsapp_requests"."urgency" IN ('low','normal','high'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_requests_message_id_unique` ON `whatsapp_requests` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_requests_status` ON `whatsapp_requests` (`owner_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_requests_chat` ON `whatsapp_requests` (`owner_id`,`chat_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `whatsapp_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`day` text NOT NULL,
	`summary` text NOT NULL,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`sentiment` text DEFAULT 'neutral' NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`participant_count` integer DEFAULT 0 NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `whatsapp_chats`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "whatsapp_summary_sentiment" CHECK("whatsapp_summaries"."sentiment" IN ('positive','neutral','negative','mixed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whatsapp_summaries_day` ON `whatsapp_summaries` (`owner_id`,`chat_id`,`day`);