import {
  DOCUMENT_CHUNK_SIZE,
  createDocumentRecord,
  normalizeDocumentMetadata,
  type DocumentMetadata,
} from "@/lib/documents";
import {
  ApiError,
  cleanText,
  jsonError,
  requireApiUser,
  requireCustomerAccess,
  runtime,
} from "@/lib/server";

export const dynamic = "force-dynamic";

type UploadManifest = {
  ownerUserId: number;
  chunkCount: number;
  metadata: DocumentMetadata;
};

function validUploadId(value: unknown) {
  const uploadId = cleanText(value, 100);
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) {
    throw new ApiError(400, "شناسه بارگذاری نامعتبر است.");
  }
  return uploadId;
}

function objectKey(userId: number, uploadId: string) {
  return `documents/chunked/${userId}/${uploadId}`;
}

function partKey(key: string, index: number) {
  return `${key}.part.${String(index).padStart(3, "0")}`;
}

async function loadManifest(key: string, userId: number) {
  const object = await runtime().BUCKET.get(key);
  if (!object || object.customMetadata?.uploadStatus !== "uploading") {
    throw new ApiError(404, "بارگذاری پیدا نشد یا منقضی شده است.");
  }
  let manifest: UploadManifest;
  try {
    manifest = (await object.json()) as UploadManifest;
  } catch {
    throw new ApiError(409, "اطلاعات بارگذاری ناقص است؛ دوباره تلاش کنید.");
  }
  if (manifest.ownerUserId !== userId) {
    throw new ApiError(403, "دسترسی به این بارگذاری مجاز نیست.");
  }
  return manifest;
}

async function removeUpload(key: string, chunkCount: number) {
  const keys = [key];
  for (let index = 0; index < chunkCount; index += 1) {
    keys.push(partKey(key, index));
  }
  await runtime().BUCKET.delete(keys);
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(request.url);
    if (request.headers.get("content-type")?.includes("application/octet-stream")) {
      const uploadId = validUploadId(url.searchParams.get("uploadId"));
      const index = Number(url.searchParams.get("index"));
      const key = objectKey(user.id, uploadId);
      const manifest = await loadManifest(key, user.id);
      if (!Number.isInteger(index) || index < 0 || index >= manifest.chunkCount) {
        throw new ApiError(400, "شماره قطعه فایل نامعتبر است.");
      }
      const body = await request.arrayBuffer();
      const expected =
        index === manifest.chunkCount - 1
          ? manifest.metadata.size - index * DOCUMENT_CHUNK_SIZE
          : DOCUMENT_CHUNK_SIZE;
      if (body.byteLength !== expected) {
        throw new ApiError(400, "اندازه قطعه فایل با مقدار مورد انتظار یکسان نیست.");
      }
      await runtime().BUCKET.put(partKey(key, index), body, {
        httpMetadata: { contentType: "application/octet-stream" },
      });
      return Response.json({ ok: true, index });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = cleanText(body.action, 30);
    if (action === "start") {
      const metadata = normalizeDocumentMetadata(body);
      for (const customerId of metadata.customerIds) {
        await requireCustomerAccess(customerId, user, true);
      }
      const uploadId = crypto.randomUUID();
      const key = objectKey(user.id, uploadId);
      const manifest: UploadManifest = {
        ownerUserId: user.id,
        chunkCount: Math.ceil(metadata.size / DOCUMENT_CHUNK_SIZE),
        metadata,
      };
      await runtime().BUCKET.put(key, JSON.stringify(manifest), {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { uploadStatus: "uploading" },
      });
      return Response.json(
        {
          uploadId,
          chunkSize: DOCUMENT_CHUNK_SIZE,
          chunkCount: manifest.chunkCount,
        },
        { status: 201 },
      );
    }

    const uploadId = validUploadId(body.uploadId);
    const key = objectKey(user.id, uploadId);
    const manifest = await loadManifest(key, user.id);
    if (action === "abort") {
      await removeUpload(key, manifest.chunkCount);
      return Response.json({ ok: true });
    }
    if (action !== "finish") {
      throw new ApiError(400, "عملیات بارگذاری نامعتبر است.");
    }

    let receivedSize = 0;
    for (let index = 0; index < manifest.chunkCount; index += 1) {
      const part = await runtime().BUCKET.head(partKey(key, index));
      if (!part) throw new ApiError(409, "یک یا چند قطعه فایل دریافت نشده است.");
      receivedSize += part.size;
    }
    if (receivedSize !== manifest.metadata.size) {
      throw new ApiError(409, "فایل بارگذاری‌شده ناقص است؛ دوباره تلاش کنید.");
    }

    await runtime().BUCKET.put(
      key,
      JSON.stringify({ chunkCount: manifest.chunkCount }),
      {
        httpMetadata: { contentType: "application/json" },
        customMetadata: {
          uploadStatus: "complete",
          chunked: "1",
          chunkCount: String(manifest.chunkCount),
          originalName: manifest.metadata.fileName,
          uploadedBy: String(user.id),
        },
      },
    );
    const id = await createDocumentRecord(manifest.metadata, key, user);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
