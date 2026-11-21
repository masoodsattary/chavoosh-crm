import {
  ApiError,
  isManager,
  jsonError,
  requireApiUser,
  requireCustomerAccess,
  runtime,
} from "@/lib/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const id = Number((await context.params).id);
    const contact = await runtime().DB
      .prepare(
        `SELECT co.id, co.customer_id AS customerId, c.name AS customerName,
                co.first_name AS firstName, co.last_name AS lastName,
                co.prefix, co.job_title AS jobTitle, co.department,
                co.decision_roles AS decisionRoles,
                co.direct_phone AS directPhone, co.extension, co.mobile,
                co.email, co.secondary_email AS secondaryEmail, co.fax,
                co.address, co.preferred_contact AS preferredContact,
                co.notes, co.status, co.created_at AS createdAt,
                co.updated_at AS updatedAt
         FROM contacts co JOIN customers c ON c.id = co.customer_id
         WHERE co.id = ? AND co.archived_at IS NULL`,
      )
      .bind(id)
      .first<Record<string, unknown>>();
    if (!contact) throw new ApiError(404, "فرد پیدا نشد.");
    await requireCustomerAccess(Number(contact.customerId), user);

    const activities = await runtime().DB
      .prepare(
        `SELECT a.id, a.customer_id AS customerId, c.name AS customerName,
                a.opportunity_id AS opportunityId, a.title, a.type,
                a.direction, a.status, a.starts_at AS startsAt,
                a.duration_minutes AS durationMinutes, a.description,
                a.result,
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
                    co2.id || '§' || TRIM(co2.first_name || ' ' || co2.last_name),
                    '¦'
                  )
                  FROM activity_contacts ac2
                  JOIN contacts co2 ON co2.id = ac2.contact_id
                  WHERE ac2.activity_id = a.id AND co2.archived_at IS NULL
                ), '') AS contactRefs
         FROM activity_contacts ac
         JOIN activities a ON a.id = ac.activity_id
         JOIN customers c ON c.id = a.customer_id
         JOIN users u ON u.id = a.assignee_user_id
         LEFT JOIN activities sa ON sa.id = a.source_activity_id
         LEFT JOIN activities na ON na.source_activity_id = a.id AND na.archived_at IS NULL
         LEFT JOIN users nau ON nau.id = na.assignee_user_id
         WHERE ac.contact_id = ? AND a.archived_at IS NULL
           AND (? = 1 OR a.is_manager_private = 0)
         ORDER BY a.starts_at DESC`,
      )
      .bind(id, isManager(user) ? 1 : 0)
      .all();

    return Response.json({
      contact: {
        ...contact,
        decisionRoles: safeArray(contact.decisionRoles),
      },
      activities: activities.results.map(hydrateActivity),
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
  return {
    ...item,
    contacts: String(item.contactRefs || "")
      .split("¦")
      .filter(Boolean)
      .map((entry) => {
        const [contactId, ...name] = entry.split("§");
        return { id: Number(contactId), name: name.join("§") };
      }),
    freeContactNames: safeArray(item.freeContactNames),
  };
}
