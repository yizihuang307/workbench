import { getUserId } from "@/lib/auth";
import { assetUploadSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { v4 as uuid } from "uuid";

// POST /api/assets/upload
// 生成 Supabase Storage 签名上传 URL
export async function POST(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();

  const parsed = assetUploadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new AppError(
      "VALIDATION_ERROR",
      parsed.error.errors[0]?.message ?? "参数无效",
    ).toResponse(requestId);
  }

  const { entityType, entityId, mimeType, sizeBytes, originalName } = parsed.data;

  // 构建存储路径：<user_id>/<entity>/<entity_id>/<uuid>
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  const fileUuid = uuid();
  const storagePath = `${userId}/${entityType}/${entityId}/${fileUuid}${ext ? `.${ext}` : ""}`;

  const supabase = createAdminClient();

  // 生成签名上传 URL（5 分钟有效）
  const { data, error } = await supabase.storage
    .from("user-assets")
    .createSignedUploadUrl(storagePath);

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  // 在对应资产表中创建记录
  const assetTable = entityType === "record" ? "record_assets" : "resource_assets";
  const foreignKey = entityType === "record" ? "record_id" : "resource_id";

  const { error: insertError } = await supabase
    .from(assetTable)
    .insert({
      user_id: userId,
      [foreignKey]: entityId,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      ...(entityType === "resource" ? { original_name: originalName } : {}),
      sort_key: String(Date.now()),
    });

  if (insertError) {
    return new AppError("INTERNAL_ERROR", insertError.message).toResponse(requestId);
  }

  return Response.json({
    signedUrl: data.signedUrl,
    path: storagePath,
    token: data.token,
    requestId,
  });
}