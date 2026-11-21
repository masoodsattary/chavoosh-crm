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
    const nextActionAssigneeUserId =
      optionalInt(body.nextActionAssigneeUserId) ?? assigneeUserId;
    if (status === "completed" && Boolean(nextAction) !== Boolean(nextActionAt)) {
      throw new ApiError(400, "برای اقدام بعدی، عنوان و موعد را با هم وارد کنید.");
    }
    const contactIds = Array.isArray(body.contactIds)
      ? [...new Set(body.contactIds.map(optionalInt).filter(Boolean) as number[])]
      : [];
    const nextActivityArgs =
      status === "completed" && nextAction && nextActionAt
        ? {
            sourceActivityId: 0,
            customerId,
            opportunityId: optionalInt(body.opportunityId),
            title: nextAction,
            startsAt: nextActionAt,
            assigneeUserId: nextActionAssigneeUserId,
            contactIds,
            freeContactNames: cleanNameArray(body.freeContactNames),
            user,
          }
        : null;
    const db = runtime().DB;
    const mainInsert = db
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
      );
    const insertResults = await db.batch(
      nextActivityArgs
        ? [mainInsert, prepareNextActivityInsert(nextActivityArgs, true)]
        : [mainInsert],
    );
    const id = Number(insertResults[0].meta.last_row_id);
    const nextActivityId = nextActivityArgs
      ? Number(insertResults[1].meta.last_row_id)
      : null;
    await syncDocumentLinks(id, customerId, body.documentIds, user.id);

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
    if (nextActivityArgs && nextActivityId) {
      await finishNextActivity(
        { ...nextActivityArgs, sourceActivityId: id },
        nextActivityId,
      );
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
    const linkedNext = await runtime().DB
      .prepare(
        `SELECT * FROM activities
         WHERE source_activity_id = ? AND archived_at IS NULL`,
      )
      .bind(id)
      .first<Record<string, unknown>>();
    const nextActionAssigneeUserId =
      optionalInt(body.nextActionAssigneeUserId) ??
      optionalInt(linkedNext?.assignee_user_id) ??
      assigneeUserId;
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
    if (status === "completed" && Boolean(nextAction) !== Boolean(nextActionAt)) {
      throw new ApiError(400, "برای اقدام بعدی، عنوان و موعد را با هم وارد کنید.");
    }
    if (status === "completed" && linkedNext && (!nextAction || !nextActionAt)) {
      throw new ApiError(
        409,
        "اقدام بعدیِ مرتبط از قبل ساخته شده است؛ آن را از رکورد خودش لغو یا ویرایش کنید.",
      );
    }
    if (
      linkedNext &&
      linkedNext.status !== "planned" &&
      (nextAction !== cleanText(linkedNext.title, 1000) ||
        nextActionAt !== (cleanText(linkedNext.starts_at, 60) || null) ||
        nextActionAssigneeUserId !== Number(linkedNext.assignee_user_id))
    ) {
      throw new ApiError(
        409,
        "اقدام بعدی انجام یا لغو شده و برای حفظ سابقه دیگر از فعالیت مبدأ قابل تغییر نیست.",
      );
    }
    const pendingNextArgs =
      status === "completed" && nextAction && nextActionAt && !linkedNext
        ? {
            sourceActivityId: id,
            customerId,
            opportunityId: optionalInt(
              body.opportunityId ?? before.opportunity_id,
            ),
            title: nextAction,
            startsAt: nextActionAt,
            assigneeUserId: nextActionAssigneeUserId,
            contactIds: [] as number[],
            freeContactNames: cleanNameArray(
              body.freeContactNames ?? safeNameArray(before.free_contact_names),
            ),
            user,
          }
        : null;
    const updateStatement = runtime().DB
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
      );
    let nextActivityId: number | null = null;
    if (pendingNextArgs) {
      const writeResults = await runtime().DB.batch([
        updateStatement,
        prepareNextActivityInsert(pendingNextArgs),
      ]);
      nextActivityId = Number(writeResults[1].meta.last_row_id);
    } else {
      await updateStatement.run();
    }
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
    if (Array.isArray(body.documentIds)) {
      await runtime().DB.prepare("DELETE FROM document_links WHERE entity_type = 'activity' AND entity_id = ?").bind(id).run();
      await syncDocumentLinks(id, customerId, body.documentIds, user.id);
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
    if (pendingNextArgs && nextActivityId) {
      await finishNextActivity(
        {
          ...pendingNextArgs,
          contactIds: contactIds.results.map((item: { contactId: number }) =>
            item.contactId,
          ),
        },
        nextActivityId,
      );
    } else if (linkedNext && linkedNext.status === "planned" && nextAction && nextActionAt) {
      await runtime().DB
        .prepare(
          `UPDATE activities SET title = ?, starts_at = ?, description = ?,
             assignee_user_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'planned' AND archived_at IS NULL`,
        )
        .bind(
          nextAction,
          nextActionAt,
          `اقدام بعدی: ${nextAction}`,
          nextActionAssigneeUserId,
          user.id,
          Number(linkedNext.id),
        )
        .run();
      nextActivityId = Number(linkedNext.id);
      if (nextActionAssigneeUserId !== Number(linkedNext.assignee_user_id)) {
        await createActivityNotification({
          userId: nextActionAssigneeUserId,
          customerId,
          activityId: Number(linkedNext.id),
          kind: "assignment",
          title: "اقدام به شما واگذار شد",
          body: `${nextAction} — ${nextActionAt}`,
          dedupeKey: `activity:${linkedNext.id}:assignment:${nextActionAssigneeUserId}`,
        });
      }
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

async function syncDocumentLinks(activityId: number, customerId: number, raw: unknown, actorId: number) {
  if (!Array.isArray(raw)) return;
  for (const value of [...new Set(raw.map(optionalInt).filter(Boolean) as number[])]) {
    await runtime().DB.prepare(`INSERT OR IGNORE INTO document_links (document_id, entity_type, entity_id, customer_id, created_by)
      SELECT d.id, 'activity', ?, ?, ? FROM documents d
      WHERE d.id = ? AND d.archived_at IS NULL AND (
        d.visibility = 'public' OR EXISTS (
          SELECT 1 FROM document_links dl WHERE dl.document_id = d.id AND dl.customer_id = ?
        )
      )`).bind(activityId, customerId, actorId, value, customerId).run();
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

function prepareNextActivityInsert(
  args: {
    sourceActivityId: number;
    customerId: number;
    opportunityId: number | null;
    title: string;
    startsAt: string;
    assigneeUserId: number;
    contactIds: number[];
    freeContactNames: string[];
    user: AppUser;
  },
  sourceFromPreviousInsert = false,
) {
  const sourceValue = sourceFromPreviousInsert ? "last_insert_rowid()" : "?";
  const values: Array<string | number | null> = [
    args.customerId,
    args.opportunityId,
  ];
  if (!sourceFromPreviousInsert) values.push(args.sourceActivityId);
  values.push(
    args.title,
    args.startsAt,
    `اقدام بعدی: ${args.title}`,
    JSON.stringify(args.freeContactNames),
    args.assigneeUserId,
    args.user.id,
    args.user.id,
  );
  return runtime().DB
    .prepare(
      `INSERT INTO activities (
        customer_id, opportunity_id, source_activity_id, title, type, direction, status,
        starts_at, duration_minutes, description, result, next_action,
        next_action_at, free_contact_names, assignee_user_id, is_manager_private,
        created_by, updated_by, completed_at
      ) VALUES (?, ?, ${sourceValue}, ?, 'follow_up', 'outbound', 'planned', ?, 0, ?, '', '', NULL, ?, ?, 0, ?, ?, NULL)`,
    )
    .bind(...values);
}

async function finishNextActivity(
  args: {
    sourceActivityId: number;
    customerId: number;
    opportunityId: number | null;
    title: string;
    startsAt: string;
    assigneeUserId: number;
    contactIds: number[];
    freeContactNames: string[];
    user: AppUser;
  },
  id: number,
) {
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
    sourceActivityId: args.sourceActivityId,
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
}
