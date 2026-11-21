CREATE TABLE `document_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_links_entity_uq` ON `document_links` (`document_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `document_links_document_idx` ON `document_links` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_links_customer_idx` ON `document_links` (`customer_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer,
	`activity_id` integer,
	`opportunity_id` integer,
	`title` text NOT NULL,
	`document_type` text DEFAULT 'other' NOT NULL,
	`version` text DEFAULT '1' NOT NULL,
	`document_date` text,
	`reference_number` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`file_name` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`uploaded_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_documents`("id", "customer_id", "activity_id", "opportunity_id", "title", "document_type", "version", "document_date", "reference_number", "description", "file_name", "object_key", "content_type", "size", "status", "uploaded_by", "created_at", "updated_at", "archived_at") SELECT "id", "customer_id", "activity_id", "opportunity_id", "title", "document_type", "version", "document_date", "reference_number", "description", "file_name", "object_key", "content_type", "size", "status", "uploaded_by", "created_at", "updated_at", "archived_at" FROM `documents`;--> statement-breakpoint
DROP TABLE `documents`;--> statement-breakpoint
ALTER TABLE `__new_documents` RENAME TO `documents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `documents_customer_idx` ON `documents` (`customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_object_key_uq` ON `documents` (`object_key`);
--> statement-breakpoint
INSERT OR IGNORE INTO `document_links` (`document_id`,`entity_type`,`entity_id`,`customer_id`,`created_by`)
SELECT `id`,'customer',`customer_id`,`customer_id`,`uploaded_by` FROM `documents` WHERE `customer_id` IS NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `document_links` (`document_id`,`entity_type`,`entity_id`,`customer_id`,`created_by`)
SELECT `id`,'activity',`activity_id`,`customer_id`,`uploaded_by` FROM `documents` WHERE `activity_id` IS NOT NULL AND `customer_id` IS NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `document_links` (`document_id`,`entity_type`,`entity_id`,`customer_id`,`created_by`)
SELECT `id`,'opportunity',`opportunity_id`,`customer_id`,`uploaded_by` FROM `documents` WHERE `opportunity_id` IS NOT NULL AND `customer_id` IS NOT NULL;
