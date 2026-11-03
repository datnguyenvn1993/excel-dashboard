import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

/** Người dùng đang đăng nhập (từ cookie session), hoặc null. */
export async function getSession(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  return token ? await verifyToken(token) : null;
}
