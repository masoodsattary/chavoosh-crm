import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("local SQLite and file-storage adapters preserve the D1/R2 contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "chavoosh-crm-local-"));
  process.env.CRM_DATABASE_PATH = join(root, "database", "crm.sqlite");
  process.env.CRM_UPLOADS_PATH = join(root, "uploads");
  process.env.CRM_BASE_URL = "https://crm.test";
  try {
    const { initializeLocalRuntime } = await import("../lib/local-runtime.ts");
    const runtime = await initializeLocalRuntime();
    const migrationCount = await runtime.DB
      .prepare("SELECT COUNT(*) AS count FROM _crm_migrations")
      .first();
    assert.equal(migrationCount.count, 7);

    const inserted = await runtime.DB
      .prepare("INSERT INTO users (email, full_name, role) VALUES (?, ?, ?)")
      .bind("admin@example.test", "Admin", "admin")
      .run();
    assert.equal(inserted.meta.last_row_id, 1);
    const user = await runtime.DB
      .prepare("SELECT email, full_name AS fullName FROM users WHERE id = ?")
      .bind(1)
      .first();
    assert.deepEqual(user, { email: "admin@example.test", fullName: "Admin" });

    await runtime.BUCKET.put("documents/test.txt", "hello", {
      httpMetadata: { contentType: "text/plain" },
      customMetadata: { owner: "1" },
    });
    const object = await runtime.BUCKET.get("documents/test.txt");
    assert.equal(await object.text(), "hello");
    assert.equal(object.customMetadata.owner, "1");
    assert.equal((await runtime.BUCKET.head("documents/test.txt")).size, 5);
    assert.equal(await readFile(join(root, "uploads/documents/test.txt"), "utf8"), "hello");
    await runtime.BUCKET.delete("documents/test.txt");
    assert.equal(await runtime.BUCKET.get("documents/test.txt"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
