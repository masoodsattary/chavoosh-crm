ALTER TABLE `documents` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
UPDATE `documents`
SET `visibility` = 'customer'
WHERE `customer_id` IS NOT NULL
   OR EXISTS (
     SELECT 1 FROM `document_links` dl WHERE dl.`document_id` = `documents`.`id`
   );--> statement-breakpoint
CREATE INDEX `documents_visibility_idx` ON `documents` (`visibility`);
