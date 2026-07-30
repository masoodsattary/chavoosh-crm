import {
  jsonError,
  requiredInt,
  requireApiUser,
  runtime,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown>;
    if (body.all === true) {
      await runtime().DB
        .prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?")
        .bind(user.id)
        .run();
    } else {
      const id = requiredInt(body.id, "اعلان");
      await runtime().DB
        .prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?")
        .bind(id, user.id)
        .run();
    }
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
