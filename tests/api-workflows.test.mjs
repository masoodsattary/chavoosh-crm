import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

const authHeaders = {
  "oai-authenticated-user-email": "qa@chavoosh.example",
  "oai-authenticated-user-full-name": encodeURIComponent("مدیر آزمون"),
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
};

async function createHarness() {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-01-01",
    d1Databases: { DB: "crm-workflow-test" },
    r2Buckets: { BUCKET: "crm-workflow-files" },
  });
  const db = await mf.getD1Database("DB");
  const migrations = (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrations) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    for (const statement of sql
      .split("--> statement-breakpoint")
      .map((value) => value.trim())
      .filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
  const bucket = await mf.getR2Bucket("BUCKET");
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  const environment = {
    DB: db,
    BUCKET: bucket,
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  const context = { waitUntil() {}, passThroughOnException() {} };

  async function request(path, options = {}) {
    const headers = new Headers(authHeaders);
    for (const [key, value] of Object.entries(options.headers || {})) headers.set(key, value);
    let body = options.body;
    const rawBody =
      body instanceof ArrayBuffer ||
      ArrayBuffer.isView(body) ||
      body instanceof Blob;
    if (body !== undefined && !(body instanceof FormData) && !rawBody) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(body);
    }
    return worker.fetch(
      new Request(new URL(path, "http://crm.test"), {
        method: options.method || "GET",
        headers,
        body,
      }),
      environment,
      context,
    );
  }

  async function json(path, options = {}, expectedStatus) {
    const response = await request(path, options);
    assert.match(response.headers.get("content-type") || "", /^application\/json\b/i, path);
    const value = await response.json();
    if (expectedStatus !== undefined) assert.equal(response.status, expectedStatus, JSON.stringify(value));
    else assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(value)}`);
    return value;
  }
  return { mf, db, request, json };
}

test("core CRM APIs return valid responses and preserve an activity follow-up chain", async () => {
  const app = await createHarness();
  try {
    const initial = await app.json("/api/bootstrap");
    assert.equal(initial.user.role, "admin");

    const customer = await app.json(
      "/api/customers",
      { method: "POST", body: { name: "مشتری آزمون", city: "تهران", newTagNames: ["آزمون"] } },
      201,
    );
    await app.json(
      "/api/contacts",
      { method: "POST", body: { customerId: customer.id, firstName: "رضا" } },
      400,
    );
    const contact = await app.json(
      "/api/contacts",
      { method: "POST", body: { customerId: customer.id, firstName: "", lastName: "آزمایشی", mobile: "09120000000" } },
      201,
    );
    await app.json("/api/contacts", {
      method: "PATCH",
      body: { id: contact.id, jobTitle: "مدیر فناوری" },
    });

    const meeting = await app.json(
      "/api/activities",
      {
        method: "POST",
        body: {
          customerId: customer.id,
          contactIds: [contact.id],
          title: "جلسه معرفی",
          type: "meeting_in_person",
          status: "planned",
          startsAt: "2026-08-04T09:00:00.000Z",
          description: "جلسه برنامه‌ریزی شد",
        },
      },
      201,
    );
    const brochure = await app.json("/api/activities", {
      method: "PATCH",
      body: {
        id: meeting.id,
        status: "completed",
        result: "جلسه برگزار شد",
        nextAction: "ارسال بروشور",
        nextActionAt: "2026-08-05T09:00:00.000Z",
        nextActionAssigneeUserId: initial.user.id,
      },
    });
    assert.ok(brochure.nextActivityId);
    const followUp = await app.json("/api/activities", {
      method: "PATCH",
      body: {
        id: brochure.nextActivityId,
        status: "completed",
        result: "بروشور ارسال شد",
        nextAction: "پیگیری نتیجه",
        nextActionAt: "2026-08-07T09:00:00.000Z",
        nextActionAssigneeUserId: initial.user.id,
      },
    });
    assert.ok(followUp.nextActivityId);

    const links = await app.db
      .prepare("SELECT id, source_activity_id AS sourceActivityId, status FROM activities ORDER BY id")
      .all();
    assert.deepEqual(
      links.results.map((row) => [row.id, row.sourceActivityId, row.status]),
      [
        [meeting.id, null, "completed"],
        [brochure.nextActivityId, meeting.id, "completed"],
        [followUp.nextActivityId, brochure.nextActivityId, "planned"],
      ],
    );

    const opportunity = await app.json(
      "/api/opportunities",
      {
        method: "POST",
        body: {
          customerId: customer.id,
          title: "فروش راهکار",
          amount: 250000000,
          currency: "IRR",
          probability: 40,
          steps: [{ title: "ارائه پیشنهاد", status: "pending" }],
        },
      },
      201,
    );
    await app.json("/api/opportunities", {
      method: "PATCH",
      body: { id: opportunity.id, probability: 60, currentStage: "مذاکره" },
    });

    const form = new FormData();
    form.set("file", new File(["test brochure"], "brochure.txt", { type: "text/plain" }));
    form.set("customerIds", JSON.stringify([customer.id]));
    form.set("title", "بروشور آزمون");
    form.set("documentType", "brochure");
    const document = await app.json("/api/files", { method: "POST", body: form }, 201);
    assert.ok(document.id);
    const customerDocuments = await app.json("/api/files?scope=customer");
    assert.equal(customerDocuments.documents.find((item) => item.id === document.id)?.visibility, "customer");

    const largeBytes = new Uint8Array(1_350_000);
    for (let index = 0; index < largeBytes.length; index += 1) largeBytes[index] = index % 251;
    const started = await app.json("/api/files/chunked", {
      method: "POST",
      body: {
        action: "start",
        customerIds: [],
        title: "فایل بزرگ آزمون",
        documentType: "technical_brochure",
        fileName: "large.bin",
        contentType: "application/octet-stream",
        size: largeBytes.length,
      },
    }, 201);
    for (let index = 0; index < started.chunkCount; index += 1) {
      const response = await app.request(
        `/api/files/chunked?uploadId=${started.uploadId}&index=${index}`,
        {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: largeBytes.slice(
            index * started.chunkSize,
            Math.min(largeBytes.length, (index + 1) * started.chunkSize),
          ),
        },
      );
      assert.equal(response.status, 200);
    }
    const largeDocument = await app.json("/api/files/chunked", {
      method: "POST",
      body: { action: "finish", uploadId: started.uploadId },
    }, 201);
    await app.json("/api/files", {
      method: "PATCH",
      body: { documentId: largeDocument.id, entityType: "customer", entityId: customer.id },
    });
    const publicDocuments = await app.json("/api/files?scope=public");
    assert.equal(publicDocuments.documents.find((item) => item.id === largeDocument.id)?.visibility, "public");
    assert.ok(!publicDocuments.documents.some((item) => item.id === document.id));
    const downloaded = await app.request(`/api/files/${largeDocument.id}`);
    assert.equal(downloaded.status, 200);
    assert.equal(Number(downloaded.headers.get("content-length")), largeBytes.length);
    assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), largeBytes);

    const unlinkedForm = new FormData();
    unlinkedForm.set("file", new File(["standalone"], "standalone.txt", { type: "text/plain" }));
    unlinkedForm.set("customerIds", "[]");
    unlinkedForm.set("title", "سند مستقل");
    const unlinkedDocument = await app.json("/api/files", { method: "POST", body: unlinkedForm }, 201);
    await app.json("/api/files", {
      method: "PATCH",
      body: { documentId: unlinkedDocument.id, entityType: "activity", entityId: meeting.id },
    });
    await app.json("/api/files", {
      method: "PATCH",
      body: { documentId: unlinkedDocument.id, entityType: "opportunity", entityId: opportunity.id },
    });
    const activeDocuments = await app.json("/api/files?scope=active");
    const relatedPublicDocument = activeDocuments.documents.find((item) => item.id === unlinkedDocument.id);
    assert.ok(relatedPublicDocument);
    assert.ok(
      String(relatedPublicDocument.linkedCustomerIds || "")
        .split(",")
        .map(Number)
        .includes(customer.id),
      "activity/opportunity links must make a public document visible under the same-customer tab",
    );
    assert.ok(activeDocuments.storageBytes >= largeBytes.length);
    await app.json("/api/files", {
      method: "PATCH",
      body: {
        action: "update",
        documentId: unlinkedDocument.id,
        title: "سند ویرایش‌شده",
        documentType: "contract",
        visibility: "customer",
        version: "2",
        documentDate: "1405/05/17",
        referenceNumber: "DOC-42",
        description: "مشخصات سند ویرایش شد",
      },
    });
    const editedDocuments = await app.json("/api/files?scope=customer");
    const editedDocument = editedDocuments.documents.find((item) => item.id === unlinkedDocument.id);
    assert.equal(editedDocument?.title, "سند ویرایش‌شده");
    assert.equal(editedDocument?.documentType, "contract");
    assert.equal(editedDocument?.visibility, "customer");
    assert.equal(editedDocument?.version, "2");
    assert.equal(editedDocument?.referenceNumber, "DOC-42");
    await app.json("/api/files", {
      method: "PATCH",
      body: { documentId: unlinkedDocument.id, action: "archive" },
    });
    const archivedDocuments = await app.json("/api/files?scope=archived");
    assert.ok(archivedDocuments.documents.some((item) => item.id === unlinkedDocument.id));
    await app.json("/api/files", {
      method: "PATCH",
      body: { documentId: unlinkedDocument.id, action: "restore" },
    });
    const afterRestore = await app.json("/api/files?scope=customer");
    assert.ok(afterRestore.documents.some((item) => item.id === unlinkedDocument.id));
    await app.json("/api/files", {
      method: "PATCH",
      body: { documentId: unlinkedDocument.id, action: "archive" },
    });
    await app.json("/api/files", { method: "DELETE", body: { id: unlinkedDocument.id } });
    const afterPermanentDelete = await app.json("/api/files?scope=archived");
    assert.ok(!afterPermanentDelete.documents.some((item) => item.id === unlinkedDocument.id));

    const detail = await app.json(`/api/customers/${customer.id}`);
    assert.equal(detail.customer.name, "مشتری آزمون");
    assert.equal(detail.contacts[0].jobTitle, "مدیر فناوری");
    assert.equal(detail.activities.length, 3);
    assert.equal(detail.activities.find((item) => item.id === meeting.id).nextActivityId, brochure.nextActivityId);
    assert.equal(detail.activities.find((item) => item.id === brochure.nextActivityId).sourceActivityId, meeting.id);
    assert.equal(detail.opportunities[0].probability, 60);
    assert.ok(detail.documents.some((item) => item.id === document.id));
    assert.ok(detail.documents.some((item) => item.id === largeDocument.id));

    const contactDetail = await app.json(`/api/contacts/${contact.id}`);
    assert.equal(contactDetail.contact.id, contact.id);
    assert.equal(contactDetail.activities.length, 3);

    const search = await app.json("/api/search?q=%D8%A2%D8%B2%D9%85%D9%88%D9%86&limit=20");
    assert.ok(search.counts.customers >= 1);
    assert.ok(search.counts.contacts >= 1);

    const imported = await app.json("/api/import", {
      method: "POST",
      body: {
        entityType: "customers",
        fileName: "qa.xlsx",
        rows: [{ name: "مشتری واردشده", city: "شیراز" }],
      },
    });
    assert.equal(imported.inserted, 1);

    const exported = await app.request("/api/export");
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get("content-type") || "", /^application\/json\b/i);
    const exportPayload = await exported.json();
    assert.equal(exportPayload.format, "chavoosh-crm-workbook");
    assert.ok(exportPayload.sheets.length > 10);
    assert.ok(exportPayload.backupSheets.length > 10);

    await app.json("/api/notifications", { method: "PATCH", body: { all: true } });
    const refreshed = await app.json("/api/bootstrap");
    assert.ok(refreshed.customers.some((item) => item.id === customer.id));
    assert.ok(refreshed.activities.some((item) => item.id === followUp.nextActivityId));
  } finally {
    await app.mf.dispose();
  }
});

test("event email policy adds managers only for the selected important events", async () => {
  const app = await createHarness();
  try {
    const actor = await app.json("/api/bootstrap");
    const managerResult = await app.db
      .prepare("INSERT INTO users (email, full_name, role) VALUES (?, ?, 'sales_manager')")
      .bind("manager@chavoosh.example", "مدیر دوم")
      .run();
    const watcherResult = await app.db
      .prepare("INSERT INTO users (email, full_name, role) VALUES (?, ?, 'viewer')")
      .bind("watcher@chavoosh.example", "مشاهده‌گر")
      .run();
    const managerId = Number(managerResult.meta.last_row_id);
    const watcherId = Number(watcherResult.meta.last_row_id);

    const customer = await app.json(
      "/api/customers",
      {
        method: "POST",
        body: {
          name: "مشتری سیاست ایمیل",
          ownerUserId: actor.user.id,
          watcherIds: [watcherId],
        },
      },
      201,
    );
    await app.json("/api/contacts", {
      method: "POST",
      body: { customerId: customer.id, firstName: "مخاطب", lastName: "عادی" },
    }, 201);
    await app.json("/api/opportunities", {
      method: "POST",
      body: { customerId: customer.id, title: "فرصت مهم", probability: 25 },
    }, 201);
    const managerNote = await app.json("/api/notes", {
      method: "POST",
      body: { customerId: customer.id, body: "یادداشت خصوصی مهم" },
    }, 201);
    await app.json("/api/notes", {
      method: "PATCH",
      body: { id: managerNote.id, body: "یادداشت خصوصی ویرایش‌شده" },
    });
    await app.json("/api/notes", { method: "DELETE", body: { id: managerNote.id } });
    await app.json(`/api/customers/${customer.id}`, { method: "DELETE" });

    const rows = await app.db
      .prepare(
        `SELECT te.event_type AS eventType, eo.user_id AS userId, eo.html_body AS htmlBody
         FROM email_outbox eo
         JOIN timeline_events te ON te.id = eo.timeline_event_id
         WHERE te.customer_id = ?`,
      )
      .bind(customer.id)
      .all();
    const managerEvents = rows.results
      .filter((row) => Number(row.userId) === managerId)
      .map((row) => row.eventType);
    assert.ok(managerEvents.includes("customer_created"));
    assert.ok(managerEvents.includes("customer_archived"));
    assert.ok(managerEvents.includes("opportunity_created"));
    assert.ok(managerEvents.includes("manager_note"));
    assert.ok(managerEvents.includes("manager_note_updated"));
    assert.ok(managerEvents.includes("manager_note_archived"));
    assert.ok(!managerEvents.includes("contact_created"));

    const watcherEvents = rows.results
      .filter((row) => Number(row.userId) === watcherId)
      .map((row) => row.eventType);
    assert.ok(watcherEvents.includes("customer_created"));
    assert.ok(watcherEvents.includes("contact_created"));
    assert.ok(watcherEvents.includes("opportunity_created"));
    assert.ok(!watcherEvents.includes("manager_note"));

    const newCustomerMail = rows.results.find((row) => row.eventType === "customer_created");
    assert.match(String(newCustomerMail?.htmlBody || ""), /فهرست مشاهده‌کنندگان/);
  } finally {
    await app.mf.dispose();
  }
});

test("all API errors remain JSON so the client never parses an HTML error page", async () => {
  const app = await createHarness();
  try {
    await app.json("/api/bootstrap");
    const paths = [
      ["/api/customers/999999", {}],
      ["/api/contacts/999999", {}],
      ["/api/customers", { method: "POST", body: {} }],
      ["/api/activities", { method: "POST", body: {} }],
      ["/api/opportunities", { method: "POST", body: {} }],
      ["/api/import", { method: "POST", body: { rows: [] } }],
    ];
    for (const [path, options] of paths) {
      const response = await app.request(path, options);
      assert.match(response.headers.get("content-type") || "", /^application\/json\b/i, path);
      assert.ok(response.status >= 400, path);
      const payload = await response.json();
      assert.equal(typeof payload.error, "string", path);
    }
  } finally {
    await app.mf.dispose();
  }
});
