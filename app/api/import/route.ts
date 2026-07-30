import {
  ApiError,
  cleanMultiline,
  cleanText,
  jsonError,
  recordAudit,
  requireApiUser,
  requireRole,
  runtime,
} from "@/lib/server";
import { workbookBackupTables } from "@/lib/workbook-backup";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    if (user.role === "viewer") throw new ApiError(403, "امکان ورود اطلاعات ندارید.");
    const body = (await request.json()) as {
      entityType?: string;
      fileName?: string;
      mode?: string;
      rows?: Array<Record<string, unknown>>;
      sheets?: Array<{ name?: string; rows?: Array<Record<string, unknown>> }>;
    };
    if (Array.isArray(body.sheets)) {
      requireRole(user, ["admin"]);
      return await importWorkbook(body, user);
    }
    const entityType = body.entityType === "contacts" ? "contacts" : "customers";
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
    if (!rows.length) throw new ApiError(400, "فایل فاقد ردیف قابل ورود است.");

    const results: Array<{ row: number; status: string; message: string }> = [];
    let inserted = 0;
    let updated = 0;
    let rejected = 0;
    for (let index = 0; index < rows.length; index += 1) {
      try {
        if (entityType === "customers") {
          const result = await importCustomer(rows[index], user.id, body.mode);
          if (result === "inserted") inserted += 1;
          else updated += 1;
          results.push({ row: index + 2, status: result, message: "" });
        } else {
          const result = await importContact(rows[index], user.id, body.mode);
          if (result === "inserted") inserted += 1;
          else updated += 1;
          results.push({ row: index + 2, status: result, message: "" });
        }
      } catch (error) {
        rejected++;
        results.push({
          row: index + 2,
          status: "rejected",
          message: error instanceof Error ? error.message : "خطای نامشخص",
        });
      }
    }

    const batch = await runtime().DB
      .prepare(
        `INSERT INTO import_batches (
          entity_type, file_name, total_rows, inserted_rows, updated_rows,
          rejected_rows, result_json, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        entityType,
        cleanText(body.fileName, 300) || "import.xlsx",
        rows.length,
        inserted,
        updated,
        rejected,
        JSON.stringify(results),
        user.id,
      )
      .run();
    await recordAudit(
      user,
      "import_batch",
      Number(batch.meta.last_row_id),
      "import",
      "",
      { entityType, inserted, updated, rejected },
    );
    return Response.json({
      batchId: Number(batch.meta.last_row_id),
      total: rows.length,
      inserted,
      updated,
      rejected,
      results,
    });
  } catch (error) {
    return jsonError(error);
  }
}

async function importWorkbook(
  body: {
    fileName?: string;
    mode?: string;
    sheets?: Array<{ name?: string; rows?: Array<Record<string, unknown>> }>;
  },
  user: Awaited<ReturnType<typeof requireApiUser>>,
) {
  const supplied = new Map(
    (body.sheets || [])
      .filter((sheet) => typeof sheet.name === "string" && Array.isArray(sheet.rows))
      .map((sheet) => [sheet.name as string, sheet.rows as Array<Record<string, unknown>>]),
  );
  const recognized = workbookBackupTables.filter((definition) => supplied.has(definition.sheet));
  if (!recognized.length) {
    throw new ApiError(
      400,
      "این فایل در قالب خروجی جامع چاووش CRM نیست یا شیت‌های پشتیبان آن حذف شده‌اند.",
    );
  }
  const workbookRowCount = recognized.reduce(
    (sum, definition) => sum + (supplied.get(definition.sheet)?.length || 0),
    0,
  );
  if (workbookRowCount > 10_000) {
    throw new ApiError(
      413,
      "این فایل بیش از ۱۰٬۰۰۰ ردیف دارد. برای جلوگیری از بازیابی نیمه‌کاره، آن را با ابزار پشتیبان‌گیری سرور بازیابی کنید.",
    );
  }
  for (const definition of recognized) {
    const seen = new Set<string>();
    const rows = supplied.get(definition.sheet) || [];
    rows.forEach((row, index) => {
      const missing = definition.keyColumns.find(
        (column) => row[column] === undefined || row[column] === null || row[column] === "",
      );
      if (missing) {
        throw new ApiError(
          400,
          `شیت ${definition.sheet} در ردیف ${index + 2} کلید «${missing}» ندارد؛ هیچ داده‌ای وارد نشد.`,
        );
      }
      const key = definition.keyColumns.map((column) => String(row[column])).join("§");
      if (seen.has(key)) {
        throw new ApiError(
          400,
          `در شیت ${definition.sheet} کلید تکراری در ردیف ${index + 2} وجود دارد؛ هیچ داده‌ای وارد نشد.`,
        );
      }
      seen.add(key);
    });
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let rejected = 0;
  let total = 0;
  const sheetResults: Array<{
    sheet: string;
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
    rejected: number;
    errors: Array<{ row: number; message: string }>;
  }> = [];

  for (const definition of recognized) {
    const sourceRows = supplied.get(definition.sheet) || [];
    const summary = {
      sheet: definition.sheet,
      total: sourceRows.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      rejected: 0,
      errors: [] as Array<{ row: number; message: string }>,
    };
    total += sourceRows.length;

    for (let index = 0; index < sourceRows.length; index += 1) {
      try {
        const outcome = await restoreWorkbookRow(
          definition,
          sourceRows[index],
          body.mode === "update" ? "update" : "skip",
        );
        summary[outcome] += 1;
        if (outcome === "inserted") inserted += 1;
        else if (outcome === "updated") updated += 1;
        else skipped += 1;
      } catch (error) {
        rejected += 1;
        summary.rejected += 1;
        if (summary.errors.length < 25) {
          summary.errors.push({
            row: index + 2,
            message: error instanceof Error ? error.message : "خطای نامشخص",
          });
        }
      }
    }
    sheetResults.push(summary);
  }

  const batch = await runtime().DB
    .prepare(
      `INSERT INTO import_batches (
        entity_type, file_name, total_rows, inserted_rows, updated_rows,
        rejected_rows, result_json, created_by
      ) VALUES ('workbook', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      cleanText(body.fileName, 300) || "chavoosh-crm-backup.xlsx",
      total,
      inserted,
      updated,
      rejected + skipped,
      JSON.stringify({ skipped, sheets: sheetResults }).slice(0, 200_000),
      user.id,
    )
    .run();
  await recordAudit(
    user,
    "import_batch",
    Number(batch.meta.last_row_id),
    "workbook_import",
    "",
    { inserted, updated, skipped, rejected, sheets: recognized.map((item) => item.sheet) },
  );

  return Response.json({
    batchId: Number(batch.meta.last_row_id),
    total,
    inserted,
    updated,
    skipped,
    rejected,
    sheets: sheetResults,
  });
}

async function restoreWorkbookRow(
  definition: (typeof workbookBackupTables)[number],
  row: Record<string, unknown>,
  mode: "skip" | "update",
): Promise<"inserted" | "updated" | "skipped"> {
  const values = definition.columns
    .filter((column) => Object.prototype.hasOwnProperty.call(row, column))
    .map((column) => [column, workbookCell(row[column])] as const);
  if (!values.length) throw new Error("ردیف فاقد ستون معتبر است.");

  const keys = definition.keyColumns.map((column) => {
    const found = values.find(([name]) => name === column);
    if (!found || found[1] === null || found[1] === "") {
      throw new Error(`کلید اصلی «${column}» خالی است.`);
    }
    return found;
  });
  const keyWhere = keys.map(([column]) => `"${column}" = ?`).join(" AND ");
  const exists = await runtime().DB
    .prepare(`SELECT 1 AS found FROM "${definition.table}" WHERE ${keyWhere} LIMIT 1`)
    .bind(...keys.map(([, value]) => value))
    .first<{ found: number }>();

  if (exists) {
    if (mode !== "update") return "skipped";
    const editable = values.filter(
      ([column]) => !definition.keyColumns.includes(column),
    );
    if (!editable.length) return "skipped";
    await runtime().DB
      .prepare(
        `UPDATE "${definition.table}"
         SET ${editable.map(([column]) => `"${column}" = ?`).join(", ")}
         WHERE ${keyWhere}`,
      )
      .bind(
        ...editable.map(([, value]) => value),
        ...keys.map(([, value]) => value),
      )
      .run();
    return "updated";
  }

  await runtime().DB
    .prepare(
      `INSERT INTO "${definition.table}"
       (${values.map(([column]) => `"${column}"`).join(", ")})
       VALUES (${values.map(() => "?").join(", ")})`,
    )
    .bind(...values.map(([, value]) => value))
    .run();
  return "inserted";
}

function workbookCell(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number") return value;
  return JSON.stringify(value);
}

async function importCustomer(
  row: Record<string, unknown>,
  userId: number,
  mode?: string,
) {
  const name = cleanText(row.name, 300);
  if (!name) throw new Error("نام مشتری خالی است.");
  const existing = await runtime().DB
    .prepare(
      `SELECT id FROM customers WHERE lower(name) = lower(?)
       AND archived_at IS NULL LIMIT 1`,
    )
    .bind(name)
    .first<{ id: number }>();
  if (existing) {
    if (mode !== "update") throw new Error("مشتری تکراری است.");
    await runtime().DB
      .prepare(
        `UPDATE customers SET
          short_name = CASE WHEN ? != '' THEN ? ELSE short_name END,
          organization_type = CASE WHEN ? != '' THEN ? ELSE organization_type END,
          industry = CASE WHEN ? != '' THEN ? ELSE industry END,
          phone = CASE WHEN ? != '' THEN ? ELSE phone END,
          fax = CASE WHEN ? != '' THEN ? ELSE fax END,
          email = CASE WHEN ? != '' THEN ? ELSE email END,
          secretariat_number = CASE WHEN ? != '' THEN ? ELSE secretariat_number END,
          province = CASE WHEN ? != '' THEN ? ELSE province END,
          city = CASE WHEN ? != '' THEN ? ELSE city END,
          address = CASE WHEN ? != '' THEN ? ELSE address END,
          updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        cleanText(row.shortName), cleanText(row.shortName),
        cleanText(row.organizationType), cleanText(row.organizationType),
        cleanText(row.industry), cleanText(row.industry),
        cleanText(row.phone), cleanText(row.phone),
        cleanText(row.fax), cleanText(row.fax),
        cleanText(row.email).toLowerCase(), cleanText(row.email).toLowerCase(),
        cleanText(row.secretariatNumber), cleanText(row.secretariatNumber),
        cleanText(row.province), cleanText(row.province),
        cleanText(row.city), cleanText(row.city),
        cleanMultiline(row.address), cleanMultiline(row.address),
        userId,
        existing.id,
      )
      .run();
    await attachImportedTags(existing.id, row.tags, userId);
    return "updated";
  }
  const result = await runtime().DB
    .prepare(
      `INSERT INTO customers (
        name, short_name, organization_type, industry, phone, fax, email,
        secretariat_number, province, city, address, description, visibility,
        owner_user_id, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?, ?)`,
    )
    .bind(
      name,
      cleanText(row.shortName),
      cleanText(row.organizationType),
      cleanText(row.industry),
      cleanText(row.phone),
      cleanText(row.fax),
      cleanText(row.email).toLowerCase(),
      cleanText(row.secretariatNumber),
      cleanText(row.province),
      cleanText(row.city),
      cleanMultiline(row.address),
      cleanMultiline(row.description),
      userId,
      userId,
      userId,
    )
    .run();
  const id = Number(result.meta.last_row_id);
  await runtime().DB
    .prepare(
      `INSERT OR IGNORE INTO customer_watchers
       (customer_id, user_id, added_by) VALUES (?, ?, ?)`,
    )
    .bind(id, userId, userId)
    .run();
  await attachImportedTags(id, row.tags, userId);
  return "inserted";
}

async function attachImportedTags(customerId: number, rawTags: unknown, userId: number) {
  const names = cleanText(rawTags, 1000)
    .split(/[,،;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
  for (const name of names) {
    await runtime().DB
      .prepare(
        `INSERT INTO tags (name, created_by) VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET is_active = 1`,
      )
      .bind(name, userId)
      .run();
    const tag = await runtime().DB
      .prepare("SELECT id FROM tags WHERE name = ?")
      .bind(name)
      .first<{ id: number }>();
    if (tag) {
      await runtime().DB
        .prepare(
          "INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?, ?)",
        )
        .bind(customerId, tag.id)
        .run();
    }
  }
}

async function importContact(
  row: Record<string, unknown>,
  userId: number,
  mode?: string,
) {
  const customerName = cleanText(row.customerName, 300);
  const customer = await runtime().DB
    .prepare(
      `SELECT id FROM customers WHERE lower(name) = lower(?)
       AND archived_at IS NULL LIMIT 1`,
    )
    .bind(customerName)
    .first<{ id: number }>();
  if (!customer) throw new Error(`مشتری «${customerName || "نامشخص"}» پیدا نشد.`);
  const firstName = cleanText(row.firstName, 100);
  const lastName = cleanText(row.lastName, 150);
  if (!firstName && !lastName) throw new Error("نام فرد خالی است.");
  const email = cleanText(row.email, 200).toLowerCase();
  const mobile = cleanText(row.mobile, 50);
  const existing = await runtime().DB
    .prepare(
      `SELECT id FROM contacts WHERE customer_id = ? AND archived_at IS NULL
       AND ((? != '' AND lower(email) = lower(?))
         OR (? != '' AND mobile = ?)
         OR (lower(first_name) = lower(?) AND lower(last_name) = lower(?)))
       LIMIT 1`,
    )
    .bind(customer.id, email, email, mobile, mobile, firstName, lastName)
    .first<{ id: number }>();
  if (existing) {
    if (mode !== "update") throw new Error("فرد تکراری است.");
    await runtime().DB
      .prepare(
        `UPDATE contacts SET first_name = ?, last_name = ?, job_title = ?,
         department = ?, direct_phone = ?, mobile = ?, email = ?,
         updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(
        firstName,
        lastName,
        cleanText(row.jobTitle),
        cleanText(row.department),
        cleanText(row.directPhone),
        mobile,
        email,
        userId,
        existing.id,
      )
      .run();
    return "updated";
  }
  await runtime().DB
    .prepare(
      `INSERT INTO contacts (
        customer_id, first_name, last_name, job_title, department,
        direct_phone, mobile, email, notes, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      customer.id,
      firstName,
      lastName,
      cleanText(row.jobTitle),
      cleanText(row.department),
      cleanText(row.directPhone),
      mobile,
      email,
      cleanMultiline(row.notes),
      userId,
      userId,
    )
    .run();
  return "inserted";
}
