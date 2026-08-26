CREATE TABLE `attachment` (
  `id` text PRIMARY KEY NOT NULL,
  `email_id` text NOT NULL,
  `filename` text NOT NULL,
  `path` text NOT NULL,
  `size` integer NOT NULL,
  `mime` text,
  FOREIGN KEY (`email_id`) REFERENCES `email`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
  `id` text PRIMARY KEY NOT NULL,
  `folder` text NOT NULL,
  `last_uid` integer DEFAULT 0 NOT NULL,
  `last_sync_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_state_folder_unique` ON `sync_state` (`folder`);
