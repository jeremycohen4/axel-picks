import { Redis } from "@upstash/redis";
import {
  FIXTURES,
  seedPicksObj,
  seedResultsObj,
  defaultLockFor,
} from "./teams";

// Built lazily (only when a route actually touches the database), so a
// missing or not-yet-configured KV_REST_API_URL never breaks the build —
// it only surfaces as a clear error the first time something tries to
// read or write season data.
let _redis = null;
function redis() {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "No database configured — add an Upstash Redis database from the Storage tab in Vercel."
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

const KEY = "axel-picks-season-2627";

export function emptySeason() {
  return {
    picks: seedPicksObj(),
    doubles: { jeremy: {}, michael: {} },
    submitted: { jeremy: {}, michael: {} },
    results: seedResultsObj(),
    lockOverrides: {},
    syncedAt: {},
  };
}

export async function getSeason() {
  const s = await redis().get(KEY);
  if (!s) {
    const fresh = emptySeason();
    await redis().set(KEY, fresh);
    return fresh;
  }
  // Fill in any fields older saves might not have had.
  return {
    picks: s.picks || seedPicksObj(),
    doubles: s.doubles || { jeremy: {}, michael: {} },
    submitted: s.submitted || { jeremy: {}, michael: {} },
    results: s.results || seedResultsObj(),
    lockOverrides: s.lockOverrides || {},
    syncedAt: s.syncedAt || {},
  };
}

export async function saveSeason(season) {
  await redis().set(KEY, season);
}

export function lockTimeFor(season, gw) {
  const o = season.lockOverrides[gw];
  return o ? new Date(o) : defaultLockFor(gw);
}

export function isLocked(season, gw) {
  return Date.now() >= lockTimeFor(season, gw).getTime();
}

// Strips the other player's picks/doubles for any matchweek that hasn't
// locked yet, so a hidden pick never reaches the browser at all.
export function redactFor(season, userId) {
  const otherId = userId === "jeremy" ? "michael" : "jeremy";
  const picks = { [userId]: season.picks[userId] || {}, [otherId]: {} };
  const doubles = { [userId]: season.doubles[userId] || {}, [otherId]: {} };

  for (const [gwStr, n] of Object.entries(season.doubles[otherId] || {})) {
    if (isLocked(season, Number(gwStr))) doubles[otherId][gwStr] = n;
  }
  for (const [nStr, side] of Object.entries(season.picks[otherId] || {})) {
    const f = FIXTURES.find((f) => f.n === Number(nStr));
    if (f && isLocked(season, f.gw)) picks[otherId][nStr] = side;
  }

  return { ...season, picks, doubles };
}
