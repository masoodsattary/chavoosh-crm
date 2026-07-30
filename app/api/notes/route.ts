import {
  ApiError,
  cleanMultiline,
  isManager,
  jsonError,
  recordAudit,
  recordEvent,
  requiredInt,
  requireApiUser,
  requireCustomerAccess,
  runtime,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    if (!isManager(user)) throw new ApiError(403, "این بخش فقط برای مدیران است.");
    const body = (await request.json()) as Record<string, unknown>;
    const customerId = requiredInt(body.customerId, "مشتری");
    await requireCustomerAccess(customerId, user, true);
    const note = cleanMultiline(body.body, 12000);
    if (!note) throw new ApiError(400, "متن یادداشت الزامی است.");
    const relations = [
      ["contacts", Number(body.contactId) || null, "فرد"],
      ["opportunities", Number(body.opportunityId) || null, "فرصت"],
      ["activities", Number(body.activityId) || null, "فعالیت"],
    ] as const;
    for (const [table, id, label] of relations) {
      if (!id) continue;
      const related = await runtime().DB
        .prepare(`SELECT 1 AS found FROM ${table} WHERE id = ? AND customer_id = ? AND archived_at IS NULL`)
        .bind(id, customerId)
        .first();
      if (!related) throw new ApiError(400, `${label} انتخاب‌شده متعلق به این مشتری نیست.`);
    }
    const result = await runtime().DB
      .prepare(
        `INSERT INTO manager_notes
         (customer_id, contact_id, opportunity_id, activity_id, body, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        customerId,
        Number(body.contactId) || null,
        Number(body.opportunityId) || null,
        Number(body.activityId) || null,
        note,
        user.id,
      )
      .run();
    const id = Number(result.meta.last_row_id);
    await recordAudit(user, "manager_note", id, "create", "", body);
    await recordEvent({
      customerId,
      user,
      eventType: "manager_note",
      title: "یادداشت خصوصی مدیر ثبت شد",
      summary: note,
      entityType: "manager_note",
      entityId: id,
      managerPrivate: true,
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser();
    if (!isManager(user)) throw new ApiError(403, "این بخش فقط برای مدیران است.");
    const body = (await request.json()) as Record<string, unknown>;
    const id = requiredInt(body.id, "یادداشت");
    const before = await runtime().DB
      .prepare("SELECT * FROM manager_notes WHERE id = ? AND archived_at IS NULL")
      .bind(id)
      .first<Record<string, unknown>>();
    if (!before) throw new ApiError(404, "یادداشت پیدا نشد.");
    await requireCustomerAccess(Number(before.customer_id), user, true);
    const note = cleanMultiline(body.body, 12000);
    if (!note) throw new ApiError(400, "متن یادداشت الزامی است.");
    await runtime().DB
      .prepare("UPDATE manager_notes SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(note, id)
      .run();
    await recordAudit(user, "manager_note", id, "update", before, { body: note });
    await recordEvent({
      customerId: Number(before.customer_id),
      user,
      eventType: "manager_note_updated",
      title: "یادداشت خصوصی مدیر ویرایش شد",
      summary: note,
      entityType: "manager_note",
      entityId: id,
      managerPrivate: true,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser();
    if (!isManager(user)) throw new ApiError(403, "این بخش فقط برای مدیران است.");
    const body = (await request.json()) as Record<string, unknown>;
    const id = requiredInt(body.id, "یادداشت");
    const before = await runtime().DB
      .prepare("SELECT * FROM manager_notes WHERE id = ? AND archived_at IS NULL")
      .bind(id)
      .first<Record<string, unknown>>();
    if (!before) throw new ApiError(404, "یادداشت پیدا نشد.");
    await requireCustomerAccess(Number(before.customer_id), user, true);
    await runtime().DB
      .prepare("UPDATE manager_notes SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(id)
      .run();
    await recordAudit(user, "manager_note", id, "archive", before, "");
    await recordEvent({
      customerId: Number(before.customer_id),
      user,
      eventType: "manager_note_archived",
      title: "یادداشت خصوصی مدیر بایگانی شد",
      summary: cleanMultiline(before.body, 1000),
      entityType: "manager_note",
      entityId: id,
      managerPrivate: true,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
