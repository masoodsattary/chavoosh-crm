ALTER TABLE `notifications` ADD `kind` text DEFAULT 'event' NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `entity_type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `entity_id` integer;--> statement-breakpoint
ALTER TABLE `notifications` ADD `dedupe_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_user_dedupe_uq` ON `notifications` (`user_id`,`dedupe_key`);--> statement-breakpoint
INSERT INTO activities (
  customer_id, opportunity_id, title, type, direction, status, starts_at,
  duration_minutes, description, result, next_action, next_action_at,
  free_contact_names, assignee_user_id, is_manager_private, created_by,
  updated_by, completed_at, created_at, updated_at
)
SELECT
  source.customer_id, source.opportunity_id, source.next_action, 'follow_up',
  'outbound', 'planned', source.next_action_at, 0,
  'اقدام بعدی منتقل‌شده از فعالیت قبلی', '', '', NULL,
  source.free_contact_names, source.assignee_user_id, 0, source.created_by,
  source.updated_by, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM activities source
WHERE source.archived_at IS NULL
  AND source.next_action != '' AND source.next_action_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM activities planned
    WHERE planned.customer_id = source.customer_id
      AND planned.status = 'planned' AND planned.archived_at IS NULL
      AND planned.title = source.next_action
      AND planned.starts_at = source.next_action_at
  );--> statement-breakpoint
UPDATE customers
SET next_action_at = (
  SELECT a.starts_at FROM activities a
  WHERE a.customer_id = customers.id
    AND a.status = 'planned' AND a.archived_at IS NULL
  ORDER BY a.starts_at ASC, a.id ASC LIMIT 1
);
