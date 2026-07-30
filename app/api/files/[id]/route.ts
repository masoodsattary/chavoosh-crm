import {
  ApiError,
  jsonError,
  requireApiUser,
  requireCustomerAccess,
  runtime,
} from "@/lib/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const id = Number((await context.params).id);
    const doc = await runtime().DB
      .prepare(
        `SELECT customer_id AS customerId, object_key AS objectKey,
                file_name AS fileName, content_type AS contentType
         FROM documents WHERE id = ? AND archived_at IS NULL`,
      )
      .bind(id)
      .first<{
        customerId: number;
        objectKey: string;
        fileName: string;
        contentType: string;
      }>();
    if (!doc) throw new ApiError(404, "فایل پیدا نشد.");
    await requireCustomerAccess(doc.customerId, user);
    const object = await runtime().BUCKET.get(doc.objectKey);
    if (!object) throw new ApiError(404, "محتوای فایل پیدا نشد.");
    return new Response(object.body, {
      headers: {
        "Content-Type": doc.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        "Content-Length": String(object.size),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
