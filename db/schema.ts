import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  archivedAt: text("archived_at"),
};

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    fullName: text("full_name").notNull().default(""),
    mobile: text("mobile").notNull().default(""),
    role: text("role", { enum: ["admin", "sales_manager", "sales", "viewer"] })
      .notNull()
      .default("viewer"),
    timezone: text("timezone").notNull().default("Asia/Tehran"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    passwordHash: text("password_hash"),
    passwordSalt: text("password_salt"),
    passwordIterations: integer("password_iterations"),
    passwordChangedAt: text("password_changed_at"),
    inviteTokenHash: text("invite_token_hash"),
    inviteExpiresAt: text("invite_expires_at"),
    invitedAt: text("invited_at"),
    invitedBy: integer("invited_by"),
    lastLoginAt: text("last_login_at"),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_uq").on(table.tokenHash),
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const authLoginAttempts = sqliteTable(
  "auth_login_attempts",
  {
    email: text("email").primaryKey(),
    failedCount: integer("failed_count").notNull().default(0),
    blockedUntil: text("blocked_until"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("auth_login_attempts_blocked_idx").on(table.blockedUntil)],
);

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    shortName: text("short_name").notNull().default(""),
    englishName: text("english_name").notNull().default(""),
    organizationType: text("organization_type").notNull().default(""),
    industry: text("industry").notNull().default(""),
    relationshipStatus: text("relationship_status").notNull().default("potential"),
    importance: text("importance").notNull().default("normal"),
    website: text("website").notNull().default(""),
    phone: text("phone").notNull().default(""),
    otherPhones: text("other_phones").notNull().default(""),
    fax: text("fax").notNull().default(""),
    email: text("email").notNull().default(""),
    secretariatNumber: text("secretariat_number").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    province: text("province").notNull().default(""),
    city: text("city").notNull().default(""),
    address: text("address").notNull().default(""),
    description: text("description").notNull().default(""),
    source: text("source").notNull().default(""),
    visibility: text("visibility", { enum: ["public", "private"] }).notNull().default("public"),
    ownerUserId: integer("owner_user_id").notNull().references(() => users.id),
    parentCustomerId: integer("parent_customer_id"),
    createdBy: integer("created_by").notNull().references(() => users.id),
    updatedBy: integer("updated_by").notNull().references(() => users.id),
    lastInteractionAt: text("last_interaction_at"),
    nextActionAt: text("next_action_at"),
    ...timestamps,
  },
  (table) => [
    index("customers_name_idx").on(table.name),
    index("customers_owner_idx").on(table.ownerUserId),
    index("customers_archived_idx").on(table.archivedAt),
  ],
);

export const customerWatchers = sqliteTable(
  "customer_watchers",
  {
    customerId: integer("customer_id").notNull().references(() => customers.id),
    userId: integer("user_id").notNull().references(() => users.id),
    addedBy: integer("added_by").notNull().references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("customer_watchers_uq").on(table.customerId, table.userId),
    index("customer_watchers_user_idx").on(table.userId),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#283980"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdBy: integer("created_by").notNull().references(() => users.id),
    ...timestamps,
  },
  (table) => [uniqueIndex("tags_name_uq").on(table.name)],
);

export const customerTags = sqliteTable(
  "customer_tags",
  {
    customerId: integer("customer_id").notNull().references(() => customers.id),
    tagId: integer("tag_id").notNull().references(() => tags.id),
  },
  (table) => [uniqueIndex("customer_tags_uq").on(table.customerId, table.tagId)],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    prefix: text("prefix").notNull().default(""),
    jobTitle: text("job_title").notNull().default(""),
    department: text("department").notNull().default(""),
    decisionRoles: text("decision_roles").notNull().default("[]"),
    directPhone: text("direct_phone").notNull().default(""),
    extension: text("extension").notNull().default(""),
    mobile: text("mobile").notNull().default(""),
    email: text("email").notNull().default(""),
    secondaryEmail: text("secondary_email").notNull().default(""),
    fax: text("fax").notNull().default(""),
    address: text("address").notNull().default(""),
    preferredContact: text("preferred_contact").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdBy: integer("created_by").notNull().references(() => users.id),
    updatedBy: integer("updated_by").notNull().references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("contacts_customer_idx").on(table.customerId),
    index("contacts_email_idx").on(table.email),
    index("contacts_mobile_idx").on(table.mobile),
  ],
);

export const opportunities = sqliteTable(
  "opportunities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    solutionText: text("solution_text").notNull().default(""),
    status: text("status", { enum: ["open", "won", "lost", "paused", "archived"] }).notNull().default("open"),
    currentStage: text("current_stage").notNull().default(""),
    amount: real("amount").notNull().default(0),
    currency: text("currency", { enum: ["IRR", "USD", "EUR"] }).notNull().default("IRR"),
    probability: integer("probability").notNull().default(10),
    forecastAt: text("forecast_at"),
    latestStatus: text("latest_status").notNull().default(""),
    nextAction: text("next_action").notNull().default(""),
    nextActionAt: text("next_action_at"),
    source: text("source").notNull().default(""),
    competitors: text("competitors").notNull().default(""),
    winLossReason: text("win_loss_reason").notNull().default(""),
    ownerUserId: integer("owner_user_id").notNull().references(() => users.id),
    createdBy: integer("created_by").notNull().references(() => users.id),
    updatedBy: integer("updated_by").notNull().references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("opportunities_customer_idx").on(table.customerId),
    index("opportunities_owner_idx").on(table.ownerUserId),
    index("opportunities_status_idx").on(table.status),
  ],
);

export const opportunitySteps = sqliteTable(
  "opportunity_steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    opportunityId: integer("opportunity_id").notNull().references(() => opportunities.id),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("pending"),
    dueAt: text("due_at"),
    completedAt: text("completed_at"),
    assigneeUserId: integer("assignee_user_id").references(() => users.id),
    notes: text("notes").notNull().default(""),
    probability: integer("probability"),
    ...timestamps,
  },
  (table) => [index("opportunity_steps_opportunity_idx").on(table.opportunityId)],
);

export const activities = sqliteTable(
  "activities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    opportunityId: integer("opportunity_id").references(() => opportunities.id),
    title: text("title").notNull(),
    type: text("type").notNull(),
    direction: text("direction").notNull().default("outbound"),
    status: text("status", { enum: ["planned", "completed", "cancelled"] }).notNull().default("completed"),
    startsAt: text("starts_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    description: text("description").notNull().default(""),
    result: text("result").notNull().default(""),
    nextAction: text("next_action").notNull().default(""),
    nextActionAt: text("next_action_at"),
    freeContactNames: text("free_contact_names").notNull().default("[]"),
    assigneeUserId: integer("assignee_user_id").notNull().references(() => users.id),
    isManagerPrivate: integer("is_manager_private", { mode: "boolean" }).notNull().default(false),
    createdBy: integer("created_by").notNull().references(() => users.id),
    updatedBy: integer("updated_by").notNull().references(() => users.id),
    completedAt: text("completed_at"),
    ...timestamps,
  },
  (table) => [
    index("activities_customer_idx").on(table.customerId),
    index("activities_assignee_idx").on(table.assigneeUserId),
    index("activities_starts_idx").on(table.startsAt),
  ],
);

export const activityContacts = sqliteTable(
  "activity_contacts",
  {
    activityId: integer("activity_id").notNull().references(() => activities.id),
    contactId: integer("contact_id").notNull().references(() => contacts.id),
  },
  (table) => [uniqueIndex("activity_contacts_uq").on(table.activityId, table.contactId)],
);

export const documents = sqliteTable(
  "documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    activityId: integer("activity_id").references(() => activities.id),
    opportunityId: integer("opportunity_id").references(() => opportunities.id),
    title: text("title").notNull(),
    documentType: text("document_type").notNull().default("other"),
    version: text("version").notNull().default("1"),
    documentDate: text("document_date"),
    referenceNumber: text("reference_number").notNull().default(""),
    description: text("description").notNull().default(""),
    fileName: text("file_name").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull().default("application/octet-stream"),
    size: integer("size").notNull().default(0),
    status: text("status").notNull().default("active"),
    uploadedBy: integer("uploaded_by").notNull().references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("documents_customer_idx").on(table.customerId),
    uniqueIndex("documents_object_key_uq").on(table.objectKey),
  ],
);

export const managerNotes = sqliteTable(
  "manager_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    contactId: integer("contact_id").references(() => contacts.id),
    opportunityId: integer("opportunity_id").references(() => opportunities.id),
    activityId: integer("activity_id").references(() => activities.id),
    body: text("body").notNull(),
    createdBy: integer("created_by").notNull().references(() => users.id),
    ...timestamps,
  },
  (table) => [index("manager_notes_customer_idx").on(table.customerId)],
);

export const timelineEvents = sqliteTable(
  "timeline_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    isManagerPrivate: integer("is_manager_private", { mode: "boolean" }).notNull().default(false),
    createdBy: integer("created_by").notNull().references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("timeline_events_customer_idx").on(table.customerId),
    index("timeline_events_created_idx").on(table.createdAt),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    customerId: integer("customer_id").references(() => customers.id),
    timelineEventId: integer("timeline_event_id").references(() => timelineEvents.id),
    kind: text("kind").notNull().default("event"),
    entityType: text("entity_type").notNull().default(""),
    entityId: integer("entity_id"),
    dedupeKey: text("dedupe_key"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("notifications_user_idx").on(table.userId),
    index("notifications_read_idx").on(table.isRead),
    uniqueIndex("notifications_user_dedupe_uq").on(table.userId, table.dedupeKey),
  ],
);

export const emailOutbox = sqliteTable(
  "email_outbox",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    timelineEventId: integer("timeline_event_id").references(() => timelineEvents.id),
    recipientEmail: text("recipient_email").notNull(),
    subject: text("subject").notNull(),
    htmlBody: text("html_body").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
    sentAt: text("sent_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("email_outbox_status_idx").on(table.status)],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    action: text("action").notNull(),
    beforeJson: text("before_json").notNull().default(""),
    afterJson: text("after_json").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("audit_logs_entity_idx").on(table.entityType, table.entityId)],
);

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type").notNull(),
    fileName: text("file_name").notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    insertedRows: integer("inserted_rows").notNull().default(0),
    updatedRows: integer("updated_rows").notNull().default(0),
    rejectedRows: integer("rejected_rows").notNull().default(0),
    resultJson: text("result_json").notNull().default("[]"),
    createdBy: integer("created_by").notNull().references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("import_batches_created_idx").on(table.createdAt)],
);
