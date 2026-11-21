import { createDocumentRecord, MAX_FILE_SIZE, normalizeDocumentMetadata, parseCustomerIds } from "@/lib/documents";
import { ApiError, cleanMultiline, cleanText, isManager, jsonError, recordAudit, requiredInt, requireApiUser, requireCustomerAccess, runtime } from "@/lib/server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const manager = isManager(user) ? 1 : 0;
    const requestedScope = new URL(request.url).searchParams.get("scope");
    const scope = requestedScope === "archived" ? "archived" : requestedScope === "public" ? "public" : requestedScope === "customer" ? "customer" : "active";
    if (scope === "archived" && !manager) throw new ApiError(403, "مدیریت آرشیو اسناد فقط برای مدیران در دسترس است.");
    const statusWhere = scope === "archived"
      ? "d.archived_at IS NOT NULL AND d.status = 'archived'"
      : scope === "public"
        ? "d.archived_at IS NULL AND d.visibility = 'public'"
        : scope === "customer"
          ? "d.archived_at IS NULL AND d.visibility = 'customer'"
          : "d.archived_at IS NULL";
    const rows = await runtime().DB.prepare(
      `SELECT d.id, d.title, d.document_type AS documentType, d.version,
              d.document_date AS documentDate, d.reference_number AS referenceNumber,
              d.description, d.visibility, d.file_name AS fileName, d.content_type AS contentType,
              d.size, d.created_at AS createdAt,
              uploader.full_name AS uploadedByName, uploader.email AS uploadedByEmail,
              COUNT(CASE WHEN (? = 1 OR linked_customer.visibility = 'public'
                OR linked_customer.owner_user_id = ? OR EXISTS(
                  SELECT 1 FROM customer_watchers visible_cw
                  WHERE visible_cw.customer_id = linked_customer.id AND visible_cw.user_id = ?
                )) THEN dl.id END) AS linkCount,
              COALESCE(GROUP_CONCAT(CASE WHEN (? = 1 OR linked_customer.visibility = 'public'
                OR linked_customer.owner_user_id = ? OR EXISTS(
                  SELECT 1 FROM customer_watchers visible_cw
                  WHERE visible_cw.customer_id = linked_customer.id AND visible_cw.user_id = ?
                )) THEN dl.entity_type || '§' || dl.entity_id || '§' ||
                  CASE dl.entity_type WHEN 'customer' THEN c.name WHEN 'activity' THEN a.title ELSE o.title END
                END, '¦'), '') AS linkRefs
              , COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN (? = 1 OR linked_customer.visibility = 'public'
                OR linked_customer.owner_user_id = ? OR EXISTS(
                  SELECT 1 FROM customer_watchers visible_cw
                  WHERE visible_cw.customer_id = linked_customer.id AND visible_cw.user_id = ?
                )) THEN dl.customer_id END), '') AS linkedCustomerIds
       FROM documents d
       LEFT JOIN users uploader ON uploader.id = d.uploaded_by
       LEFT JOIN document_links dl ON dl.document_id = d.id
       LEFT JOIN customers linked_customer ON linked_customer.id = dl.customer_id
       LEFT JOIN customers c ON dl.entity_type = 'customer' AND c.id = dl.entity_id
       LEFT JOIN activities a ON dl.entity_type = 'activity' AND a.id = dl.entity_id
       LEFT JOIN opportunities o ON dl.entity_type = 'opportunity' AND o.id = dl.entity_id
       WHERE ${statusWhere} AND (? = 1 OR d.visibility = 'public' OR d.uploaded_by = ? OR EXISTS (
         SELECT 1 FROM document_links x JOIN customers xc ON xc.id = x.customer_id
         WHERE x.document_id = d.id AND (xc.visibility = 'public' OR xc.owner_user_id = ?
           OR EXISTS(SELECT 1 FROM customer_watchers cw WHERE cw.customer_id = xc.id AND cw.user_id = ?))))
       GROUP BY d.id ORDER BY d.created_at DESC`,
    ).bind(
      manager, user.id, user.id,
      manager, user.id, user.id,
      manager, user.id, user.id,
      manager, user.id, user.id, user.id,
    ).all();
    const storage = manager
      ? await runtime().DB.prepare(
          "SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS count FROM documents WHERE status != 'deleted'"
        ).first<{ bytes: number; count: number }>()
      : null;
    return Response.json({ documents: rows.results, storageBytes: Number(storage?.bytes || 0), storedDocuments: Number(storage?.count || 0) });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "فایل انتخاب نشده است.");
    if (file.size > MAX_FILE_SIZE) throw new ApiError(400, "حداکثر اندازه فایل ۲۵ مگابایت است.");
    const customerIds = parseCustomerIds(form.get("customerIds"));
    for (const customerId of customerIds) await requireCustomerAccess(customerId, user, true);
    const objectKey = `documents/${Date.now()}-${crypto.randomUUID()}`;
    const metadata = normalizeDocumentMetadata({
      customerIds,
      title: form.get("title"),
      documentType: form.get("documentType"),
      visibility: form.get("visibility"),
      version: form.get("version"),
      documentDate: form.get("documentDate"),
      referenceNumber: form.get("referenceNumber"),
      description: form.get("description"),
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    });
    // R2 requires a body with a known length. FormData File streams do not
    // consistently retain that metadata in the Worker runtime.
    await runtime().BUCKET.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { originalName: file.name.slice(0, 500), uploadedBy: String(user.id) } });
    const id = await createDocumentRecord(metadata, objectKey, user);
    return Response.json({ id }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser();
    const body = await request.json() as Record<string, unknown>;
    const documentId = requiredInt(body.documentId, "سند");
    if (body.action === "archive") {
      if (!isManager(user)) throw new ApiError(403, "بایگانی سند فقط توسط مدیران انجام می‌شود.");
      const before = await runtime().DB.prepare("SELECT * FROM documents WHERE id = ? AND archived_at IS NULL").bind(documentId).first();
      if (!before) throw new ApiError(404, "سند پیدا نشد.");
      await runtime().DB.prepare("UPDATE documents SET archived_at = CURRENT_TIMESTAMP, status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(documentId).run();
      await recordAudit(user, "document", documentId, "archive", before, "");
      return Response.json({ ok: true });
    }
    if (body.action === "restore") {
      if (!isManager(user)) throw new ApiError(403, "بازگردانی سند از آرشیو فقط توسط مدیران انجام می‌شود.");
      const before = await runtime().DB.prepare("SELECT * FROM documents WHERE id = ? AND archived_at IS NOT NULL AND status = 'archived'").bind(documentId).first();
      if (!before) throw new ApiError(404, "سند بایگانی‌شده پیدا نشد.");
      await runtime().DB.prepare("UPDATE documents SET archived_at = NULL, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(documentId).run();
      await recordAudit(user, "document", documentId, "restore", before, "");
      return Response.json({ ok: true });
    }
    if (body.action === "update") {
      if (user.role === "viewer") throw new ApiError(403, "حساب مشاهده‌گر امکان ویرایش اطلاعات را ندارد.");
      const before = await runtime().DB.prepare("SELECT * FROM documents WHERE id = ? AND archived_at IS NULL AND status = 'active'").bind(documentId).first<Record<string, unknown>>();
      if (!before) throw new ApiError(404, "سند فعال پیدا نشد.");
      const visibility = body.visibility === "customer" ? "customer" : "public";
      if (visibility === "customer") {
        const linked = await runtime().DB.prepare("SELECT 1 AS ok FROM document_links WHERE document_id = ? AND customer_id IS NOT NULL LIMIT 1").bind(documentId).first();
        if (!linked) throw new ApiError(400, "برای اختصاصی‌کردن سند، ابتدا آن را به یک مشتری، فعالیت یا فرصت مشتری متصل کنید.");
      }
      const title = cleanText(body.title, 300);
      if (!title) throw new ApiError(400, "عنوان سند الزامی است.");
      const documentType = cleanText(body.documentType, 100) || "other";
      const version = cleanText(body.version, 50) || "1";
      const documentDate = cleanText(body.documentDate, 60) || null;
      const referenceNumber = cleanText(body.referenceNumber, 100);
      const description = cleanMultiline(body.description, 3000);
      await runtime().DB.prepare(`UPDATE documents SET title = ?, document_type = ?, version = ?, document_date = ?, visibility = ?, reference_number = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(title, documentType, version, documentDate, visibility, referenceNumber, description, documentId).run();
      await recordAudit(user, "document", documentId, "update", before, { title, documentType, version, documentDate, visibility, referenceNumber, description });
      return Response.json({ ok: true });
    }
    const entityType = String(body.entityType || "");
    const entityId = requiredInt(body.entityId, "عنصر مرتبط");
    let customerId = entityId;
    if (entityType === "activity") { const row = await runtime().DB.prepare("SELECT customer_id AS customerId FROM activities WHERE id = ?").bind(entityId).first<{customerId:number}>(); if (!row) throw new ApiError(404, "فعالیت پیدا نشد."); customerId = row.customerId; }
    else if (entityType === "opportunity") { const row = await runtime().DB.prepare("SELECT customer_id AS customerId FROM opportunities WHERE id = ?").bind(entityId).first<{customerId:number}>(); if (!row) throw new ApiError(404, "فرصت پیدا نشد."); customerId = row.customerId; }
    else if (entityType !== "customer") throw new ApiError(400, "نوع اتصال نامعتبر است.");
    await requireCustomerAccess(customerId, user, true);
    const document = await runtime().DB.prepare("SELECT visibility FROM documents WHERE id = ? AND archived_at IS NULL").bind(documentId).first<{ visibility: string }>();
    if (!document) throw new ApiError(404, "سند پیدا نشد.");
    if (document.visibility === "customer") {
      const permitted = await runtime().DB.prepare("SELECT 1 AS ok FROM document_links WHERE document_id = ? AND customer_id = ? LIMIT 1").bind(documentId, customerId).first();
      if (!permitted) throw new ApiError(409, "این سند اختصاصی متعلق به مشتری دیگری است.");
    }
    await runtime().DB.prepare("INSERT OR IGNORE INTO document_links (document_id, entity_type, entity_id, customer_id, created_by) VALUES (?, ?, ?, ?, ?)").bind(documentId, entityType, entityId, customerId, user.id).run();
    return Response.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser();
    if (!isManager(user)) throw new ApiError(403, "حذف دائمی سند فقط توسط مدیران انجام می‌شود.");
    const body = await request.json() as Record<string, unknown>;
    const id = requiredInt(body.id, "سند");
    const doc = await runtime().DB.prepare("SELECT object_key AS objectKey, archived_at AS archivedAt, status FROM documents WHERE id = ? AND status != 'deleted'").bind(id).first<{objectKey:string;archivedAt:string|null;status:string}>();
    if (!doc) throw new ApiError(404, "سند پیدا نشد.");
    if (!doc.archivedAt) {
      const count = await runtime().DB.prepare("SELECT COUNT(*) AS count FROM document_links WHERE document_id = ?").bind(id).first<{count:number}>();
      if (Number(count?.count) > 0) throw new ApiError(409, "برای حذف سند فعال، ابتدا همه اتصال‌های آن را حذف کنید یا سند را بایگانی کنید.");
    }
    const object = await runtime().BUCKET.head(doc.objectKey);
    if (object?.customMetadata?.chunked === "1") {
      const chunkCount = Number(object.customMetadata.chunkCount) || 0;
      const keys = [doc.objectKey];
      for (let index = 0; index < chunkCount; index += 1) keys.push(`${doc.objectKey}.part.${String(index).padStart(3, "0")}`);
      await runtime().BUCKET.delete(keys);
    } else {
      await runtime().BUCKET.delete(doc.objectKey);
    }
    await runtime().DB.prepare("UPDATE documents SET archived_at = CURRENT_TIMESTAMP, status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
    await recordAudit(user, "document", id, doc.archivedAt ? "delete_archived" : "delete_unlinked", doc, "");
    return Response.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
