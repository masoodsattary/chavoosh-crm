import { createSession, verifyPassword } from "@/lib/auth";
import { ApiError, cleanText, jsonError, runtime } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = cleanText(body.email, 200).toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) throw new ApiError(400, "ایمیل و رمز عبور الزامی است.");

    const attempts = await runtime().DB
      .prepare("SELECT failed_count AS failedCount, blocked_until AS blockedUntil FROM auth_login_attempts WHERE email = ?")
      .bind(email)
      .first<{ failedCount: number; blockedUntil: string | null }>();
    if (attempts?.blockedUntil && new Date(attempts.blockedUntil) > new Date()) {
      throw new ApiError(429, "تلاش‌های ناموفق بیش از حد است. ۱۵ دقیقه دیگر دوباره امتحان کنید.");
    }

    const user = await runtime().DB
      .prepare(
        `SELECT id, is_active AS isActive, password_hash AS passwordHash,
                password_salt AS passwordSalt, password_iterations AS passwordIterations
         FROM users WHERE lower(email) = ? AND archived_at IS NULL`,
      )
      .bind(email)
      .first<{
        id: number;
        isActive: number;
        passwordHash: string | null;
        passwordSalt: string | null;
        passwordIterations: number | null;
      }>();
    const valid =
      user?.isActive &&
      user.passwordHash &&
      user.passwordSalt &&
      user.passwordIterations &&
      (await verifyPassword(password, {
        hash: user.passwordHash,
        salt: user.passwordSalt,
        iterations: user.passwordIterations,
      }));
    if (!valid) {
      const failed = (attempts?.failedCount || 0) + 1;
      const blockedUntil = failed >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
      await runtime().DB
        .prepare(
          `INSERT INTO auth_login_attempts (email, failed_count, blocked_until, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(email) DO UPDATE SET failed_count = excluded.failed_count,
             blocked_until = excluded.blocked_until, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(email, failed, blockedUntil)
        .run();
      throw new ApiError(401, "ایمیل یا رمز عبور صحیح نیست.");
    }

    await runtime().DB.batch([
      runtime().DB.prepare("DELETE FROM auth_login_attempts WHERE email = ?").bind(email),
      runtime().DB.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id),
      runtime().DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
    ]);
    const response = Response.json({ ok: true });
    response.headers.set("Set-Cookie", await createSession(user.id));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
