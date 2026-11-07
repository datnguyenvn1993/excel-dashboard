import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

/** Người dùng đang đăng nhập (từ cookie session), hoặc null. */
export async function getSession(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  return token ? await verifyToken(token) : null;
}

/** Manager và admin được chỉnh sửa (quy trình...). */
export function canManage(role: string | undefined | null): boolean {
  return role === "admin" || role === "manager";
}
