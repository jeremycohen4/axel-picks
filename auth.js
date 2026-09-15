// Server-only, Node runtime. Never import this from middleware or a client
// component — it pulls in bcrypt, which isn't edge-safe. Use lib/session.js
// for anything that runs in middleware.
import bcrypt from "bcryptjs";
import { PLAYERS_PUBLIC } from "./teams";

export { makeSessionToken, verifySessionToken, SESSION_COOKIE } from "./session";

// To change a password: run
//   node -e "console.log(require('bcryptjs').hashSync('newPassword', 10))"
// and paste the result in here.
const HASHES = {
  jeremy: "$2b$10$LeBs3PG8sdGZhb9x5a/KWuKe8A6dVvKhwdagbE/yIXT.SC.WVY/6.", // OldTrafford26
  michael: "$2b$10$v.u.cOBmkn4ELPbeiyXHmOpaaVoQQdjzCfzNUZSuI5bwDkBaR9U2q", // Anfield26
};

export async function verifyLogin(username, password) {
  const u = (username || "").trim().toLowerCase();
  const found = PLAYERS_PUBLIC.find(
    (p) => p.id === u || p.name.toLowerCase() === u
  );
  if (!found || !HASHES[found.id]) return null;
  const ok = await bcrypt.compare(password || "", HASHES[found.id]);
  return ok ? found : null;
}
