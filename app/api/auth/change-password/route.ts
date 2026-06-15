import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken, verifyPassword, hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const session = req.cookies.get("session")?.value;
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const payload = await verifyToken(session);
        if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { currentPassword, newPassword } = await req.json();
        if (!currentPassword || !newPassword) {
            return NextResponse.json({ error: "Missing passwords" }, { status: 400 });
        }

        const client = await db.connect();
        try {
            const res = await client.query("SELECT password_hash FROM users WHERE id = $1", [payload.userId]);
            if (res.rows.length === 0) {
                return NextResponse.json({ error: "User not found" }, { status: 404 });
            }

            const isValid = await verifyPassword(currentPassword, res.rows[0].password_hash);
            if (!isValid) {
                return NextResponse.json({ error: "Current password is wrong" }, { status: 400 });
            }

            const newHash = await hashPassword(newPassword);
            await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, payload.userId]);

            return NextResponse.json({ ok: true });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Change password error:", err);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
