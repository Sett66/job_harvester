CREATE TABLE `company` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_name` text NOT NULL,
	`industry` text,
	`website` text,
	`note` text,
	`created_at` integer NOT NULL
);
