import { createSession, hashPassword, sha256 } from "@/lib/auth";
import { ApiError, jsonError, runtime } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const user = await findInvite(token);
    return Response.json({ email: user.email, fullName: user.fullName });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = String(body.token || "");
    const password = String(body.password || "");
    if (password !== String(body.confirmation || "")) {
      throw new ApiError(400, "تکرار رمز عبور یکسان نیست.");
    }
    const user = await findInvite(token);
    const hashed = await hashPassword(password);
    await runtime().DB.batch([
      runtime().DB.prepare(
        `UPDATE users SET password_hash = ?, password_salt = ?,
           password_iterations = ?, password_changed_at = CURRENT_TIMESTAMP,
           invite_token_hash = NULL, invite_expires_at = NULL,
           is_active = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(hashed.hash, hashed.salt, hashed.iterations, user.id),
      runtime().DB
        .prepare("DELETE FROM auth_sessions WHERE user_id = ?")
        .bind(user.id),
    ]);
    const response = Response.json({ ok: true });
    response.headers.set("Set-Cookie", await createSession(user.id));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

async function findInvite(token: string) {
  if (token.length < 20) throw new ApiError(400, "لینک دعوت معتبر نیست.");
  const user = await runtime().DB
    .prepare(
      `SELECT id, email, full_name AS fullName
       FROM users
       WHERE invite_token_hash = ? AND invite_expires_at > CURRENT_TIMESTAMP
         AND archived_at IS NULL`,
    )
    .bind(await sha256(token))
    .first<{ id: number; email: string; fullName: string }>();
  if (!user) throw new ApiError(410, "لینک دعوت نامعتبر یا منقضی شده است.");
  return user;
}
