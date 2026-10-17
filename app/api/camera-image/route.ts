import { NextRequest, NextResponse } from "next/server";
import { CAMERA_IMG_BASE } from "@/lib/cameras";

// Lấy hộ ảnh camera (dùng khi ghép nhiều ảnh: trình duyệt cần ảnh cùng domain
// mới vẽ lên canvas được). Chỉ gọi khi bấm Copy/Tải nhiều ảnh, không dùng để xem thường.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }
  try {
    const res = await fetch(`${CAMERA_IMG_BASE}?id=${id}&t=${Date.now()}`, {
      cache: "no-store",
      // Không gửi Referer (web Sở GTVT chặn 403 khi có Referer lạ).
      referrerPolicy: "no-referrer",
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
      signal: AbortSignal.timeout(10_000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      return NextResponse.json({ error: `Nguồn trả ${res.status}` }, { status: 502 });
    }
    return new NextResponse(await res.arrayBuffer(), {
      headers: { "Content-Type": type, "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Không lấy được ảnh" }, { status: 502 });
  }
}
