import {
  ApiError,
  cleanMultiline,
  cleanText,
  recordAudit,
  recordEvent,
  requireCustomerAccess,
  runtime,
  type AppUser,
} from "./server";

export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const DOCUMENT_CHUNK_SIZE = 512 * 1024;

export type DocumentMetadata = {
  customerIds: number[];
  visibility: "public" | "customer";
  title: string;
  documentType: string;
  version: string;
  documentDate: string | null;
  referenceNumber: string;
  description: string;
  fileName: string;
  contentType: string;
  size: number;
};

export function parseCustomerIds(value: unknown) {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return [
    ...new Set(
      parsed
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

export function normalizeDocumentMetadata(value: Record<string, unknown>) {
  const size = Number(value.size);
  const fileName = cleanText(value.fileName, 500);
  if (!fileName) throw new ApiError(400, "نام فایل مشخص نیست.");
  if (!Number.isInteger(size) || size <= 0) {
    throw new ApiError(400, "فایل خالی یا نامعتبر است.");
  }
  if (size > MAX_FILE_SIZE) {
    throw new ApiError(400, "حداکثر اندازه فایل ۲۵ مگابایت است.");
  }
  const customerIds = parseCustomerIds(value.customerIds);
  const visibility = value.visibility === "customer" || (value.visibility == null && customerIds.length > 0)
    ? "customer"
    : "public";
  if (visibility === "customer" && customerIds.length === 0) {
    throw new ApiError(400, "برای سند اختصاصی حداقل یک مشتری را انتخاب کنید.");
  }
  return {
    customerIds,
    visibility,
    title: cleanText(value.title, 300) || fileName,
    documentType: cleanText(value.documentType, 100) || "other",
    version: cleanText(value.version, 50) || "1",
    documentDate: cleanText(value.documentDate, 60) || null,
    referenceNumber: cleanText(value.referenceNumber, 100),
    description: cleanMultiline(value.description, 3000),
    fileName,
    contentType:
      cleanText(value.contentType, 200) || "application/octet-stream",
    size,
  } satisfies DocumentMetadata;
}

export async function createDocumentRecord(
  metadata: DocumentMetadata,
  objectKey: string,
  user: AppUser,
) {
  for (const customerId of metadata.customerIds) {
    await requireCustomerAccess(customerId, user, true);
  }
  const result = await runtime()
    .DB.prepare(
      `INSERT INTO documents
       (customer_id, title, document_type, version, document_date, visibility,
        reference_number, description, file_name, object_key, content_type,
        size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      metadata.customerIds[0] ?? null,
      metadata.title,
      metadata.documentType,
      metadata.version,
      metadata.documentDate,
      metadata.visibility,
      metadata.referenceNumber,
      metadata.description,
      metadata.fileName,
      objectKey,
      metadata.contentType,
      metadata.size,
      user.id,
    )
    .run();
  const id = Number(result.meta.last_row_id);
  for (const customerId of metadata.customerIds) {
    await runtime()
      .DB.prepare(
        "INSERT OR IGNORE INTO document_links (document_id, entity_type, entity_id, customer_id, created_by) VALUES (?, 'customer', ?, ?, ?)",
      )
      .bind(id, customerId, customerId, user.id)
      .run();
  }
  await recordAudit(user, "document", id, "upload", "", {
    title: metadata.title,
    customerIds: metadata.customerIds,
    visibility: metadata.visibility,
  });
  for (const customerId of metadata.customerIds) {
    await recordEvent({
      customerId,
      user,
      eventType: "document_linked",
      title: "سند به پرونده متصل شد",
      summary: metadata.title,
      entityType: "document",
      entityId: id,
    });
  }
  return id;
}
