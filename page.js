"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  FIXTURES,
  GAMEWEEKS,
  PLAYERS_PUBLIC,
  LOGO_COLORS,
  LOCK_LEAD_MINUTES,
  pointsFor,
  fixtureDate,
  countdown,
  toLocalInputValue,
  lockLabel,
  defaultLockFor,
} from "@/lib/teams";

const POLL_MS = 20000;

function Wordmark({ size }) {
  return (
    <span className="ap-word" style={size ? { fontSize: size } : undefined}>
      {"AXEL".split("").map((ch, i) => (
        <span key={i} style={{ color: LOGO_COLORS[i] }}>
          {ch}
        </span>
      ))}
    </span>
  );
}

function lockTimeFromClient(season, gw) {
  const o = season && season.lockOverrides[gw];
  return o ? new Date(o) : defaultLockFor(gw);
}

/* ------------------------------- app ------------------------------- */

export default function AxelPicksApp() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [season, setSeason] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("picks");
  const [now, setNow] = useState(() => Date.now());
  const [syncingGw, setSyncingGw] = useState(null);
  const [syncError, setSyncError] = useState("");
  const [gw, setGw] = useState(null);
  const autoSynced = useRef(new Set());

  const firstUnplayedGw = useMemo(() => {
    if (!season) return 1;
    for (const g of GAMEWEEKS) {
      const games = FIXTURES.filter((f) => f.gw === g);
      if (games.some((f) => !season.results[f.n])) return g;
    }
    return 38;
  }, [season]);

  useEffect(() => {
    if (season && gw === null) setGw(firstUnplayedGw);
  }, [season, gw, firstUnplayedGw]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  /* ------------------------------ auth ------------------------------ */

  const checkAuth = useCallback(async () => {
    try {
      const r = await fetch("/api/me");
      if (r.status === 401) {
        setUser(null);
        return;
      }
      const j = await r.json();
      setUser(j.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const fetchSeason = useCallback(async () => {
    try {
      const r = await fetch("/api/season");
      if (r.status === 401) {
        setUser(null);
        return;
      }
      const j = await r.json();
      if (!r.ok) {
        setLoadError(j.error || "Couldn't load the season.");
        return;
      }
      setSeason(j.season);
      setLoadError("");
    } catch {
      setLoadError("Couldn't reach the server. Retrying…");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchSeason();
    const t = setInterval(fetchSeason, POLL_MS);
    return () => clearInterval(t);
  }, [user, fetchSeason]);

  const login = useCallback(async (username, password) => {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const j = await r.json();
    if (!r.ok) return j.error || "That username and password don't match.";
    setUser(j.user);
    return null;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSeason(null);
    setGw(null);
  }, []);

  /* ------------------------------ act -------------------------------- */

  // The single mutation call every view uses. Optimistic-ish: shows
  // "Saving…" while in flight, then replaces season with the server's
  // authoritative (and correctly redacted) copy.
  const act = useCallback(async (type, payload) => {
    setSaving(true);
    try {
      const r = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...payload }),
      });
      if (r.status === 401) {
        setUser(null);
        return { error: "Signed out — sign in again." };
      }
      const j = await r.json();
      if (!r.ok) return { error: j.error || "That didn't work." };
      setSeason(j.season);
      setLoadError("");
      return { season: j.season };
    } catch {
      return { error: "Couldn't reach the server. Try again." };
    } finally {
      setSaving(false);
    }
  }, []);

  const runSync = useCallback(
    async (g) => {
      setSyncingGw(g);
      setSyncError("");
      const res = await act("sync", { gw: g });
      if (res.error) setSyncError(res.error);
      setSyncingGw(null);
    },
    [act]
  );

  // Auto-sync a matchweek once per visit, as long as it still has an
  // unplayed match.
  useEffect(() => {
    if (!season || gw === null) return;
    if (autoSynced.current.has(gw)) return;
    const games = FIXTURES.filter((f) => f.gw === gw);
    if (games.every((f) => season.results[f.n])) return;
    autoSynced.current.add(gw);
    runSync(gw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gw, season]);

  /* --------------------------- derived -------------------------------- */

  const lockTime = useCallback((g) => lockTimeFromClient(season, g), [season]);
  const isLocked = useCallback((g) => now >= lockTime(g).getTime(), [now, lockTime]);

  const standings = useMemo(() => {
    if (!season) return [];
    return PLAYERS_PUBLIC.map((p) => {
      let pts = 0, won = 0, drew = 0, lost = 0, dblUsed = 0, dblHit = 0;
      const byGw = {};
      for (const f of FIXTURES) {
        const res = season.results[f.n];
        if (!res) continue;
        const pick = (season.picks[p.id] || {})[f.n];
        if (!pick) continue;
        const dbl = (season.doubles[p.id] || {})[f.gw] === f.n;
        const got = pointsFor(pick, res, dbl);
        pts += got;
        byGw[f.gw] = (byGw[f.gw] || 0) + got;
        if (dbl) {
          dblUsed++;
          if (res === pick) dblHit++;
        }
        if (res === "D") drew++;
        else if (res === pick) won++;
        else lost++;
      }
      return { ...p, pts, won, drew, lost, dblUsed, dblHit, byGw };
    });
  }, [season]);

  const playedGws = useMemo(() => {
    if (!season) return [];
    return GAMEWEEKS.filter((g) => FIXTURES.some((f) => f.gw === g && season.results[f.n]));
  }, [season]);

  /* --------------------------- render --------------------------------- */

  if (user === undefined) {
    return (
      <div className="ap">
        <div className="ap-wrap" style={{ paddingTop: 40, color: "var(--dim)" }}>
          Loading…
        </div>
      </div>
    );
  }

  if (!user) return <Login onIn={login} />;

  if (!season) {
    return (
      <div className="ap" style={{ "--acc": user.color }}>
        <div className="ap-wrap" style={{ paddingTop: 40, color: "var(--dim)" }}>
          {loadError || "Loading the season…"}
        </div>
      </div>
    );
  }

  const other = PLAYERS_PUBLIC.find((p) => p.id !== user.id);
  const activeGw = gw ?? firstUnplayedGw;

  return (
    <div className="ap" style={{ "--acc": user.color }}>
      <div className="ap-rule">
        {LOGO_COLORS.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>

      <header className="ap-board">
        <div className="ap-board-in">
          <div className="ap-brand">
            <h1>
              <Wordmark />
              <span className="rest">Picks</span>
            </h1>
            <div className="ap-who">
              <span>{user.name}</span>
              <button onClick={logout}>Sign out</button>
            </div>
          </div>

          <div className="ap-score">
            {standings.map((s) => (
              <div className="ap-side" key={s.id}>
                <div className="nm" style={{ color: s.color }}>
                  {s.name}
                </div>
                <div className="pts">{s.pts}</div>
              </div>
            ))}
          </div>

          <div className="ap-status">
            <Countdown gw={activeGw} lockTime={lockTime} now={now} />
          </div>
        </div>
      </header>

      <div className="ap-wrap">
        <nav className="ap-nav">
          {[
            ["picks", "Picks"],
            ["table", "Table"],
            ["results", "Results"],
          ].map(([k, label]) => (
            <button key={k} data-on={tab === k ? "1" : "0"} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>

        {loadError && (
          <p className="ap-err" style={{ marginTop: -8 }}>
            {loadError}
          </p>
        )}

        {tab !== "table" && (
          <GwStepper
            gw={activeGw}
            setGw={setGw}
            season={season}
            isLocked={isLocked}
            syncing={syncingGw === activeGw}
            syncError={syncError}
            onSync={() => runSync(activeGw)}
          />
        )}

        {tab === "picks" && (
          <PicksView
            gw={activeGw}
            season={season}
            user={user}
            other={other}
            locked={isLocked(activeGw)}
            lockTime={lockTime}
            act={act}
          />
        )}

        {tab === "results" && <ResultsView gw={activeGw} season={season} act={act} />}

        {tab === "table" && (
          <TableView standings={standings} playedGws={playedGws} season={season} />
        )}
      </div>

      {saving && <div className="ap-saving">Saving…</div>}
    </div>
  );
}

/* --------------------------- countdown ---------------------------- */

function Countdown({ gw, lockTime, now }) {
  const lt = lockTime(gw);
  const left = lt.getTime() - now;
  if (left > 0) {
    return (
      <>
        <span>
          Matchweek <b>{gw}</b> picks lock in
        </span>
        <span className="hot">{countdown(left)}</span>
        <span>· {lockLabel(lt)} your time</span>
      </>
    );
  }
  return (
    <>
      <span>
        Matchweek <b>{gw}</b> is
      </span>
      <span className="open">locked — picks are open to both of you</span>
    </>
  );
}

/* -------------------------- gw stepper ---------------------------- */

function GwStepper({ gw, setGw, season, isLocked, syncing, syncError, onSync }) {
  const games = FIXTURES.filter((f) => f.gw === gw);
  const done = games.filter((f) => season.results[f.n]).length;
  const syncedAt = season.syncedAt && season.syncedAt[gw];

  let syncLabel;
  if (syncing) syncLabel = "Syncing…";
  else if (done === games.length) syncLabel = "All results in";
  else if (syncError) syncLabel = syncError;
  else if (syncedAt)
    syncLabel = `Synced ${countdown(Date.now() - new Date(syncedAt).getTime()) || "just now"} ago`;
  else syncLabel = "Not synced yet";

  return (
    <>
      <div className="ap-gw">
        <button className="step" onClick={() => setGw(gw - 1)} disabled={gw <= 1} aria-label="Previous matchweek">
          ‹
        </button>
        <select value={gw} onChange={(e) => setGw(Number(e.target.value))} aria-label="Matchweek">
          {GAMEWEEKS.map((g) => (
            <option key={g} value={g}>
              Matchweek {g}
            </option>
          ))}
        </select>
        <button className="step" onClick={() => setGw(gw + 1)} disabled={gw >= 38} aria-label="Next matchweek">
          ›
        </button>
        <div className="meta">
          {done === games.length ? "All results in" : isLocked(gw) ? "In play" : "Open for picks"}
        </div>
      </div>
      {done < games.length && (
        <div className="ap-syncbar">
          <span className={syncError ? "err" : "dim"}>{syncLabel}</span>
          <button className="ap-syncbtn" onClick={onSync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      )}
    </>
  );
}

/* --------------------------- picks view --------------------------- */

function PicksView({ gw, season, user, other, locked, lockTime, act }) {
  const [editingLock, setEditingLock] = useState(false);
  const [lockDraft, setLockDraft] = useState("");
  const [err, setErr] = useState("");
  const games = FIXTURES.filter((f) => f.gw === gw);
  const myPicks = season.picks[user.id] || {};
  const theirPicks = season.picks[other.id] || {};
  const myDouble = (season.doubles[user.id] || {})[gw];
  const theirDouble = (season.doubles[other.id] || {})[gw];
  const made = games.filter((f) => myPicks[f.n]).length;
  const confirmed = !!((season.submitted[user.id] || {})[gw]);
  const theirConfirmed = !!((season.submitted[other.id] || {})[gw]);
  const editable = !locked && !confirmed;

  const run = async (type, payload) => {
    setErr("");
    const res = await act(type, payload);
    if (res.error) setErr(res.error);
  };

  const setPick = (n, side) => run("setPick", { gw, n, side });
  const setDouble = (n) => run("setDouble", { gw, n });
  const confirmPicks = () => run("submit", { gw });
  const unlockPicks = () => run("unsubmit", { gw });
  const setLock = (val) => run("setLock", { gw, iso: val ? new Date(val).toISOString() : null });

  return (
    <>
      {err && <p className="ap-err" style={{ marginTop: -6, marginBottom: 12 }}>{err}</p>}

      <div className="ap-savebar">
        <div className="ap-savebar-status">
          {confirmed ? (
            <>
              <span className="ok">Picks locked in</span>
              <span className="dim">for Matchweek {gw}</span>
            </>
          ) : (
            <span className="dim">
              {made} of {games.length} picked — not saved yet
            </span>
          )}
        </div>
        {locked ? null : confirmed ? (
          <button className="ap-editbtn" onClick={unlockPicks}>
            Edit picks
          </button>
        ) : (
          <button
            className="ap-savebtn"
            disabled={made < games.length}
            onClick={confirmPicks}
            title={made < games.length ? "Pick a winner in every match first" : "Lock in your picks"}
          >
            Save & lock in
          </button>
        )}
      </div>

      <div className="ap-lockbar">
        <span>{myDouble ? "Double set" : games.length ? "No double yet" : ""}</span>
        <span>· locks {lockLabel(lockTime(gw))}</span>
        {!editingLock ? (
          <button
            className="edit"
            onClick={() => {
              setLockDraft(toLocalInputValue(lockTime(gw)));
              setEditingLock(true);
            }}
          >
            Change lock time
          </button>
        ) : (
          <>
            <input type="datetime-local" value={lockDraft} onChange={(e) => setLockDraft(e.target.value)} />
            <button
              className="edit"
              onClick={() => {
                if (lockDraft) setLock(lockDraft);
                setEditingLock(false);
              }}
            >
              Save
            </button>
            <button
              className="edit"
              onClick={() => {
                setLock(null);
                setEditingLock(false);
              }}
            >
              Use default
            </button>
          </>
        )}
      </div>

      {games.map((f) => {
        const mine = myPicks[f.n];
        const theirs = theirPicks[f.n];
        const res = season.results[f.n];
        const isDbl = myDouble === f.n;
        const theirDbl = theirDouble === f.n;
        const myPts = pointsFor(mine, res, isDbl);
        const theirPts = pointsFor(theirs, res, theirDbl);

        return (
          <div className="ap-row" key={f.n}>
            <div className="ap-row-top">
              <span className="dt">{fixtureDate(f)}</span>
              {res && (
                <span>· {res === "D" ? "Draw" : res === "H" ? `${f.home} won` : `${f.away} won`}</span>
              )}
              <button
                className="ap-x2"
                data-on={isDbl ? "1" : "0"}
                disabled={!editable || !mine}
                onClick={() => setDouble(f.n)}
                title={
                  !mine
                    ? "Pick a winner first"
                    : isDbl
                    ? "Remove the double"
                    : "Double this one: 6 if it wins, 0 if it's drawn or lost"
                }
              >
                2×
              </button>
            </div>

            <div className="ap-pick">
              {["H", "A"].map((side) => (
                <button
                  key={side}
                  className="ap-opt"
                  disabled={!editable}
                  data-mine={mine === side && !res ? "1" : "0"}
                  data-won={res && res !== "D" && res === side ? "1" : "0"}
                  onClick={() => setPick(f.n, side)}
                >
                  <span className="side">{side === "H" ? "H" : "A"}</span>
                  <span className="team">{side === "H" ? f.home : f.away}</span>
                  {mine === side && <span className="tag">YOUR PICK</span>}
                </button>
              ))}
            </div>

            <div className="ap-foot">
              {myPts !== null && (
                <span className="ap-chip">
                  You
                  <span className={`p ${myPts >= 3 ? "good" : myPts === 0 ? "bad" : ""}`}>
                    {myPts} pt{myPts === 1 ? "" : "s"}
                  </span>
                </span>
              )}
              {locked ? (
                <span className="ap-chip them">
                  {other.name}
                  <span className="p">{theirs ? (theirs === "H" ? f.home : f.away) : "no pick"}</span>
                  {theirDbl && <span className="p">2×</span>}
                  {theirPts !== null && (
                    <span className={`p ${theirPts >= 3 ? "good" : theirPts === 0 ? "bad" : ""}`}>
                      {theirPts} pt{theirPts === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
              ) : (
                <span className="ap-chip hidden-pick">
                  {other.name}'s pick is hidden until lock
                  {theirConfirmed ? " (saved)" : ""}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <p className="ap-note">
        Correct winner is 3 points, a draw is 1 point whoever you picked, a loss is 0. Your one
        double each matchweek is worth 6 if your team wins and nothing at all otherwise — you give
        up the draw point to take the swing. Picks save as you go, but they're only official once
        you hit "Save & lock in" — until then it's just a draft, and you can keep adjusting. Kickoff
        times and results here sync from the real Premier League automatically.
      </p>
    </>
  );
}

/* -------------------------- results view -------------------------- */

function ResultsView({ gw, season, act }) {
  const games = FIXTURES.filter((f) => f.gw === gw);
  const setResult = (n, r) => {
    const cur = season.results[n];
    act("setResult", { n, result: cur === r ? null : r });
  };

  return (
    <>
      <p className="ap-note" style={{ margin: "0 0 18px" }}>
        Results sync automatically from the real Premier League — this tab is a manual backstop for
        the rare case a sync misses one, or gets something wrong. Either of you can set a result
        here, and it updates the table for both.
      </p>
      {games.map((f) => (
        <div className="ap-row" key={f.n}>
          <div className="ap-row-top">
            <span className="dt">{fixtureDate(f)}</span>
            <span>· {f.home} v {f.away}</span>
          </div>
          <div className="ap-res">
            {[
              ["H", `${f.home} won`],
              ["D", "Draw"],
              ["A", `${f.away} won`],
            ].map(([k, label]) => (
              <button key={k} data-on={season.results[f.n] === k ? "1" : "0"} onClick={() => setResult(f.n, k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* --------------------------- table view --------------------------- */

function TableView({ standings, playedGws, season }) {
  const ranked = [...standings].sort((a, b) => b.pts - a.pts);
  const max = Math.max(1, ...playedGws.flatMap((g) => standings.map((s) => s.byGw[g] || 0)));

  return (
    <>
      <table className="ap-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Pts</th>
            <th>Won</th>
            <th>Drawn</th>
            <th>Lost</th>
            <th>2× hit</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((s) => (
            <tr key={s.id}>
              <td style={{ fontWeight: 600, color: s.color }}>{s.name}</td>
              <td className="big" style={{ color: s.color }}>
                {s.pts}
              </td>
              <td>{s.won}</td>
              <td>{s.drew}</td>
              <td>{s.lost}</td>
              <td>{s.dblUsed ? `${s.dblHit}/${s.dblUsed}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="ap-h3">By matchweek</h2>
      {playedGws.length === 0 ? (
        <p className="ap-note">No results are in yet. Enter them on the Results tab.</p>
      ) : (
        <table className="ap-table">
          <thead>
            <tr>
              <th>MW</th>
              {standings.map((s) => (
                <th key={s.id} colSpan={2} style={{ color: s.color }}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {playedGws.map((g) => {
              let run = {};
              standings.forEach((s) => {
                run[s.id] = playedGws.filter((x) => x <= g).reduce((a, x) => a + (s.byGw[x] || 0), 0);
              });
              return (
                <tr key={g}>
                  <td>{g}</td>
                  {standings.map((s) => (
                    <React.Fragment key={s.id}>
                      <td style={{ width: "34%" }}>
                        <span className="ap-bar">
                          <i style={{ width: `${((s.byGw[g] || 0) / max) * 100}%`, background: s.color }} />
                        </span>
                      </td>
                      <td className="big" style={{ fontSize: 16, color: s.color }}>
                        {s.byGw[g] || 0}
                        <span style={{ color: "var(--dim)", fontSize: 13, fontWeight: 400 }}> / {run[s.id]}</span>
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="ap-note">Each matchweek shows points won, then the running total.</p>
    </>
  );
}

/* ----------------------------- login ------------------------------ */

function Login({ onIn }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    const error = await onIn(u, p);
    setBusy(false);
    if (error) setErr(error);
  };

  return (
    <div className="ap">
      <div className="ap-login">
        <div className="ap-card">
          <h1>
            <Wordmark size={36} />
            <span className="rest">Picks</span>
          </h1>
          <p className="sub">Premier League 2026/27</p>

          <div className="ap-field">
            <label htmlFor="ap-u">Username</label>
            <input
              id="ap-u"
              value={u}
              autoComplete="username"
              onChange={(e) => setU(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="ap-field">
            <label htmlFor="ap-p">Password</label>
            <input
              id="ap-p"
              type="password"
              value={p}
              autoComplete="current-password"
              onChange={(e) => setP(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <button className="ap-go" onClick={submit} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {err && <p className="ap-err">{err}</p>}

          <div className="ap-legend">
            <b>How it works.</b> Each matchweek, pick a winner — home or away — in every match.
            Your team wins: 3 points. The match is a draw: 1 point either way. Your team loses: 0.
            Once a week, name one match as your double: win it and it's worth 6, but a draw or a
            loss on your double pays nothing. Picks stay hidden from each other until an hour before
            the first kickoff, then both sets open up. Kickoff times and results sync automatically
            from the real Premier League — no need to enter them by hand.
          </div>
        </div>
      </div>
    </div>
  );
}
