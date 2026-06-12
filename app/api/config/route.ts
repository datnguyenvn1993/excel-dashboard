import { NextResponse } from "next/server";
import { put, list, del } from "@vercel/blob";

const CONFIG_PREFIX = "excel-dashboard-config";

export async function GET() {
  try {
    const { blobs } = await list({ prefix: CONFIG_PREFIX });
    if (blobs.length === 0) {
      return NextResponse.json({ columns: [], createDateColumn: "Create Date" });
    }
    const res = await fetch(blobs[0].url);
    const config = await res.json();
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ columns: [], createDateColumn: "Create Date" });
  }
}

export async function POST(request: Request) {
  try {
    const config = await request.json();
    const { blobs } = await list({ prefix: CONFIG_PREFIX });
    if (blobs.length > 0) {
      await del(blobs.map((b) => b.url));
    }
    await put(CONFIG_PREFIX + ".json", JSON.stringify(config), {
      access: "public",
      addRandomSuffix: false,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
