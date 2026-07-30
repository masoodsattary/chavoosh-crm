import { randomToken, requireAuthenticatedUser, sha256 } from "@/lib/auth";
import { ApiError, jsonError, recordAudit, runtime } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    if (!auth.user.isActive) throw new ApiError(403, "حساب کاربری غیرفعال است.");

    const token = randomToken();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    await runtime().DB
      .prepare(
        `UPDATE users SET invite_token_hash = ?, invite_expires_at = ?,
           invited_at = CURRENT_TIMESTAMP, invited_by = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(await sha256(token), expiresAt, auth.user.id, auth.user.id)
      .run();
    await recordAudit(
      auth.user,
      "user",
      auth.user.id,
      "password_reset_requested",
      "",
      { expiresAt },
    );

    const resetUrl = `${new URL(request.url).origin}/invite?token=${encodeURIComponent(token)}`;
    return Response.json({ resetUrl, expiresAt });
  } catch (error) {
    return jsonError(error);
  }
}
