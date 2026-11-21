import { ApiError, isManager, jsonError, requireApiUser, runtime } from "@/lib/server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser(); const id = Number((await context.params).id); const manager = isManager(user) ? 1 : 0;
    const doc = await runtime().DB.prepare(`SELECT d.object_key AS objectKey, d.file_name AS fileName, d.content_type AS contentType, d.size FROM documents d WHERE d.id = ? AND d.archived_at IS NULL AND (? = 1 OR d.visibility = 'public' OR d.uploaded_by = ? OR EXISTS (SELECT 1 FROM document_links dl JOIN customers c ON c.id = dl.customer_id WHERE dl.document_id=d.id AND (c.visibility='public' OR c.owner_user_id=? OR EXISTS(SELECT 1 FROM customer_watchers cw WHERE cw.customer_id=c.id AND cw.user_id=?))))`).bind(id, manager, user.id, user.id, user.id).first<{objectKey:string;fileName:string;contentType:string;size:number}>();
    if (!doc) throw new ApiError(404, "فایل پیدا نشد."); const object = await runtime().BUCKET.get(doc.objectKey); if (!object) throw new ApiError(404, "محتوای فایل پیدا نشد.");
    let body: ReadableStream | null = object.body;
    if (object.customMetadata?.chunked === "1") {
      const chunkCount = Number(object.customMetadata.chunkCount);
      if (!Number.isInteger(chunkCount) || chunkCount <= 0) throw new ApiError(500, "اطلاعات فایل ناقص است.");
      let index = 0;
      body = new ReadableStream({
        async pull(controller) {
          if (index >= chunkCount) { controller.close(); return; }
          const key = `${doc.objectKey}.part.${String(index).padStart(3, "0")}`;
          const part = await runtime().BUCKET.get(key);
          if (!part) { controller.error(new Error("بخشی از فایل پیدا نشد.")); return; }
          controller.enqueue(new Uint8Array(await part.arrayBuffer()));
          index += 1;
        },
      });
    }
    return new Response(body, { headers: { "Content-Type": doc.contentType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`, "Content-Length": String(doc.size), "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
