import { NextResponse } from "next/server";
import { list, del } from "@vercel/blob";

const DATA_PREFIX = "excel-dashboard-data";

export async function GET() {
  try {
    const { blobs } = await list({ prefix: DATA_PREFIX });
    const now = new Date();
    const expired: string[] = [];
    const active: unknown[] = [];

    await Promise.all(
      blobs.map(async (blob) => {
        try {
          const res = await fetch(blob.url);
          const data = await res.json();
          if (new Date(data.expiresAt) < now) {
            expired.push(blob.url);
          } else {
            active.push({
              id: data.id,
              headers: data.headers,
              fileName: data.fileName,
              uploadedAt: data.uploadedAt,
              expiresAt: data.expiresAt,
              rowCount: data.rowCount,
              blobUrl: blob.url,
            });
          }
        } catch {
          // skip unreadable blobs
        }
      })
    );

    if (expired.length > 0) await del(expired);

    // Sort by uploadedAt ascending
    const sorted = (active as { uploadedAt: string }[]).sort(
      (a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
    );

    return NextResponse.json({ datasets: sorted });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ datasets: [] });
  }
}
