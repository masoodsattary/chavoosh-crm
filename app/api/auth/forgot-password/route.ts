import { randomToken, sha256 } from "@/lib/auth";
import { cleanText, dispatchPendingEmails, jsonError, runtime } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = cleanText(body.email, 200).toLowerCase();
    const configured = Boolean(runtime().RESEND_API_KEY && runtime().CRM_FROM_EMAIL);

    if (configured && email.includes("@")) {
      const user = await runtime().DB
        .prepare(
          `SELECT id, email, full_name AS fullName, invited_at AS invitedAt
           FROM users
           WHERE lower(email) = ? AND is_active = 1 AND archived_at IS NULL`,
        )
        .bind(email)
        .first<{ id: number; email: string; fullName: string; invitedAt: string | null }>();

      const recentlyRequested =
        user?.invitedAt &&
        Date.now() - new Date(user.invitedAt.replace(" ", "T") + "Z").getTime() < 2 * 60_000;
      if (user && !recentlyRequested) {
        const token = randomToken();
        const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
        await runtime().DB
          .prepare(
            `UPDATE users SET invite_token_hash = ?, invite_expires_at = ?,
             invited_at = CURRENT_TIMESTAMP, invited_by = NULL,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          )
          .bind(await sha256(token), expiresAt, user.id)
          .run();
        const resetUrl = `${new URL(request.url).origin}/invite?token=${encodeURIComponent(token)}`;
        await runtime().DB
          .prepare(
            `INSERT INTO email_outbox
             (user_id, recipient_email, subject, html_body)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(
            user.id,
            user.email,
            "[چاووش CRM] بازنشانی رمز عبور",
            `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9"><h2 style="color:#283980">بازنشانی رمز عبور</h2><p>برای ثبت رمز جدید روی لینک زیر بزنید:</p><p><a href="${resetUrl}">ثبت رمز عبور جدید</a></p><p>این لینک ۳۰ دقیقه اعتبار دارد. اگر این درخواست را شما ثبت نکرده‌اید، آن را نادیده بگیرید.</p></div>`,
          )
          .run();
        await dispatchPendingEmails(10);
      }
    }

    // Always return the same account-agnostic response to avoid revealing membership.
    return Response.json({ ok: true, emailConfigured: configured });
  } catch (error) {
    return jsonError(error);
  }
}
