import {
  ApiError,
  cleanMultiline,
  cleanText,
  createActivityNotification,
  isManager,
  jsonError,
  optionalInt,
  recordAudit,
  recordEvent,
  requiredInt,
  requireApiUser,
  requireCustomerAccess,
  runtime,
  syncCustomerNextAction,
  type AppUser,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown>;
    const customerId = requiredInt(body.customerId, "مشتری");
    await requireCustomerAccess(customerId, user, true);
    const type = cleanText(body.type, 80);
    const description = cleanMultiline(body.description, 12000);
    if (!type) throw new ApiError(400, "نوع فعالیت الزامی است.");
    if (!description) throw new ApiError(400, "شرح مذاکره یا فعالیت الزامی است.");
    const startsAt = cleanText(body.startsAt, 60) || new Date().toISOString();
    const status =
      body.status === "planned" || body.status === "cancelled" ? body.status : "completed";
    const title =
      cleanText(body.title, 300) ||
      `${activityLabel(type)} با ${cleanText(body.customerName, 200) || "مشتری"}`;
    const managerPrivate = body.isManagerPrivate === true;
    if (managerPrivate && !isManager(user)) {
      throw new ApiError(403, "یادداشت خصوصی فقط برای مدیران قابل ثبت است.");
    }
    const assigneeUserId = optionalInt(body.assigneeUserId) ?? user.id;
    const nextAction = cleanText(body.nextAction, 1000);
    const nextActionAt = cleanText(body.nextActionAt, 60) || null;
    if (status === "completed" && Boolean(nextAction) !== Boolean(nextActionAt)) {
      throw new ApiError(400, "برای اقدام بعدی، عنوان و موعد را با هم وارد کنید.");
    }
    const result = await runtime().DB
      .prepare(
        `INSERT INTO activities (
          customer_id, opportunity_id, title, type, direction, status,
          starts_at, duration_minutes, description, result, next_action,
          next_action_at, free_contact_names, assignee_user_id, is_manager_private,
          created_by, updated_by, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        customerId,
        optionalInt(body.opportunityId),
        title,
        type,
        cleanText(body.direction, 30) || "outbound",
        status,
        startsAt,
        Math.max(0, Number(body.durationMinutes) || 0),
        description,
        cleanMultiline(body.result, 5000),
        nextAction,
        nextActionAt,
        JSON.stringify(cleanNameArray(body.freeContactNames)),
        assigneeUserId,
        managerPrivate ? 1 : 0,
        user.id,
        user.id,
        status === "completed" ? new Date().toISOString() : null,
      )
      .run();
    const id = Number(result.meta.last_row_id);

    const contactIds = Array.isArray(body.contactIds)
      ? [...new Set(body.contactIds.map(optionalInt).filter(Boolean) as number[])]
      : [];
    for (const contactId of contactIds) {
      await runtime().DB
        .prepare(
          `INSERT OR IGNORE INTO activity_contacts (activity_id, contact_id)
           SELECT ?, id FROM contacts
           WHERE id = ? AND customer_id = ? AND archived_at IS NULL`,
        )
        .bind(id, contactId, customerId)
        .run();
    }
    await runtime().DB
      .prepare(
        `UPDATE customers SET
          last_interaction_at = CASE WHEN ? = 'completed' THEN ? ELSE last_interaction_at END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        status,
        startsAt,
        customerId,
      )
      .run();
    await recordAudit(user, "activity", id, "create", "", body);
    await recordEvent({
      customerId,
      user,
      eventType: `activity_${type}`,
      title,
      summary: description,
      entityType: "activity",
      entityId: id,
      managerPrivate,
    });
    let nextActivityId: number | null = null;
    if (status === "completed" && nextAction && nextActionAt) {
      nextActivityId = await createNextActivity({
        customerId,
        opportunityId: optionalInt(body.opportunityId),
        title: nextAction,
        startsAt: nextActionAt,
        assigneeUserId:
          optionalInt(body.nextActionAssigneeUserId) ?? assigneeUserId,
        contactIds,
        freeContactNames: cleanNameArray(body.freeContactNames),
        user,
      });
    } else if (status === "planned") {
      await createActivityNotification({
        userId: assigneeUserId,
        customerId,
        activityId: id,
        kind: "assignment",
        title: "اقدام جدید به شما واگذار شد",
        body: `${title} — ${startsAt}`,
        dedupeKey: `activity:${id}:assignment:${assigneeUserId}`,
      });
    }
    await syncCustomerNextAction(customerId);
    return Response.json({ id, nextActivityId }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown>;
    const id = requiredInt(body.id, "شناسه فعالیت");
    const before = await runtime().DB
      .prepare("SELECT * FROM activities WHERE id = ? AND archived_at IS NULL")
      .bind(id)
      .first<Record<string, unknown>>();
    if (!before) throw new ApiError(404, "فعالیت پیدا نشد.");
    const customerId = Number(before.customer_id);
    await requireCustomerAccess(customerId, user, true);
    const status = cleanText(body.status ?? before.status, 30);
    const assigneeUserId =
      optionalInt(body.assigneeUserId ?? before.assignee_user_id) ?? user.id;
    const nextAction = cleanText(body.nextAction ?? before.next_action, 1000);
    const nextActionAt =
      cleanText(body.nextActionAt ?? before.next_action_at, 60) || null;
    const completingNow =
      status === "completed" && String(before.status) !== "completed";
    const managerPrivate =
      body.isManagerPrivate === true
        ? true
        : body.isManagerPrivate === false
          ? false
          : Number(before.is_manager_private) === 1;
    if (
      Number(before.is_manager_private) !== (managerPrivate ? 1 : 0) &&
      !isManager(user)
    ) {
      throw new ApiError(403, "فقط مدیران می‌توانند محرمانگی فعالیت را تغییر دهند.");
    }
    if (completingNow && Boolean(nextAction) !== Boolean(nextActionAt)) {
      throw new ApiError(400, "برای اقدام بعدی، عنوان و موعد را با هم وارد کنید.");
    }
    await runtime().DB
      .prepare(
        `UPDATE activities SET
          title = ?, type = ?, direction = ?, status = ?, starts_at = ?,
          duration_minutes = ?, description = ?, result = ?, next_action = ?,
          next_action_at = ?, free_contact_names = ?, assignee_user_id = ?,
          is_manager_private = ?, completed_at = ?,
          updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        cleanText(body.title ?? before.title, 300),
        cleanText(body.type ?? before.type, 80),
        cleanText(body.direction ?? before.direction, 30),
        status,
        cleanText(body.startsAt ?? before.starts_at, 60),
        Math.max(0, Number(body.durationMinutes ?? before.duration_minutes) || 0),
        cleanMultiline(body.description ?? before.description, 12000),
        cleanMultiline(body.result ?? before.result, 5000),
        nextAction,
        nextActionAt,
        Array.isArray(body.freeContactNames)
          ? JSON.stringify(cleanNameArray(body.freeContactNames))
          : String(before.free_contact_names ?? "[]"),
        assigneeUserId,
        managerPrivate ? 1 : 0,
        status === "completed" ? new Date().toISOString() : null,
        user.id,
        id,
      )
      .run();
    if (Array.isArray(body.contactIds)) {
      await runtime().DB
        .prepare("DELETE FROM activity_contacts WHERE activity_id = ?")
        .bind(id)
        .run();
      const contactIds = [
        ...new Set(body.contactIds.map(optionalInt).filter(Boolean) as number[]),
      ];
      for (const contactId of contactIds) {
          await runtime().DB
          .prepare(
            `INSERT OR IGNORE INTO activity_contacts (activity_id, contact_id)
             SELECT ?, id FROM contacts
             WHERE id = ? AND customer_id = ? AND archived_at IS NULL`,
          )
          .bind(id, contactId, customerId)
          .run();
      }
    }
    const contactIds = await runtime().DB
      .prepare(
        `SELECT contact_id AS contactId
         FROM activity_contacts WHERE activity_id = ?`,
      )
      .bind(id)
      .all<{ contactId: number }>();
    await recordAudit(user, "activity", id, "update", before, body);
    await recordEvent({
      customerId,
      user,
      eventType: status === "completed" ? "activity_completed" : "activity_updated",
      title:
        status === "completed"
          ? `فعالیت «${cleanText(body.title ?? before.title, 300)}» انجام شد`
          : "فعالیت به‌روزرسانی شد",
      summary: cleanMultiline(body.result ?? body.description ?? "", 5000),
      entityType: "activity",
      entityId: id,
      managerPrivate,
    });
    let nextActivityId: number | null = null;
    if (completingNow && nextAction && nextActionAt) {
      nextActivityId = await createNextActivity({
        customerId,
        opportunityId: optionalInt(
          body.opportunityId ?? before.opportunity_id,
        ),
        title: nextAction,
        startsAt: nextActionAt,
        assigneeUserId:
          optionalInt(body.nextActionAssigneeUserId) ?? assigneeUserId,
        contactIds: contactIds.results.map((item) => item.contactId),
        freeContactNames: cleanNameArray(
          body.freeContactNames ?? safeNameArray(before.free_contact_names),
        ),
        user,
      });
    } else if (
      status === "planned" &&
      assigneeUserId !== Number(before.assignee_user_id)
    ) {
      await createActivityNotification({
        userId: assigneeUserId,
        customerId,
        activityId: id,
        kind: "assignment",
        title: "اقدام به شما واگذار شد",
        body: cleanText(body.title ?? before.title, 300),
        dedupeKey: `activity:${id}:assignment:${assigneeUserId}`,
      });
    }
    await syncCustomerNextAction(customerId);
    return Response.json({ ok: true, nextActivityId });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown>;
    const id = requiredInt(body.id, "شناسه فعالیت");
    const before = await runtime().DB
      .prepare("SELECT * FROM activities WHERE id = ? AND archived_at IS NULL")
      .bind(id)
      .first<Record<string, unknown>>();
    if (!before) throw new ApiError(404, "فعالیت پیدا نشد.");
    await requireCustomerAccess(Number(before.customer_id), user, true);
    await runtime().DB
      .prepare(
        `UPDATE activities SET archived_at = CURRENT_TIMESTAMP,
         updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(user.id, id)
      .run();
    await recordAudit(user, "activity", id, "archive", before, "");
    await recordEvent({
      customerId: Number(before.customer_id),
      user,
      eventType: "activity_archived",
      title: "فعالیت بایگانی شد",
      summary: cleanText(before.title, 300),
      entityType: "activity",
      entityId: id,
      managerPrivate: Number(before.is_manager_private) === 1,
    });
    await syncCustomerNextAction(Number(before.customer_id));
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

function activityLabel(type: string) {
  const labels: Record<string, string> = {
    call: "تماس تلفنی",
    meeting_in_person: "جلسه حضوری",
    meeting_online: "جلسه آنلاین",
    email: "ایمیل",
    letter: "نامه",
    message: "پیام",
    technical_proposal: "ارسال پیشنهاد فنی",
    financial_proposal: "ارسال پیشنهاد فنی‌مالی",
    demo: "ارائه یا دمو",
    follow_up: "پیگیری",
    note: "یادداشت",
  };
  return labels[type] ?? "فعالیت";
}

function cleanNameArray(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => cleanText(item, 200)).filter(Boolean))]
    : [];
}

function safeNameArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function createNextActivity(args: {
  customerId: number;
  opportunityId: number | null;
  title: string;
  startsAt: string;
  assigneeUserId: number;
  contactIds: number[];
  freeContactNames: string[];
  user: AppUser;
}) {
  const result = await runtime().DB
    .prepare(
      `INSERT INTO activities (
        customer_id, opportunity_id, title, type, direction, status,
        starts_at, duration_minutes, description, result, next_action,
        next_action_at, free_contact_names, assignee_user_id, is_manager_private,
        created_by, updated_by, completed_at
      ) VALUES (?, ?, ?, 'follow_up', 'outbound', 'planned', ?, 0, ?, '', '', NULL, ?, ?, 0, ?, ?, NULL)`,
    )
    .bind(
      args.customerId,
      args.opportunityId,
      args.title,
      args.startsAt,
      `اقدام بعدی: ${args.title}`,
      JSON.stringify(args.freeContactNames),
      args.assigneeUserId,
      args.user.id,
      args.user.id,
    )
    .run();
  const id = Number(result.meta.last_row_id);
  for (const contactId of args.contactIds) {
    await runtime().DB
      .prepare(
        `INSERT OR IGNORE INTO activity_contacts (activity_id, contact_id)
         SELECT ?, id FROM contacts
         WHERE id = ? AND customer_id = ? AND archived_at IS NULL`,
      )
      .bind(id, contactId, args.customerId)
      .run();
  }
  await recordAudit(args.user, "activity", id, "create_follow_up", "", {
    title: args.title,
    startsAt: args.startsAt,
    assigneeUserId: args.assigneeUserId,
  });
  await recordEvent({
    customerId: args.customerId,
    user: args.user,
    eventType: "activity_planned",
    title: "اقدام بعدی برنامه‌ریزی شد",
    summary: `${args.title} — ${args.startsAt}`,
    entityType: "activity",
    entityId: id,
  });
  await createActivityNotification({
    userId: args.assigneeUserId,
    customerId: args.customerId,
    activityId: id,
    kind: "assignment",
    title: "اقدام جدید به شما واگذار شد",
    body: `${args.title} — ${args.startsAt}`,
    dedupeKey: `activity:${id}:assignment:${args.assigneeUserId}`,
  });
  return id;
}
