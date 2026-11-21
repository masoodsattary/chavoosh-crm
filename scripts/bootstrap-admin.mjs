import { pbkdf2Sync, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const databasePath = process.env.CRM_DATABASE_PATH;
const email = String(process.env.CRM_ADMIN_EMAIL || "").trim().toLowerCase();
const fullName = String(process.env.CRM_ADMIN_NAME || "مدیر سیستم").trim();
const password = String(process.env.CRM_ADMIN_PASSWORD || "");

if (!databasePath?.startsWith("/")) throw new Error("CRM_DATABASE_PATH must be an absolute path");
if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("CRM_ADMIN_EMAIL is invalid");
if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  throw new Error("CRM_ADMIN_PASSWORD must contain at least 10 characters, one Latin letter and one digit");
}

const database = new DatabaseSync(databasePath);
const schema = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get();
if (!schema) throw new Error("Database schema is missing. Start the application once before creating the admin.");
const saltBytes = randomBytes(16);
const iterations = 100_000;
const hashBytes = pbkdf2Sync(password, saltBytes, iterations, 32, "sha256");
const base64Url = (value) => value.toString("base64url");

const existing = database.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email);
if (existing) {
  database.prepare(`UPDATE users SET full_name=?, role='admin', is_active=1,
    password_hash=?, password_salt=?, password_iterations=?,
    password_changed_at=CURRENT_TIMESTAMP, archived_at=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE id=?`).run(fullName, base64Url(hashBytes), base64Url(saltBytes), iterations, existing.id);
  console.log(`Updated administrator: ${email}`);
} else {
  database.prepare(`INSERT INTO users
    (email, full_name, mobile, role, timezone, is_active, password_hash,
     password_salt, password_iterations, password_changed_at)
    VALUES (?, ?, '', 'admin', 'Asia/Tehran', 1, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .run(email, fullName, base64Url(hashBytes), base64Url(saltBytes), iterations);
  console.log(`Created administrator: ${email}`);
}
