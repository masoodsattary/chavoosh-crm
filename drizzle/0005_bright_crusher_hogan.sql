ALTER TABLE `activities` ADD `source_activity_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `activities_source_uq` ON `activities` (`source_activity_id`);