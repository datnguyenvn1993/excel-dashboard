import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const { username, password } = await req.json();
        if (!username || !password) {
            return NextResponse.json({ error: "Missing username or password" }, { status: 400 });
        }

        const client = await db.connect();
        let user;
        try {
            const res = await client.query("SELECT * FROM users WHERE username = $1", [username]);
            if (res.rows.length === 0) {
                return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
            }
            user = res.rows[0];
        } finally {
            client.release();
        }

        const isValid = await verifyPassword(password, user.password_hash);
        if (!isValid) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        const token = await createToken({
            userId: user.id,
            role: user.role,
            username: user.username,
            display_name: user.display_name,
        });

        const response = NextResponse.json({
            ok: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                display_name: user.display_name,
            }
        });

        // Set cookie
        response.cookies.set("session", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60, // 7 days
            path: "/",
        });

        return response;
    } catch (err: unknown) {
        console.error("Login Error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
