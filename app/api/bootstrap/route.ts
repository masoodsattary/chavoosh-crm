import {
  ensureActivityReminders,
  isManager,
  jsonError,
  requireApiUser,
  runtime,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser();
    const db = runtime().DB;
    const manager = isManager(user) ? 1 : 0;
    await ensureActivityReminders(user);

    const [userRows, tagRows, customerRows, contactRows, activityRows, opportunityRows, notificationRows] =
      await Promise.all([
        db
          .prepare(
            `SELECT id, email, full_name AS fullName, mobile, role, timezone,
                    is_active AS isActive,
                    CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END AS hasPassword,
                    invite_expires_at AS inviteExpiresAt
             FROM users WHERE archived_at IS NULL
             ORDER BY is_active DESC, full_name, email`,
          )
          .all(),
        db
          .prepare(
            `SELECT id, name, color FROM tags
             WHERE archived_at IS NULL AND is_active = 1 ORDER BY name`,
          )
          .all(),
        db
          .prepare(
            `SELECT c.id, c.name, c.short_name AS shortName,
                    c.organization_type AS organizationType, c.industry,
                    c.relationship_status AS relationshipStatus, c.importance,
                    c.phone, c.fax, c.email, c.city, c.address, c.visibility,
                    c.owner_user_id AS ownerUserId, u.full_name AS ownerName,
                    c.last_interaction_at AS lastInteractionAt,
                    (
                      SELECT a.starts_at FROM activities a
                      WHERE a.customer_id = c.id AND a.status = 'planned'
                        AND a.archived_at IS NULL
                      ORDER BY a.starts_at ASC, a.id ASC LIMIT 1
                    ) AS nextActionAt,
                    (
                      SELECT a.title FROM activities a
                      WHERE a.customer_id = c.id AND a.status = 'planned'
                        AND a.archived_at IS NULL
                      ORDER BY a.starts_at ASC, a.id ASC LIMIT 1
                    ) AS nextAction,
                    (
                      SELECT u2.full_name FROM activities a
                      JOIN users u2 ON u2.id = a.assignee_user_id
                      WHERE a.customer_id = c.id AND a.status = 'planned'
                        AND a.archived_at IS NULL
                      ORDER BY a.starts_at ASC, a.id ASC LIMIT 1
                    ) AS nextActionAssigneeName,
                    COUNT(DISTINCT co.id) AS contactCount,
                    COUNT(DISTINCT CASE WHEN o.status = 'open' THEN o.id END) AS openOpportunityCount,
                    COALESCE(GROUP_CONCAT(DISTINCT t.name), '') AS tagNames,
                    EXISTS(SELECT 1 FROM customer_watchers cw
                           WHERE cw.customer_id = c.id AND cw.user_id = ?) AS isWatcher
             FROM customers c
             JOIN users u ON u.id = c.owner_user_id
             LEFT JOIN contacts co ON co.customer_id = c.id AND co.archived_at IS NULL
             LEFT JOIN opportunities o ON o.customer_id = c.id AND o.archived_at IS NULL
             LEFT JOIN customer_tags ct ON ct.customer_id = c.id
             LEFT JOIN tags t ON t.id = ct.tag_id AND t.archived_at IS NULL
             WHERE c.archived_at IS NULL
               AND (? = 1 OR c.visibility = 'public' OR c.owner_user_id = ?
                    OR EXISTS(SELECT 1 FROM customer_watchers cw2
                              WHERE cw2.customer_id = c.id AND cw2.user_id = ?))
             GROUP BY c.id
             ORDER BY COALESCE(c.last_interaction_at, c.created_at) DESC`,
          )
          .bind(user.id, manager, user.id, user.id)
          .all(),
        db
          .prepare(
            `SELECT co.id, co.customer_id AS customerId, c.name AS customerName,
                    co.first_name AS firstName, co.last_name AS lastName,
                    co.prefix, co.job_title AS jobTitle, co.department,
                    co.decision_roles AS decisionRoles,
                    co.direct_phone AS directPhone, co.extension, co.mobile,
                    co.email, co.secondary_email AS secondaryEmail, co.fax,
                    co.address, co.preferred_contact AS preferredContact,
                    co.notes, co.status,
                    COUNT(DISTINCT ac.activity_id) AS activityCount,
                    MAX(a.starts_at) AS lastActivityAt
             FROM contacts co
             JOIN customers c ON c.id = co.customer_id
             LEFT JOIN activity_contacts ac ON ac.contact_id = co.id
             LEFT JOIN activities a ON a.id = ac.activity_id AND a.archived_at IS NULL
             WHERE co.archived_at IS NULL AND c.archived_at IS NULL
               AND (? = 1 OR c.visibility = 'public' OR c.owner_user_id = ?
                    OR EXISTS(SELECT 1 FROM customer_watchers cw
                              WHERE cw.customer_id = c.id AND cw.user_id = ?))
             GROUP BY co.id
             ORDER BY co.last_name, co.first_name`,
          )
          .bind(manager, user.id, user.id)
          .all(),
        db
          .prepare(
            `SELECT a.id, a.customer_id AS customerId, c.name AS customerName,
                    a.opportunity_id AS opportunityId, a.title, a.type,
                    a.status, a.starts_at AS startsAt,
                    a.duration_minutes AS durationMinutes,
                    a.description, a.result,
                    COALESCE(na.title, a.next_action) AS nextAction,
                    COALESCE(na.starts_at, a.next_action_at) AS nextActionAt,
                    a.source_activity_id AS sourceActivityId,
                    sa.title AS sourceActivityTitle,
                    na.id AS nextActivityId,
                    na.status AS nextActivityStatus,
                    na.assignee_user_id AS nextActionAssigneeUserId,
                    nau.full_name AS nextActionAssigneeName,
                    a.free_contact_names AS freeContactNames,
                    a.assignee_user_id AS assigneeUserId,
                    u.full_name AS assigneeName,
                    a.is_manager_private AS isManagerPrivate,
                    COALESCE((
                      SELECT GROUP_CONCAT(
                        co.id || '§' || TRIM(co.first_name || ' ' || co.last_name),
                        '¦'
                      )
                      FROM activity_contacts ac
                      JOIN contacts co ON co.id = ac.contact_id
                      WHERE ac.activity_id = a.id AND co.archived_at IS NULL
                    ), '') AS contactRefs
             FROM activities a
             JOIN customers c ON c.id = a.customer_id
             JOIN users u ON u.id = a.assignee_user_id
             LEFT JOIN activities sa ON sa.id = a.source_activity_id
             LEFT JOIN activities na ON na.source_activity_id = a.id AND na.archived_at IS NULL
             LEFT JOIN users nau ON nau.id = na.assignee_user_id
             WHERE a.archived_at IS NULL
               AND (a.assignee_user_id = ? OR a.created_by = ? OR ? = 1)
               AND (? = 1 OR a.is_manager_private = 0)
               AND (? = 1 OR c.visibility = 'public' OR c.owner_user_id = ?
                    OR EXISTS(SELECT 1 FROM customer_watchers cw
                              WHERE cw.customer_id = c.id AND cw.user_id = ?))
             ORDER BY a.starts_at DESC LIMIT 100`,
          )
          .bind(user.id, user.id, manager, manager, manager, user.id, user.id)
          .all(),
        db
          .prepare(
            `SELECT o.id, o.customer_id AS customerId, c.name AS customerName,
                    o.title, o.description, o.solution_text AS solutionText,
                    o.status, o.current_stage AS currentStage, o.amount,
                    o.currency, o.probability, o.forecast_at AS forecastAt,
                    o.latest_status AS latestStatus, o.next_action AS nextAction,
                    o.next_action_at AS nextActionAt,
                    o.owner_user_id AS ownerUserId, u.full_name AS ownerName
             FROM opportunities o
             JOIN customers c ON c.id = o.customer_id
             JOIN users u ON u.id = o.owner_user_id
             WHERE o.archived_at IS NULL
               AND (? = 1 OR c.visibility = 'public' OR c.owner_user_id = ?
                    OR EXISTS(SELECT 1 FROM customer_watchers cw
                              WHERE cw.customer_id = c.id AND cw.user_id = ?))
             ORDER BY CASE WHEN o.status = 'open' THEN 0 ELSE 1 END,
                      COALESCE(o.forecast_at, o.created_at)`,
          )
          .bind(manager, user.id, user.id)
          .all(),
        db
          .prepare(
            `SELECT id, customer_id AS customerId, timeline_event_id AS timelineEventId,
                    kind, entity_type AS entityType, entity_id AS entityId,
                    title, body, is_read AS isRead, created_at AS createdAt
             FROM notifications WHERE user_id = ?
             ORDER BY created_at DESC LIMIT 50`,
          )
          .bind(user.id)
          .all(),
      ]);

    const stats = await db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM activities
           WHERE assignee_user_id = ? AND archived_at IS NULL
             AND status = 'planned' AND date(starts_at) = date('now')) AS todayActivities,
          (SELECT COUNT(*) FROM activities
           WHERE assignee_user_id = ? AND archived_at IS NULL
             AND status = 'planned' AND starts_at < datetime('now')) AS overdueActivities,
          (SELECT COUNT(*) FROM opportunities o
           JOIN customers c ON c.id = o.customer_id
           WHERE o.archived_at IS NULL AND o.status = 'open'
             AND (? = 1 OR c.visibility = 'public' OR c.owner_user_id = ?
                  OR EXISTS(SELECT 1 FROM customer_watchers cw
                            WHERE cw.customer_id = c.id AND cw.user_id = ?)))
             AS openOpportunities,
          (SELECT COUNT(*) FROM customers c
           WHERE c.archived_at IS NULL
             AND (? = 1 OR c.visibility = 'public' OR c.owner_user_id = ?
                  OR EXISTS(SELECT 1 FROM customer_watchers cw
                            WHERE cw.customer_id = c.id AND cw.user_id = ?)))
             AS customers`,
      )
      .bind(
        user.id,
        user.id,
        manager,
        user.id,
        user.id,
        manager,
        user.id,
        user.id,
      )
      .first();

    return Response.json({
      user,
      users: manager
        ? userRows.results
        : userRows.results.map((row) => {
            const item = row as Record<string, unknown>;
            return {
              id: item.id,
              email: item.email,
              fullName: item.fullName,
              role: item.role,
              isActive: item.isActive,
            };
          }),
      tags: tagRows.results,
      customers: customerRows.results.map((row) => ({
        ...row,
        tags: String((row as Record<string, unknown>).tagNames || "")
          .split(",")
          .filter(Boolean),
      })),
      contacts: contactRows.results.map((row) => ({
        ...row,
        decisionRoles: safeArray((row as Record<string, unknown>).decisionRoles),
      })),
      activities: activityRows.results.map(hydrateActivity),
      opportunities: opportunityRows.results,
      notifications: notificationRows.results,
      stats,
      emailConfigured: Boolean(runtime().RESEND_API_KEY && runtime().CRM_FROM_EMAIL),
    });
  } catch (error) {
    return jsonError(error);
  }
}

function safeArray(value: unknown) {
  try {
    const result = JSON.parse(String(value || "[]"));
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

function hydrateActivity(row: unknown) {
  const item = row as Record<string, unknown>;
  const contacts = String(item.contactRefs || "")
    .split("¦")
    .filter(Boolean)
    .map((entry) => {
      const [id, ...name] = entry.split("§");
      return { id: Number(id), name: name.join("§") };
    });
  return {
    ...item,
    contacts,
    freeContactNames: safeArray(item.freeContactNames),
  };
}
