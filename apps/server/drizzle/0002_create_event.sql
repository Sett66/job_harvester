CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`source` text NOT NULL,
	`email_id` text,
	`round` integer,
	`interview_type` text,
	`deadline_at` integer,
	`scheduled_at` integer,
	`raw_text` text,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE no action
);
