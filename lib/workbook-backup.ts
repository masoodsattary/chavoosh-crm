export type WorkbookBackupTable = {
  sheet: string;
  table: string;
  keyColumns: string[];
  columns: string[];
};

// The order is intentional: referenced records are restored before their children.
// Authentication secrets, active sessions, login throttles and email bodies are excluded.
export const workbookBackupTables: WorkbookBackupTable[] = [
  {
    sheet: "DB_users",
    table: "users",
    keyColumns: ["id"],
    columns: [
      "id", "email", "full_name", "mobile", "role", "timezone", "is_active",
      "last_login_at", "password_changed_at", "invite_expires_at", "invited_at",
      "invited_by", "created_at", "updated_at", "archived_at",
    ],
  },
  {
    sheet: "DB_tags",
    table: "tags",
    keyColumns: ["id"],
    columns: ["id", "name", "color", "is_active", "created_by", "created_at", "updated_at", "archived_at"],
  },
  {
    sheet: "DB_customers",
    table: "customers",
    keyColumns: ["id"],
    columns: [
      "id", "name", "short_name", "english_name", "organization_type", "industry",
      "relationship_status", "importance", "website", "phone", "other_phones",
      "fax", "email", "secretariat_number", "postal_code", "province", "city",
      "address", "description", "source", "visibility", "owner_user_id",
      "parent_customer_id", "created_by", "updated_by", "last_interaction_at",
      "next_action_at", "created_at", "updated_at", "archived_at",
    ],
  },
  {
    sheet: "DB_contacts",
    table: "contacts",
    keyColumns: ["id"],
    columns: [
      "id", "customer_id", "first_name", "last_name", "prefix", "job_title",
      "department", "decision_roles", "direct_phone", "extension", "mobile",
      "email", "secondary_email", "fax", "address", "preferred_contact", "notes",
      "status", "created_by", "updated_by", "created_at", "updated_at", "archived_at",
    ],
  },
  {
    sheet: "DB_opportunities",
    table: "opportunities",
    keyColumns: ["id"],
    columns: [
      "id", "customer_id", "title", "description", "solution_text", "status",
      "current_stage", "amount", "currency", "probability", "forecast_at",
      "latest_status", "next_action", "next_action_at", "source", "competitors",
      "win_loss_reason", "owner_user_id", "created_by", "updated_by",
      "created_at", "updated_at", "archived_at",
    ],
  },
  {
    sheet: "DB_opportunity_steps",
    table: "opportunity_steps",
    keyColumns: ["id"],
    columns: [
      "id", "opportunity_id", "title", "sort_order", "status", "due_at",
      "completed_at", "assignee_user_id", "notes", "probability",
      "created_at", "updated_at", "archived_at",
    ],
  },
  {
    sheet: "DB_activities",
    table: "activities",
    keyColumns: ["id"],
    columns: [
      "id", "customer_id", "opportunity_id", "title", "type", "direction",
      "status", "starts_at", "duration_minutes", "description", "result",
      "next_action", "next_action_at", "free_contact_names", "assignee_user_id",
      "is_manager_private", "created_by", "updated_by", "completed_at",
      "created_at", "updated_at", "archived_at",
    ],
  },
  {
    sheet: "DB_activity_contacts",
    table: "activity_contacts",
    keyColumns: ["activity_id", "contact_id"],
    columns: ["activity_id", "contact_id"],
  },
  {
    sheet: "DB_documents",
    table: "documents",
    keyColumns: ["id"],
    columns: [
      "id", "customer_id", "activity_id", "opportunity_id", "title",
      "document_type", "version", "document_date", "reference_number",
      "description", "file_name", "object_key", "content_type", "size", "status",
      "uploaded_by", "created_at", "updated_at", "archived_at",
    ],
  },
  {
    sheet: "DB_customer_tags",
    table: "customer_tags",
    keyColumns: ["customer_id", "tag_id"],
    columns: ["customer_id", "tag_id"],
  },
  {
    sheet: "DB_customer_watchers",
    table: "customer_watchers",
    keyColumns: ["customer_id", "user_id"],
    columns: ["customer_id", "user_id", "added_by", "created_at"],
  },
  {
    sheet: "DB_manager_notes",
    table: "manager_notes",
    keyColumns: ["id"],
    columns: [
      "id", "customer_id", "contact_id", "opportunity_id", "activity_id",
      "body", "created_by", "created_at", "updated_at", "archived_at",
    ],
  },
  {
    sheet: "DB_timeline_events",
    table: "timeline_events",
    keyColumns: ["id"],
    columns: [
      "id", "customer_id", "event_type", "title", "summary", "entity_type",
      "entity_id", "is_manager_private", "created_by", "created_at",
    ],
  },
  {
    sheet: "DB_notifications",
    table: "notifications",
    keyColumns: ["id"],
    columns: [
      "id", "user_id", "customer_id", "timeline_event_id", "kind",
      "entity_type", "entity_id", "dedupe_key", "title", "body", "is_read",
      "created_at",
    ],
  },
  {
    sheet: "DB_audit_logs",
    table: "audit_logs",
    keyColumns: ["id"],
    columns: [
      "id", "user_id", "entity_type", "entity_id", "action",
      "before_json", "after_json", "created_at",
    ],
  },
  {
    sheet: "DB_import_batches",
    table: "import_batches",
    keyColumns: ["id"],
    columns: [
      "id", "entity_type", "file_name", "total_rows", "inserted_rows",
      "updated_rows", "rejected_rows", "result_json", "created_by", "created_at",
    ],
  },
];
