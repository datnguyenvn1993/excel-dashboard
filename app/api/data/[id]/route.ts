import { NextRequest, NextResponse } from "next/server";
import { list, del } from "@vercel/blob";

const DATA_PREFIX = "excel-dashboard-data";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { blobs } = await list({ prefix: DATA_PREFIX + "-" + id });
    if (blobs.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const res = await fetch(blobs[0].url);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { blobs } = await list({ prefix: DATA_PREFIX + "-" + id });
    if (blobs.length > 0) await del(blobs.map((b) => b.url));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
