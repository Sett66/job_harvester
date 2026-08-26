CREATE TABLE `email` (
  `id` text PRIMARY KEY NOT NULL,
  `message_id` text NOT NULL,
  `folder` text NOT NULL,
  `from_name` text,
  `from_address` text NOT NULL,
  `subject` text NOT NULL,
  `received_at` integer NOT NULL,
  `body_text` text NOT NULL,
  `body_html_path` text,
  `raw_path` text,
  `has_attachment` integer DEFAULT false NOT NULL,
  `in_reply_to` text,
  `references_header` text,
  `screen_result` text DEFAULT 'SUSPECT' NOT NULL,
  `parse_status` text DEFAULT 'PENDING' NOT NULL,
  `parsed_at` integer,
  `confidence` integer,
  `linked_application_id` text,
  `review_status` text DEFAULT 'NEEDS_REVIEW' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`linked_application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_message_id_unique` ON `email` (`message_id`);--> statement-breakpoint
CREATE TABLE `email_extraction` (
  `id` text PRIMARY KEY NOT NULL,
  `email_id` text NOT NULL,
  `event_type` text NOT NULL,
  `company_name` text NOT NULL,
  `business_unit` text,
  `position` text,
  `occurred_at` integer NOT NULL,
  `deadline_at` integer,
  `confidence` integer NOT NULL,
  `suggested_application_id` text,
  `match_method` text NOT NULL,
  `raw_json` text NOT NULL,
  `event_created` integer DEFAULT false NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`email_id`) REFERENCES `email`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`suggested_application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_extraction_email_event_unique` ON `email_extraction` (`email_id`, `event_type`);
