CREATE TABLE `application` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`business_unit` text,
	`position` text,
	`batch` text NOT NULL,
	`channel` text,
	`applied_at` integer,
	`stage` text NOT NULL,
	`ball` text,
	`outcome` text,
	`current_round` integer DEFAULT 0 NOT NULL,
	`current_interview_type` text,
	`last_event_at` integer NOT NULL,
	`next_deadline_at` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `company_alias` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`alias` text NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE no action
);
