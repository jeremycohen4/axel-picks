// Edge-safe: only jose, no bcrypt. Import this from middleware.js.
// lib/auth.js (which does password hashing) imports from here too.
import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-me-before-deploying"
);

export const SESSION_COOKIE = "session";

export async function makeSessionToken(player) {
  return await new SignJWT({
    id: player.id,
    name: player.name,
    color: player.color,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(secret);
}

export async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}
