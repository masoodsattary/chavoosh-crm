import {
  ApiError,
  cleanMultiline,
  cleanText,
  jsonError,
  optionalInt,
  recordAudit,
  recordEvent,
  resolveTagIds,
  requireApiUser,
  runtime,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    if (user.role === "viewer") throw new ApiError(403, "امکان ثبت مشتری ندارید.");
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 300);
    if (!name) throw new ApiError(400, "نام مشتری الزامی است.");
    const ownerUserId = optionalInt(body.ownerUserId) ?? user.id;
    const visibility = body.visibility === "private" ? "private" : "public";

    const duplicate = await runtime().DB
      .prepare(
        `SELECT id, name FROM customers
         WHERE archived_at IS NULL AND (
           lower(name) = lower(?) OR
           (? != '' AND phone = ?) OR
           (? != '' AND lower(email) = lower(?))
         ) LIMIT 1`,
      )
      .bind(
        name,
        cleanText(body.phone, 80),
        cleanText(body.phone, 80),
        cleanText(body.email, 200),
        cleanText(body.email, 200),
      )
      .first<{ id: number; name: string }>();
    if (duplicate && body.confirmDuplicate !== true) {
      return Response.json(
        { duplicate, error: "احتمال تکراری‌بودن مشتری وجود دارد." },
        { status: 409 },
      );
    }

    const result = await runtime().DB
      .prepare(
        `INSERT INTO customers (
          name, short_name, english_name, organization_type, industry,
          relationship_status, importance, website, phone, other_phones,
          fax, email, secretariat_number, postal_code, province, city,
          address, description, source, visibility, owner_user_id,
          parent_customer_id, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        name,
        cleanText(body.shortName, 100),
        cleanText(body.englishName, 300),
        cleanText(body.organizationType, 100),
        cleanText(body.industry, 150),
        cleanText(body.relationshipStatus, 50) || "potential",
        cleanText(body.importance, 50) || "normal",
        cleanText(body.website, 300),
        cleanText(body.phone, 80),
        cleanText(body.otherPhones, 300),
        cleanText(body.fax, 80),
        cleanText(body.email, 200).toLowerCase(),
        cleanText(body.secretariatNumber, 100),
        cleanText(body.postalCode, 30),
        cleanText(body.province, 100),
        cleanText(body.city, 100),
        cleanMultiline(body.address, 1000),
        cleanMultiline(body.description, 5000),
        cleanText(body.source, 200),
        visibility,
        ownerUserId,
        optionalInt(body.parentCustomerId),
        user.id,
        user.id,
      )
      .run();
    const customerId = Number(result.meta.last_row_id);

    await syncCustomerRelations(customerId, body, user.id, ownerUserId);
    await recordAudit(user, "customer", customerId, "create", "", body);
    await recordEvent({
      customerId,
      user,
      eventType: "customer_created",
      title: "مشتری جدید ایجاد شد",
      summary: name,
      entityType: "customer",
      entityId: customerId,
    });

    return Response.json({ id: customerId }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

async function syncCustomerRelations(
  customerId: number,
  body: Record<string, unknown>,
  actorId: number,
  ownerUserId: number,
) {
  const db = runtime().DB;
  const watcherIds = Array.isArray(body.watcherIds)
    ? [...new Set(body.watcherIds.map(optionalInt).filter(Boolean) as number[])]
    : [];
  if (!watcherIds.includes(ownerUserId)) watcherIds.push(ownerUserId);
  const tagIds = await resolveTagIds(body.tagIds, body.newTagNames, actorId);
  for (const watcherId of watcherIds) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO customer_watchers
         (customer_id, user_id, added_by) VALUES (?, ?, ?)`,
      )
      .bind(customerId, watcherId, actorId)
      .run();
  }
  for (const tagId of tagIds) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?, ?)",
      )
      .bind(customerId, tagId)
      .run();
  }
}

export { syncCustomerRelations };
