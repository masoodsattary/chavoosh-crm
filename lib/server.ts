type RuntimeEnv = {
  DB: D1Database;
  BUCKET: R2Bucket;
  RESEND_API_KEY?: string;
  CRM_FROM_EMAIL?: string;
  CRM_BASE_URL?: string;
};

export type AppUser = {
  id: number;
  email: string;
  fullName: string;
  mobile: string;
  role: "admin" | "sales_manager" | "sales" | "viewer";
  timezone: string;
  isActive: number;
  hasPassword: number;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function runtime() {
  const value = (globalThis as typeof globalThis & {
    __CHAVOOSH_ENV__?: RuntimeEnv;
  }).__CHAVOOSH_ENV__;
  if (!value) throw new ApiError(503, "محیط اجرایی در دسترس نیست.");
  if (!value.DB) throw new ApiError(503, "دیتابیس در دسترس نیست.");
  return value;
}

export async function requireApiUser(): Promise<AppUser> {
  const { requireAuthenticatedUser } = await import("./auth");
  const auth = await requireAuthenticatedUser();
  return auth.user;
}

export function requireRole(user: AppUser, roles: AppUser["role"][]) {
  if (!roles.includes(user.role)) {
    throw new ApiError(403, "برای انجام این عملیات دسترسی کافی ندارید.");
  }
}

export function isManager(user: AppUser) {
  return user.role === "admin" || user.role === "sales_manager";
}

export async function requireCustomerAccess(
  customerId: number,
  user: AppUser,
  write = false,
) {
  const customer = await runtime().DB
    .prepare(
      `SELECT c.*,
        EXISTS(
          SELECT 1 FROM customer_watchers cw
          WHERE cw.customer_id = c.id AND cw.user_id = ?
        ) AS is_watcher
       FROM customers c
       WHERE c.id = ? AND c.archived_at IS NULL`,
    )
    .bind(user.id, customerId)
    .first<Record<string, unknown>>();

  if (!customer) throw new ApiError(404, "مشتری پیدا نشد.");
  const allowed =
    isManager(user) ||
    customer.visibility === "public" ||
    Number(customer.owner_user_id) === user.id ||
    Number(customer.is_watcher) === 1;
  if (!allowed) throw new ApiError(403, "این مشتری خصوصی است.");
  if (write && user.role === "viewer") {
    throw new ApiError(403, "حساب مشاهده‌گر امکان ویرایش اطلاعات را ندارد.");
  }
  return customer;
}

export function cleanText(value: unknown, max = 4000) {
  return String(value ?? "")
    .replace(/\u064a/g, "ی")
    .replace(/\u0643/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function cleanMultiline(value: unknown, max = 20000) {
  return String(value ?? "")
    .replace(/\u064a/g, "ی")
    .replace(/\u0643/g, "ک")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

export function optionalInt(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

export function requiredInt(value: unknown, label: string) {
  const parsed = optionalInt(value);
  if (!parsed) throw new ApiError(400, `${label} الزامی است.`);
  return parsed;
}

export async function resolveTagIds(
  selectedIds: unknown,
  newNames: unknown,
  actorId: number,
) {
  const ids = Array.isArray(selectedIds)
    ? [...new Set(selectedIds.map(optionalInt).filter(Boolean) as number[])]
    : [];
  const names = Array.isArray(newNames)
    ? [...new Set(newNames.map((name) => cleanText(name, 100)).filter(Boolean))]
    : [];
  for (const name of names) {
    await runtime().DB
      .prepare(
        `INSERT INTO tags (name, created_by) VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET
           is_active = 1, archived_at = NULL, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(name, actorId)
      .run();
    const tag = await runtime().DB
      .prepare("SELECT id FROM tags WHERE name = ? AND archived_at IS NULL")
      .bind(name)
      .first<{ id: number }>();
    if (tag && !ids.includes(tag.id)) ids.push(tag.id);
  }
  return ids;
}

export async function recordAudit(
  user: AppUser,
  entityType: string,
  entityId: number | null,
  action: string,
  before: unknown = "",
  after: unknown = "",
) {
  await runtime().DB
    .prepare(
      `INSERT INTO audit_logs
       (user_id, entity_type, entity_id, action, before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      user.id,
      entityType,
      entityId,
      action,
      before ? JSON.stringify(before) : "",
      after ? JSON.stringify(after) : "",
    )
    .run();
}

export async function recordEvent(args: {
  customerId: number;
  user: AppUser;
  eventType: string;
  title: string;
  summary?: string;
  entityType: string;
  entityId?: number | null;
  managerPrivate?: boolean;
}) {
  const db = runtime().DB;
  const eventResult = await db
    .prepare(
      `INSERT INTO timeline_events
       (customer_id, event_type, title, summary, entity_type, entity_id,
        is_manager_private, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      args.customerId,
      args.eventType,
      cleanText(args.title, 300),
      cleanMultiline(args.summary ?? "", 6000),
      args.entityType,
      args.entityId ?? null,
      args.managerPrivate ? 1 : 0,
      args.user.id,
    )
    .run();
  const eventId = Number(eventResult.meta.last_row_id);

  const customer = await db
    .prepare("SELECT name, owner_user_id FROM customers WHERE id = ?")
    .bind(args.customerId)
    .first<{ name: string; owner_user_id: number }>();

  const recipients = await db
    .prepare(
      `SELECT DISTINCT u.id, u.email, u.role
       FROM users u
       WHERE u.is_active = 1 AND u.archived_at IS NULL
         AND u.id != ?
         AND (
           u.id = ?
           OR u.id IN (
             SELECT user_id FROM customer_watchers WHERE customer_id = ?
           )
         )`,
    )
    .bind(args.user.id, customer?.owner_user_id ?? 0, args.customerId)
    .all<{ id: number; email: string; role: string }>();

  const baseUrl = runtime().CRM_BASE_URL || "https://chavoosh-crm.masoodsattary.chatgpt.site";
  const subject = `[چاووش CRM] ${args.title} — ${customer?.name ?? "مشتری"}`;
  const safeTitle = escapeHtml(args.title);
  const safeSummary = escapeHtml(args.summary ?? "").replace(/\n/g, "<br>");
  const html = `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;color:#17212b">
      <h2 style="color:#283980">${safeTitle}</h2>
      <p><strong>مشتری:</strong> ${escapeHtml(customer?.name ?? "")}</p>
      ${safeSummary ? `<p>${safeSummary}</p>` : ""}
      <p><strong>ثبت‌کننده:</strong> ${escapeHtml(args.user.fullName || args.user.email)}</p>
      <p><a href="${baseUrl}/?customer=${args.customerId}&tab=timeline"
         style="background:#283980;color:white;padding:10px 16px;border-radius:8px;text-decoration:none">
         مشاهده در CRM
      </a></p>
    </div>`;

  for (const recipient of recipients.results) {
    if (
      args.managerPrivate &&
      recipient.role !== "admin" &&
      recipient.role !== "sales_manager"
    ) {
      continue;
    }
    await db.batch([
      db
        .prepare(
          `INSERT INTO notifications
           (user_id, customer_id, timeline_event_id, kind, entity_type,
            entity_id, title, body)
           VALUES (?, ?, ?, 'event', ?, ?, ?, ?)`,
        )
        .bind(
          recipient.id,
          args.customerId,
          eventId,
          args.entityType,
          args.entityId ?? null,
          args.title,
          args.summary ?? "",
        ),
      db
        .prepare(
          `INSERT INTO email_outbox
           (user_id, timeline_event_id, recipient_email, subject, html_body)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(recipient.id, eventId, recipient.email, subject, html),
    ]);
  }

  await dispatchPendingEmails(10);
  return eventId;
}

export async function syncCustomerNextAction(customerId: number) {
  await runtime().DB
    .prepare(
      `UPDATE customers
       SET next_action_at = (
         SELECT a.starts_at
         FROM activities a
         WHERE a.customer_id = customers.id
           AND a.status = 'planned' AND a.archived_at IS NULL
         ORDER BY a.starts_at ASC, a.id ASC
         LIMIT 1
       ), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(customerId)
    .run();
}

export async function createActivityNotification(args: {
  userId: number;
  customerId: number;
  activityId: number;
  kind: "assignment" | "due" | "overdue";
  title: string;
  body: string;
  dedupeKey: string;
}) {
  const db = runtime().DB;
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO notifications
       (user_id, customer_id, kind, entity_type, entity_id, dedupe_key, title, body)
       VALUES (?, ?, ?, 'activity', ?, ?, ?, ?)`,
    )
    .bind(
      args.userId,
      args.customerId,
      args.kind,
      args.activityId,
      args.dedupeKey,
      cleanText(args.title, 300),
      cleanMultiline(args.body, 3000),
    )
    .run();

  if (Number(result.meta.changes ?? 0) > 0) {
    const recipient = await db
      .prepare(
        `SELECT email FROM users
         WHERE id = ? AND is_active = 1 AND archived_at IS NULL`,
      )
      .bind(args.userId)
      .first<{ email: string }>();
    const customer = await db
      .prepare("SELECT name FROM customers WHERE id = ?")
      .bind(args.customerId)
      .first<{ name: string }>();
    if (recipient?.email) {
      const baseUrl =
        runtime().CRM_BASE_URL ||
        "https://chavoosh-crm.masoodsattary.chatgpt.site";
      const html = `
        <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;color:#17212b">
          <h2 style="color:#283980">${escapeHtml(args.title)}</h2>
          <p><strong>مشتری:</strong> ${escapeHtml(customer?.name ?? "")}</p>
          <p>${escapeHtml(args.body)}</p>
          <p><a href="${baseUrl}/?customer=${args.customerId}&activity=${args.activityId}"
             style="background:#283980;color:white;padding:10px 16px;border-radius:8px;text-decoration:none">
             مشاهده فعالیت
          </a></p>
        </div>`;
      await db
        .prepare(
          `INSERT INTO email_outbox
           (user_id, recipient_email, subject, html_body)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(
          args.userId,
          recipient.email,
          `[چاووش CRM] ${args.title}`,
          html,
        )
        .run();
    }
  }
  return Number(result.meta.changes ?? 0) > 0;
}

export async function ensureActivityReminders(user: AppUser) {
  const rows = await runtime().DB
    .prepare(
      `SELECT a.id, a.customer_id AS customerId, a.title, a.starts_at AS startsAt,
              c.name AS customerName
       FROM activities a
       JOIN customers c ON c.id = a.customer_id
       WHERE a.assignee_user_id = ? AND a.status = 'planned'
         AND a.archived_at IS NULL AND c.archived_at IS NULL
         AND datetime(a.starts_at) <= datetime('now', '+24 hours')
       ORDER BY a.starts_at ASC LIMIT 100`,
    )
    .bind(user.id)
    .all<{
      id: number;
      customerId: number;
      title: string;
      startsAt: string;
      customerName: string;
    }>();

  const now = Date.now();
  for (const activity of rows.results) {
    const overdue = new Date(activity.startsAt).getTime() < now;
    await createActivityNotification({
      userId: user.id,
      customerId: activity.customerId,
      activityId: activity.id,
      kind: overdue ? "overdue" : "due",
      title: overdue ? "اقدام عقب‌افتاده" : "یادآوری اقدام پیش رو",
      body: `${activity.title} — ${activity.customerName}`,
      dedupeKey: `activity:${activity.id}:${overdue ? "overdue" : "due"}`,
    });
  }
  await dispatchPendingEmails(10);
}

export async function dispatchPendingEmails(limit = 20) {
  const runtimeEnv = runtime();
  if (!runtimeEnv.RESEND_API_KEY || !runtimeEnv.CRM_FROM_EMAIL) {
    return { sent: 0, configured: false };
  }
  const pending = await runtimeEnv.DB
    .prepare(
      `SELECT id, recipient_email, subject, html_body
       FROM email_outbox
       WHERE status = 'pending' AND attempts < 5
       ORDER BY id LIMIT ?`,
    )
    .bind(limit)
    .all<{
      id: number;
      recipient_email: string;
      subject: string;
      html_body: string;
    }>();

  let sent = 0;
  for (const item of pending.results) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${runtimeEnv.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: runtimeEnv.CRM_FROM_EMAIL,
          to: [item.recipient_email],
          subject: item.subject,
          html: item.html_body,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      await runtimeEnv.DB
        .prepare(
          `UPDATE email_outbox
           SET status = 'sent', sent_at = CURRENT_TIMESTAMP,
               attempts = attempts + 1, last_error = ''
           WHERE id = ?`,
        )
        .bind(item.id)
        .run();
      sent += 1;
    } catch (error) {
      await runtimeEnv.DB
        .prepare(
          `UPDATE email_outbox
           SET attempts = attempts + 1, last_error = ?
           WHERE id = ?`,
        )
        .bind(error instanceof Error ? error.message.slice(0, 1000) : "خطای ارسال", item.id)
        .run();
    }
  }
  return { sent, configured: true };
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json(
    { error: error instanceof Error ? error.message : "خطای پیش‌بینی‌نشده" },
    { status: 500 },
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char] ?? char,
  );
}
