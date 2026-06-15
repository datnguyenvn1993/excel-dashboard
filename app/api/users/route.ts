import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken, hashPassword } from "@/lib/auth";

// Quick helper to check if caller is admin
async function requireAdmin(req: NextRequest) {
    const session = req.cookies.get("session")?.value;
    if (!session) return null;
    const payload = await verifyToken(session);
    if (!payload || payload.role !== "admin") return null;
    return payload;
}

export async function GET(req: NextRequest) {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const client = await db.connect();
    try {
        const res = await client.query(`
      SELECT id, username, role, display_name, created_at 
      FROM users ORDER BY created_at ASC
    `);
        return NextResponse.json(res.rows);
    } finally {
        client.release();
    }
}

export async function POST(req: NextRequest) {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    try {
        const { username, password, role, display_name } = await req.json();
        if (!username || !password || !role) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const client = await db.connect();
        try {
            const hashed = await hashPassword(password);
            const res = await client.query(
                `INSERT INTO users (username, password_hash, role, display_name) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
                [username, hashed, role, display_name]
            );
            return NextResponse.json({ ok: true, id: res.rows[0].id });
        } catch (e: any) {
            if (e.code === '23505') return NextResponse.json({ error: "Username exists" }, { status: 400 });
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    try {
        const { id, role, display_name, password } = await req.json();
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

        const client = await db.connect();
        try {
            if (password) {
                const hashed = await hashPassword(password);
                await client.query(
                    `UPDATE users SET role = $1, display_name = $2, password_hash = $3 WHERE id = $4`,
                    [role, display_name, hashed, id]
                );
            } else {
                await client.query(
                    `UPDATE users SET role = $1, display_name = $2 WHERE id = $3`,
                    [role, display_name, id]
                );
            }
            return NextResponse.json({ ok: true });
        } finally {
            client.release();
        }
    } catch (err) {
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

        // Prevent deleting self
        if (parseInt(id) === admin.userId) {
            return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
        }

        const client = await db.connect();
        try {
            await client.query(`DELETE FROM users WHERE id = $1`, [id]);
            return NextResponse.json({ ok: true });
        } finally {
            client.release();
        }
    } catch (err) {
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
