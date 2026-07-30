import { createSession, hashPassword, requireAuthenticatedUser } from "@/lib/auth";
import { ApiError, jsonError, recordAudit, runtime } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = (await request.json()) as Record<string, unknown>;
    const newPassword = String(body.newPassword || "");
    const confirmation = String(body.confirmation || "");
    if (newPassword !== confirmation) throw new ApiError(400, "تکرار رمز عبور یکسان نیست.");

    const stored = await runtime().DB
      .prepare(
        `SELECT password_hash AS passwordHash, password_salt AS passwordSalt,
                password_iterations AS passwordIterations
         FROM users WHERE id = ?`,
      )
      .bind(auth.user.id)
      .first<{
        passwordHash: string | null;
        passwordSalt: string | null;
        passwordIterations: number | null;
      }>();
    const password = await hashPassword(newPassword);
    await runtime().DB.batch([
      runtime().DB
        .prepare(
          `UPDATE users SET password_hash = ?, password_salt = ?,
             password_iterations = ?, password_changed_at = CURRENT_TIMESTAMP,
             invite_token_hash = NULL, invite_expires_at = NULL,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(password.hash, password.salt, password.iterations, auth.user.id),
      runtime().DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(auth.user.id),
    ]);
    await recordAudit(
      auth.user,
      "user",
      auth.user.id,
      "password_changed_with_active_session",
      "",
      { previousIterations: stored?.passwordIterations ?? null, newIterations: password.iterations },
    );
    const response = Response.json({ ok: true });
    response.headers.set("Set-Cookie", await createSession(auth.user.id));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
