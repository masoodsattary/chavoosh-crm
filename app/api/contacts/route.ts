import {
  ApiError,
  cleanMultiline,
  cleanText,
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
    const body = (await request.json()) as Record<string, unknown>;
    const customerId = requiredInt(body.customerId, "مشتری");
    await requireCustomerAccess(customerId, user, true);
    const firstName = cleanText(body.firstName, 100);
    const lastName = cleanText(body.lastName, 150);
    if (!firstName && !lastName) throw new ApiError(400, "نام فرد الزامی است.");
    const email = cleanText(body.email, 200).toLowerCase();
    const mobile = cleanText(body.mobile, 50);
    const duplicate = await runtime().DB
      .prepare(
        `SELECT id, first_name AS firstName, last_name AS lastName
         FROM contacts WHERE customer_id = ? AND archived_at IS NULL
           AND ((? != '' AND lower(email) = lower(?))
             OR (? != '' AND mobile = ?)) LIMIT 1`,
      )
      .bind(customerId, email, email, mobile, mobile)
      .first();
    if (duplicate && body.confirmDuplicate !== true) {
      return Response.json(
        { duplicate, error: "احتمال تکراری‌بودن فرد وجود دارد." },
        { status: 409 },
      );
    }
    const result = await runtime().DB
      .prepare(
        `INSERT INTO contacts (
          customer_id, first_name, last_name, prefix, job_title, department,
          decision_roles, direct_phone, extension, mobile, email,
          secondary_email, fax, address, preferred_contact, notes, status,
          created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        customerId,
        firstName,
        lastName,
        cleanText(body.prefix, 50),
        cleanText(body.jobTitle, 200),
        cleanText(body.department, 150),
        JSON.stringify(Array.isArray(body.decisionRoles) ? body.decisionRoles : []),
        cleanText(body.directPhone, 60),
        cleanText(body.extension, 30),
        mobile,
        email,
        cleanText(body.secondaryEmail, 200).toLowerCase(),
        cleanText(body.fax, 60),
        cleanMultiline(body.address, 1000),
        cleanText(body.preferredContact, 50),
        cleanMultiline(body.notes, 5000),
        cleanText(body.status, 50) || "active",
        user.id,
        user.id,
      )
      .run();
    const id = Number(result.meta.last_row_id);
    await recordAudit(user, "contact", id, "create", "", body);
    await recordEvent({
      customerId,
      user,
      eventType: "contact_created",
      title: "فرد جدید اضافه شد",
      summary: `${firstName} ${lastName}${body.jobTitle ? ` — ${cleanText(body.jobTitle, 200)}` : ""}`,
      entityType: "contact",
      entityId: id,
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown>;
    const id = requiredInt(body.id, "شناسه فرد");
    const before = await runtime().DB
      .prepare("SELECT * FROM contacts WHERE id = ? AND archived_at IS NULL")
      .bind(id)
      .first<Record<string, unknown>>();
    if (!before) throw new ApiError(404, "فرد پیدا نشد.");
    const customerId = Number(before.customer_id);
    await requireCustomerAccess(customerId, user, true);
    await runtime().DB
      .prepare(
        `UPDATE contacts SET
          first_name = ?, last_name = ?, prefix = ?, job_title = ?,
          department = ?, decision_roles = ?, direct_phone = ?, extension = ?,
          mobile = ?, email = ?, secondary_email = ?, fax = ?, address = ?,
          preferred_contact = ?, notes = ?, status = ?, updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        cleanText(body.firstName ?? before.first_name, 100),
        cleanText(body.lastName ?? before.last_name, 150),
        cleanText(body.prefix ?? before.prefix, 50),
        cleanText(body.jobTitle ?? before.job_title, 200),
        cleanText(body.department ?? before.department, 150),
        Array.isArray(body.decisionRoles)
          ? JSON.stringify(body.decisionRoles)
          : String(before.decision_roles),
        cleanText(body.directPhone ?? before.direct_phone, 60),
        cleanText(body.extension ?? before.extension, 30),
        cleanText(body.mobile ?? before.mobile, 50),
        cleanText(body.email ?? before.email, 200).toLowerCase(),
        cleanText(body.secondaryEmail ?? before.secondary_email, 200).toLowerCase(),
        cleanText(body.fax ?? before.fax, 60),
        cleanMultiline(body.address ?? before.address, 1000),
        cleanText(body.preferredContact ?? before.preferred_contact, 50),
        cleanMultiline(body.notes ?? before.notes, 5000),
        cleanText(body.status ?? before.status, 50),
        user.id,
        id,
      )
      .run();
    await recordAudit(user, "contact", id, "update", before, body);
    await recordEvent({
      customerId,
      user,
      eventType: "contact_updated",
      title: "اطلاعات فرد به‌روزرسانی شد",
      summary: `${cleanText(body.firstName ?? before.first_name)} ${cleanText(body.lastName ?? before.last_name)}`,
      entityType: "contact",
      entityId: id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown>;
    const id = requiredInt(body.id, "شناسه فرد");
    const before = await runtime().DB
      .prepare("SELECT * FROM contacts WHERE id = ? AND archived_at IS NULL")
      .bind(id)
      .first<Record<string, unknown>>();
    if (!before) throw new ApiError(404, "فرد پیدا نشد.");
    await requireCustomerAccess(Number(before.customer_id), user, true);
    await runtime().DB
      .prepare(
        `UPDATE contacts SET archived_at = CURRENT_TIMESTAMP,
         updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(user.id, id)
      .run();
    await recordAudit(user, "contact", id, "archive", before, "");
    await recordEvent({
      customerId: Number(before.customer_id),
      user,
      eventType: "contact_archived",
      title: "فرد بایگانی شد",
      summary: `${cleanText(before.first_name, 100)} ${cleanText(before.last_name, 150)}`.trim(),
      entityType: "contact",
      entityId: id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
