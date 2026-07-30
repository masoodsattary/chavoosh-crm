import {
  ApiError,
  cleanText,
  dispatchPendingEmails,
  jsonError,
  recordAudit,
  requiredInt,
  requireApiUser,
  requireRole,
  runtime,
} from "@/lib/server";
import { randomToken, sha256 } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown>;
    const action = cleanText(body.action, 50);
    if (action === "profile_update") {
      await runtime().DB
        .prepare(
          `UPDATE users SET full_name = ?, mobile = ?, timezone = ?,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(
          cleanText(body.fullName, 200),
          cleanText(body.mobile, 30),
          cleanText(body.timezone, 100) || "Asia/Tehran",
          user.id,
        )
        .run();
      return Response.json({ ok: true });
    }
    requireRole(user, ["admin", "sales_manager"]);
    if (action === "user_create") {
      requireRole(user, ["admin"]);
      const email = cleanText(body.email, 200).toLowerCase();
      if (!email || !email.includes("@")) throw new ApiError(400, "ایمیل معتبر الزامی است.");
      const role = ["admin", "sales_manager", "sales", "viewer"].includes(String(body.role))
        ? String(body.role)
        : "viewer";
      const token = randomToken();
      const tokenHash = await sha256(token);
      const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
      await runtime().DB
        .prepare(
          `INSERT INTO users
           (email, full_name, mobile, role, timezone, is_active,
            invite_token_hash, invite_expires_at, invited_at, invited_by)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, ?)
           ON CONFLICT(email) DO UPDATE SET
             full_name = excluded.full_name, mobile = excluded.mobile,
             role = excluded.role,
             timezone = excluded.timezone, is_active = 1,
             invite_token_hash = excluded.invite_token_hash,
             invite_expires_at = excluded.invite_expires_at,
             invited_at = CURRENT_TIMESTAMP, invited_by = excluded.invited_by,
             archived_at = NULL, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          email,
          cleanText(body.fullName, 200),
          cleanText(body.mobile, 30),
          role,
          cleanText(body.timezone, 100) || "Asia/Tehran",
          tokenHash,
          expiresAt,
          user.id,
        )
        .run();
      const invited = await runtime().DB
        .prepare("SELECT id FROM users WHERE lower(email) = ?")
        .bind(email)
        .first<{ id: number }>();
      if (!invited) throw new ApiError(500, "ایجاد کاربر انجام نشد.");
      const inviteUrl = `${new URL(request.url).origin}/invite?token=${encodeURIComponent(token)}`;
      await runtime().DB
        .prepare(
          `INSERT INTO email_outbox
           (user_id, recipient_email, subject, html_body)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(
          invited.id,
          email,
          "[چاووش CRM] دعوت به سامانه",
          `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9"><h2 style="color:#283980">دعوت به چاووش CRM</h2><p>برای تعیین رمز عبور و فعال‌سازی حساب روی لینک زیر بزنید:</p><p><a href="${inviteUrl}">فعال‌سازی حساب</a></p><p>این لینک تا ۷ روز معتبر است.</p></div>`,
        )
        .run();
      await dispatchPendingEmails(10);
      await recordAudit(user, "user", invited.id, "invite", "", { email, role });
      return Response.json({ ok: true, inviteUrl, expiresAt });
    }
    if (action === "user_update") {
      requireRole(user, ["admin"]);
      const id = requiredInt(body.id, "کاربر");
      const email = cleanText(body.email, 200).toLowerCase();
      if (!email || !email.includes("@")) throw new ApiError(400, "ایمیل معتبر الزامی است.");
      const requestedRole = ["admin", "sales_manager", "sales", "viewer"].includes(String(body.role))
        ? String(body.role)
        : "viewer";
      if (id === user.id && body.isActive === false) {
        throw new ApiError(400, "نمی‌توانید حساب خود را غیرفعال کنید.");
      }
      const existing = await runtime().DB
        .prepare("SELECT id, role, is_active AS isActive FROM users WHERE id = ? AND archived_at IS NULL")
        .bind(id)
        .first<{ id: number; role: string; isActive: number }>();
      if (!existing) throw new ApiError(404, "کاربر پیدا نشد.");
      if (
        existing.role === "admin" &&
        (requestedRole !== "admin" || body.isActive === false)
      ) {
        const activeAdmins = await runtime().DB
          .prepare(
            `SELECT COUNT(*) AS count FROM users
             WHERE role = 'admin' AND is_active = 1 AND archived_at IS NULL`,
          )
          .first<{ count: number }>();
        if (Number(activeAdmins?.count || 0) <= 1) {
          throw new ApiError(400, "آخرین مدیر فعال سامانه را نمی‌توان غیرفعال یا تنزل نقش داد.");
        }
      }
      const duplicate = await runtime().DB
        .prepare("SELECT id FROM users WHERE lower(email) = ? AND id != ? AND archived_at IS NULL")
        .bind(email, id)
        .first<{ id: number }>();
      if (duplicate) throw new ApiError(409, "این ایمیل قبلاً برای کاربر دیگری ثبت شده است.");
      await runtime().DB
        .prepare(
          `UPDATE users SET email = ?, full_name = ?, mobile = ?, role = ?,
           timezone = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(
          email,
          cleanText(body.fullName, 200),
          cleanText(body.mobile, 30),
          requestedRole,
          cleanText(body.timezone, 100) || "Asia/Tehran",
          body.isActive === false ? 0 : 1,
          id,
        )
        .run();
      await recordAudit(user, "user", id, "update", "", body);
      return Response.json({ ok: true });
    }
    if (action === "user_invite") {
      requireRole(user, ["admin"]);
      const id = requiredInt(body.id, "کاربر");
      const invited = await runtime().DB
        .prepare(
          `SELECT id, email, full_name AS fullName
           FROM users WHERE id = ? AND archived_at IS NULL`,
        )
        .bind(id)
        .first<{ id: number; email: string; fullName: string }>();
      if (!invited) throw new ApiError(404, "کاربر پیدا نشد.");

      const token = randomToken();
      const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
      await runtime().DB
        .prepare(
          `UPDATE users SET invite_token_hash = ?, invite_expires_at = ?,
           invited_at = CURRENT_TIMESTAMP, invited_by = ?,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(await sha256(token), expiresAt, user.id, invited.id)
        .run();
      const inviteUrl = `${new URL(request.url).origin}/invite?token=${encodeURIComponent(token)}`;
      await runtime().DB
        .prepare(
          `INSERT INTO email_outbox
           (user_id, recipient_email, subject, html_body)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(
          invited.id,
          invited.email,
          "[چاووش CRM] لینک جدید ورود و تعیین رمز",
          `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9"><h2 style="color:#283980">لینک جدید چاووش CRM</h2><p>برای تعیین یا بازنشانی رمز عبور روی لینک زیر بزنید:</p><p><a href="${inviteUrl}">تعیین رمز عبور</a></p><p>این لینک تا ۷ روز معتبر است و لینک قبلی دیگر قابل استفاده نیست.</p></div>`,
        )
        .run();
      const delivery = await dispatchPendingEmails(10);
      await recordAudit(user, "user", invited.id, "invite_renewed", "", {
        email: invited.email,
        expiresAt,
      });
      return Response.json({
        ok: true,
        inviteUrl,
        expiresAt,
        emailSent: delivery.sent > 0,
        emailConfigured: delivery.configured,
      });
    }
    if (action === "tag_create") {
      const name = cleanText(body.name, 100);
      if (!name) throw new ApiError(400, "نام تگ الزامی است.");
      await runtime().DB
        .prepare(
          `INSERT INTO tags (name, color, created_by)
           VALUES (?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET is_active = 1, archived_at = NULL`,
        )
        .bind(name, cleanText(body.color, 20) || "#283980", user.id)
        .run();
      return Response.json({ ok: true });
    }
    if (action === "dispatch_email") {
      requireRole(user, ["admin"]);
      return Response.json(await dispatchPendingEmails(50));
    }
    throw new ApiError(400, "عملیات ناشناخته است.");
  } catch (error) {
    return jsonError(error);
  }
}
