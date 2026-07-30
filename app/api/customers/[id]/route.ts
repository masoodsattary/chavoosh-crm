import {
  ApiError,
  cleanMultiline,
  cleanText,
  isManager,
  jsonError,
  optionalInt,
  recordAudit,
  recordEvent,
  resolveTagIds,
  requireApiUser,
  requireCustomerAccess,
  runtime,
} from "@/lib/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const customerId = Number((await context.params).id);
    const customer = await requireCustomerAccess(customerId, user);
    const db = runtime().DB;
    const manager = isManager(user) ? 1 : 0;

    const [watchers, tagRows, contacts, activities, opportunities, docs, timeline, notes] =
      await Promise.all([
        db
          .prepare(
            `SELECT u.id, u.full_name AS fullName, u.email, u.role
             FROM customer_watchers cw JOIN users u ON u.id = cw.user_id
             WHERE cw.customer_id = ? AND u.is_active = 1 ORDER BY u.full_name`,
          )
          .bind(customerId)
          .all(),
        db
          .prepare(
            `SELECT t.id, t.name, t.color FROM customer_tags ct
             JOIN tags t ON t.id = ct.tag_id
             WHERE ct.customer_id = ? AND t.archived_at IS NULL`,
          )
          .bind(customerId)
          .all(),
        db
          .prepare(
            `SELECT id, customer_id AS customerId, first_name AS firstName,
                    last_name AS lastName, prefix, job_title AS jobTitle,
                    department, decision_roles AS decisionRoles,
                    direct_phone AS directPhone, extension, mobile, email,
                    secondary_email AS secondaryEmail, fax, address,
                    preferred_contact AS preferredContact, notes, status,
                    created_at AS createdAt, updated_at AS updatedAt
             FROM contacts WHERE customer_id = ? AND archived_at IS NULL
             ORDER BY status = 'active' DESC, last_name, first_name`,
          )
          .bind(customerId)
          .all(),
        db
          .prepare(
            `SELECT a.id, a.customer_id AS customerId,
                    a.opportunity_id AS opportunityId, a.title, a.type,
                    a.direction, a.status, a.starts_at AS startsAt,
                    a.duration_minutes AS durationMinutes, a.description,
                    a.result, a.next_action AS nextAction,
                    a.next_action_at AS nextActionAt,
                    a.free_contact_names AS freeContactNames,
                    a.assignee_user_id AS assigneeUserId,
                    u.full_name AS assigneeName,
                    a.is_manager_private AS isManagerPrivate,
                    a.created_at AS createdAt,
                    COALESCE((
                      SELECT GROUP_CONCAT(
                        co.id || '§' || TRIM(co.first_name || ' ' || co.last_name),
                        '¦'
                      )
                      FROM activity_contacts ac
                      JOIN contacts co ON co.id = ac.contact_id
                      WHERE ac.activity_id = a.id AND co.archived_at IS NULL
                    ), '') AS contactRefs
             FROM activities a JOIN users u ON u.id = a.assignee_user_id
             WHERE a.customer_id = ? AND a.archived_at IS NULL
               AND (? = 1 OR a.is_manager_private = 0)
             ORDER BY a.starts_at DESC`,
          )
          .bind(customerId, manager)
          .all(),
        db
          .prepare(
            `SELECT o.id, o.customer_id AS customerId, o.title, o.description,
                    o.solution_text AS solutionText, o.status,
                    o.current_stage AS currentStage, o.amount, o.currency,
                    o.probability, o.forecast_at AS forecastAt,
                    o.latest_status AS latestStatus,
                    o.next_action AS nextAction,
                    o.next_action_at AS nextActionAt,
                    o.owner_user_id AS ownerUserId, u.full_name AS ownerName,
                    o.created_at AS createdAt
             FROM opportunities o JOIN users u ON u.id = o.owner_user_id
             WHERE o.customer_id = ? AND o.archived_at IS NULL
             ORDER BY o.status = 'open' DESC, o.created_at DESC`,
          )
          .bind(customerId)
          .all(),
        db
          .prepare(
            `SELECT id, customer_id AS customerId, activity_id AS activityId,
                    opportunity_id AS opportunityId, title,
                    document_type AS documentType, version,
                    document_date AS documentDate,
                    reference_number AS referenceNumber, description,
                    file_name AS fileName, content_type AS contentType, size,
                    status, created_at AS createdAt
             FROM documents WHERE customer_id = ? AND archived_at IS NULL
             ORDER BY created_at DESC`,
          )
          .bind(customerId)
          .all(),
        db
          .prepare(
            `SELECT te.id, te.event_type AS eventType, te.title, te.summary,
                    te.entity_type AS entityType, te.entity_id AS entityId,
                    te.is_manager_private AS isManagerPrivate,
                    te.created_at AS createdAt,
                    u.full_name AS createdByName, u.email AS createdByEmail
             FROM timeline_events te JOIN users u ON u.id = te.created_by
             WHERE te.customer_id = ?
               AND (? = 1 OR te.is_manager_private = 0)
             ORDER BY te.created_at DESC LIMIT 300`,
          )
          .bind(customerId, manager)
          .all(),
        manager
          ? db
              .prepare(
                `SELECT mn.id, mn.body, mn.contact_id AS contactId,
                        mn.opportunity_id AS opportunityId,
                        mn.activity_id AS activityId,
                        mn.created_at AS createdAt,
                        u.full_name AS createdByName
                 FROM manager_notes mn JOIN users u ON u.id = mn.created_by
                 WHERE mn.customer_id = ? AND mn.archived_at IS NULL
                 ORDER BY mn.created_at DESC`,
              )
              .bind(customerId)
              .all()
          : Promise.resolve({ results: [] }),
      ]);

    const steps =
      opportunities.results.length > 0
        ? await db
            .prepare(
              `SELECT os.id, os.opportunity_id AS opportunityId, os.title,
                      os.sort_order AS sortOrder, os.status,
                      os.due_at AS dueAt, os.completed_at AS completedAt,
                      os.assignee_user_id AS assigneeUserId,
                      u.full_name AS assigneeName, os.notes, os.probability
               FROM opportunity_steps os
               LEFT JOIN users u ON u.id = os.assignee_user_id
               WHERE os.opportunity_id IN (
                 SELECT id FROM opportunities WHERE customer_id = ?
               ) AND os.archived_at IS NULL
               ORDER BY os.opportunity_id, os.sort_order`,
            )
            .bind(customerId)
            .all()
        : { results: [] };

    return Response.json({
      customer,
      watchers: watchers.results,
      tags: tagRows.results,
      contacts: contacts.results.map((row) => ({
        ...row,
        decisionRoles: safeArray((row as Record<string, unknown>).decisionRoles),
      })),
      activities: activities.results.map(hydrateActivity),
      opportunities: opportunities.results,
      steps: steps.results,
      documents: docs.results,
      timeline: timeline.results,
      managerNotes: notes.results,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const customerId = Number((await context.params).id);
    const before = await requireCustomerAccess(customerId, user, true);
    const body = (await request.json()) as Record<string, unknown>;
    const ownerUserId = optionalInt(body.ownerUserId) ?? Number(before.owner_user_id);
    const visibility =
      body.visibility === "private"
        ? "private"
        : body.visibility === "public"
          ? "public"
          : String(before.visibility);
    if (
      (ownerUserId !== Number(before.owner_user_id) ||
        visibility !== String(before.visibility)) &&
      !isManager(user) &&
      Number(before.owner_user_id) !== user.id
    ) {
      throw new ApiError(403, "فقط مسئول حساب یا مدیر می‌تواند دسترسی را تغییر دهد.");
    }
    const name = cleanText(body.name ?? before.name, 300);
    if (!name) throw new ApiError(400, "نام مشتری الزامی است.");

    await runtime().DB
      .prepare(
        `UPDATE customers SET
          name = ?, short_name = ?, english_name = ?, organization_type = ?,
          industry = ?, relationship_status = ?, importance = ?, website = ?,
          phone = ?, other_phones = ?, fax = ?, email = ?,
          secretariat_number = ?, postal_code = ?, province = ?, city = ?,
          address = ?, description = ?, source = ?, visibility = ?,
          owner_user_id = ?, parent_customer_id = ?, updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        name,
        cleanText(body.shortName ?? before.short_name, 100),
        cleanText(body.englishName ?? before.english_name, 300),
        cleanText(body.organizationType ?? before.organization_type, 100),
        cleanText(body.industry ?? before.industry, 150),
        cleanText(body.relationshipStatus ?? before.relationship_status, 50),
        cleanText(body.importance ?? before.importance, 50),
        cleanText(body.website ?? before.website, 300),
        cleanText(body.phone ?? before.phone, 80),
        cleanText(body.otherPhones ?? before.other_phones, 300),
        cleanText(body.fax ?? before.fax, 80),
        cleanText(body.email ?? before.email, 200).toLowerCase(),
        cleanText(body.secretariatNumber ?? before.secretariat_number, 100),
        cleanText(body.postalCode ?? before.postal_code, 30),
        cleanText(body.province ?? before.province, 100),
        cleanText(body.city ?? before.city, 100),
        cleanMultiline(body.address ?? before.address, 1000),
        cleanMultiline(body.description ?? before.description, 5000),
        cleanText(body.source ?? before.source, 200),
        visibility,
        ownerUserId,
        optionalInt(body.parentCustomerId ?? before.parent_customer_id),
        user.id,
        customerId,
      )
      .run();

    if (Array.isArray(body.watcherIds)) {
      await runtime().DB
        .prepare("DELETE FROM customer_watchers WHERE customer_id = ?")
        .bind(customerId)
        .run();
      const ids = [...new Set(body.watcherIds.map(optionalInt).filter(Boolean) as number[])];
      if (!ids.includes(ownerUserId)) ids.push(ownerUserId);
      for (const id of ids) {
        await runtime().DB
          .prepare(
            `INSERT OR IGNORE INTO customer_watchers
             (customer_id, user_id, added_by) VALUES (?, ?, ?)`,
          )
          .bind(customerId, id, user.id)
          .run();
      }
    }
    if (Array.isArray(body.tagIds) || Array.isArray(body.newTagNames)) {
      await runtime().DB
        .prepare("DELETE FROM customer_tags WHERE customer_id = ?")
        .bind(customerId)
        .run();
      const tagIds = await resolveTagIds(body.tagIds, body.newTagNames, user.id);
      for (const id of tagIds) {
        await runtime().DB
          .prepare(
            "INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?, ?)",
          )
          .bind(customerId, id)
          .run();
      }
    }

    await recordAudit(user, "customer", customerId, "update", before, body);
    await recordEvent({
      customerId,
      user,
      eventType: "customer_updated",
      title: "اطلاعات مشتری به‌روزرسانی شد",
      summary:
        visibility !== String(before.visibility)
          ? `سطح دسترسی به «${visibility === "private" ? "خصوصی" : "عمومی"}» تغییر کرد.`
          : "",
      entityType: "customer",
      entityId: customerId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const customerId = Number((await context.params).id);
    const before = await requireCustomerAccess(customerId, user, true);
    if (!isManager(user) && Number(before.owner_user_id) !== user.id) {
      throw new ApiError(403, "فقط مسئول حساب یا مدیر می‌تواند مشتری را بایگانی کند.");
    }
    await runtime().DB
      .prepare(
        `UPDATE customers SET archived_at = CURRENT_TIMESTAMP,
         updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(user.id, customerId)
      .run();
    await recordAudit(user, "customer", customerId, "archive", before, "");
    await recordEvent({
      customerId,
      user,
      eventType: "customer_archived",
      title: "مشتری بایگانی شد",
      summary: cleanText(before.name, 300),
      entityType: "customer",
      entityId: customerId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

function safeArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
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
        const [id, ...name] = entry.split("§");
        return { id: Number(id), name: name.join("§") };
      }),
    freeContactNames: safeArray(item.freeContactNames),
  };
}
