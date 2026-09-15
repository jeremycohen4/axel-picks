import { NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "./lib/session";

export const config = {
  matcher: ["/api/season", "/api/action"],
};

export async function middleware(req) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = await verifySessionToken(token);
  if (!payload) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const headers = new Headers(req.headers);
  headers.set("x-user", JSON.stringify({ id: payload.id, name: payload.name, color: payload.color }));
  return NextResponse.next({ request: { headers } });
}
