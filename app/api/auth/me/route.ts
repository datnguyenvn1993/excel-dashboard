import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
    const session = req.cookies.get("session")?.value;
    if (!session) {
        return NextResponse.json({ user: null }, { status: 401 });
    }

    const payload = await verifyToken(session);
    if (!payload) {
        return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
        user: {
            id: payload.userId,
            role: payload.role,
            username: payload.username,
            display_name: payload.display_name,
        }
    });
}
