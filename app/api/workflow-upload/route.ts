import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession, canManage } from "@/lib/session";

// Cấp token để trình duyệt upload ảnh THẲNG lên Vercel Blob (không qua giới hạn 4.5MB của function).
// Chỉ Manager/Admin. Ảnh lưu public để nhúng vào bước quy trình.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSession(req);
  if (!user || !canManage(user.role)) {
    return NextResponse.json({ error: "Chỉ Manager/Admin được tải tài liệu" }, { status: 403 });
  }
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"],
        maximumSizeInBytes: 10 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ by: user.username }),
      }),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload lỗi (cần cấu hình Vercel Blob)" },
      { status: 400 }
    );
  }
}
