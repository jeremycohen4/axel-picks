# Axel Picks

A two-player Premier League pick'em, built as a real web app: server-side
auth, a shared database, hidden picks enforced on the server (not just in
the UI), and a "Sync now" feature that asks Claude to check the real
Premier League for kickoff times and results.

## What's inside

- `app/` — the Next.js app (App Router). `app/page.js` is the whole UI;
  `app/api/*` are the server routes.
- `lib/teams.js` — fixtures, seed picks/results, scoring, and UK
  kickoff-time helpers. Plain data, no secrets.
- `lib/auth.js` / `lib/session.js` — password checking (bcrypt) and signed
  session cookies (JWT via `jose`). `session.js` is edge-safe and is what
  `middleware.js` uses to protect the API routes.
- `lib/kv.js` — the shared season state, stored in Redis, plus the
  redaction logic that strips the other player's hidden picks before they
  ever leave the server.

## Deploy it (about 10 minutes)

### 1. Push this to GitHub
Unzip this folder, then from inside it:
```
git init
git add .
git commit -m "Axel Picks"
```
Create a new empty repo on GitHub (github.com/new — don't add a README
there), then follow the "push an existing repository" instructions it
gives you.

### 2. Import it into Vercel
Go to [vercel.com/new](https://vercel.com/new), sign in (free, no card
needed), and import the GitHub repo you just created. Leave all the build
settings on their defaults and click **Deploy**. It'll fail on the first
try — that's expected, it needs the database and secret from the next two
steps first.

### 3. Add the database
In your new Vercel project: **Storage** tab → **Create Database** →
**Marketplace Database Providers** → choose **Upstash** → **Redis**. Pick
the free tier and connect it to this project. Vercel automatically adds
`KV_REST_API_URL` and `KV_REST_API_TOKEN` to your project's environment
variables — you don't need to copy anything by hand.

### 4. Add the two environment variables
In **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `AUTH_SECRET` | A random string — generate one with `openssl rand -base64 32` in a terminal, or just mash the keyboard for 40+ characters |
| `ANTHROPIC_API_KEY` | A key from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) — only needed for the "Sync now" feature. Skip this if you're fine entering results by hand on the Results tab; everything else works without it |

### 5. Redeploy
Go to the **Deployments** tab, click the **⋯** on the most recent one, and
**Redeploy**. This time it'll succeed. Vercel gives you a URL like
`axel-picks.vercel.app` — that's the real, shareable link. Send it to
Michael.

### 6. (Optional) Use your own domain
**Settings → Domains** → add e.g. `picks.goaxel.com`, then add the CNAME
record it shows you wherever your domain's DNS is managed.

## Changing the passwords

Passwords are hashed, not stored in plain text, so you can't just edit a
string. To set new ones:

```
node -e "console.log(require('bcryptjs').hashSync('yourNewPassword', 10))"
```

Paste the output into `lib/auth.js` (there's a `HASHES` object near the
top), commit, and push — Vercel redeploys automatically.

## About the live sync

"Sync now" and the automatic per-matchweek check both call Claude's API
with web search turned on, asking it to look up that matchweek's real
kickoff times and any finished results. It's billed per call on your
Anthropic account — for a couple of syncs a week this is normally a small
fraction of a cent, but it's real usage, not free the way it was inside
the Claude artifact. If you'd rather not set up billing for it, just leave
`ANTHROPIC_API_KEY` unset — the app works fine without it, you'll just
enter results and lock times by hand on the Results and Picks tabs like
the original version.

## Local development

```
npm install
cp .env.example .env.local   # fill in AUTH_SECRET at least
npm run dev
```
You'll also need a Redis database for local dev — either provision one
from Upstash's own console (upstash.com) and put its `UPSTASH_REDIS_REST_URL`
/ `UPSTASH_REDIS_REST_TOKEN` in `.env.local` as `KV_REST_API_URL` /
`KV_REST_API_TOKEN`, or just develop against the deployed database by
pulling its env vars with `vercel env pull .env.local` once step 3 above
is done.
