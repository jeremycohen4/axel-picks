import { getSeason, redactFor } from "@/lib/kv";

export async function GET(req) {
  const user = JSON.parse(req.headers.get("x-user"));
  try {
    const season = await getSeason();
    return Response.json({ season: redactFor(season, user.id), user });
  } catch (e) {
    return Response.json({ error: e.message || "Database not configured." }, { status: 500 });
  }
}
