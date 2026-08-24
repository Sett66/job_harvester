CREATE TABLE `interview_note` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`event_id` text,
	`md_path` text NOT NULL,
	`raw_dump` text NOT NULL,
	`summary` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `question` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`category` text,
	`application_id` text,
	`company_id` text,
	`interview_note_id` text,
	`round` integer,
	`interview_type` text,
	`asked_at` integer,
	`my_answer` text,
	`reference_answer` text,
	`self_rating` integer,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`import_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interview_note_id`) REFERENCES `interview_note`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_import_key_unique` ON `question` (`import_key`);
--> statement-breakpoint
CREATE TABLE `import_candidate` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`category` text,
	`company_id` text,
	`application_id` text,
	`round` integer,
	`interview_type` text,
	`source_file` text NOT NULL,
	`import_key` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_candidate_import_key_unique` ON `import_candidate` (`import_key`);
