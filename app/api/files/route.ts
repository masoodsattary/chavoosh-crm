import {
  ApiError,
  cleanMultiline,
  cleanText,
  jsonError,
  optionalInt,
  recordAudit,
  recordEvent,
  requiredInt,
  requireApiUser,
  requireCustomerAccess,
  runtime,
} from "@/lib/server";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "فایل انتخاب نشده است.");
    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError(400, "حداکثر اندازه فایل ۲۵ مگابایت است.");
    }
    const customerId = requiredInt(form.get("customerId"), "مشتری");
    await requireCustomerAccess(customerId, user, true);
    const activityId = optionalInt(form.get("activityId"));
    const opportunityId = optionalInt(form.get("opportunityId"));
    if (activityId) {
      const activity = await runtime().DB
        .prepare("SELECT 1 AS found FROM activities WHERE id = ? AND customer_id = ? AND archived_at IS NULL")
        .bind(activityId, customerId)
        .first();
      if (!activity) throw new ApiError(400, "فعالیت انتخاب‌شده متعلق به این مشتری نیست.");
    }
    if (opportunityId) {
      const opportunity = await runtime().DB
        .prepare("SELECT 1 AS found FROM opportunities WHERE id = ? AND customer_id = ? AND archived_at IS NULL")
        .bind(opportunityId, customerId)
        .first();
      if (!opportunity) throw new ApiError(400, "فرصت انتخاب‌شده متعلق به این مشتری نیست.");
    }
    const objectKey = `customers/${customerId}/${Date.now()}-${crypto.randomUUID()}`;
    await runtime().BUCKET.put(objectKey, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: {
        originalName: file.name.slice(0, 500),
        uploadedBy: String(user.id),
      },
    });
    const title = cleanText(form.get("title"), 300) || file.name;
    const result = await runtime().DB
      .prepare(
        `INSERT INTO documents (
          customer_id, activity_id, opportunity_id, title, document_type,
          version, document_date, reference_number, description, file_name,
          object_key, content_type, size, uploaded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        customerId,
        activityId,
        opportunityId,
        title,
        cleanText(form.get("documentType"), 100) || "other",
        cleanText(form.get("version"), 50) || "1",
        cleanText(form.get("documentDate"), 60) || null,
        cleanText(form.get("referenceNumber"), 100),
        cleanMultiline(form.get("description"), 3000),
        file.name.slice(0, 500),
        objectKey,
        file.type || "application/octet-stream",
        file.size,
        user.id,
      )
      .run();
    const id = Number(result.meta.last_row_id);
    await recordAudit(user, "document", id, "upload", "", {
      title,
      fileName: file.name,
      size: file.size,
    });
    await recordEvent({
      customerId,
      user,
      eventType: "document_uploaded",
      title: "سند جدید بارگذاری شد",
      summary: `${title} — ${file.name}`,
      entityType: "document",
      entityId: id,
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown>;
    const id = requiredInt(body.id, "سند");
    const doc = await runtime().DB
      .prepare("SELECT * FROM documents WHERE id = ? AND archived_at IS NULL")
      .bind(id)
      .first<Record<string, unknown>>();
    if (!doc) throw new ApiError(404, "سند پیدا نشد.");
    await requireCustomerAccess(Number(doc.customer_id), user, true);
    await runtime().DB
      .prepare(
        `UPDATE documents SET archived_at = CURRENT_TIMESTAMP,
         status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(id)
      .run();
    await recordAudit(user, "document", id, "archive", doc, "");
    await recordEvent({
      customerId: Number(doc.customer_id),
      user,
      eventType: "document_archived",
      title: "سند بایگانی شد",
      summary: cleanText(doc.title, 300),
      entityType: "document",
      entityId: id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
