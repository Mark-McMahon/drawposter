# drawposter 🎭✏️

A real-time, online multiplayer party game — the classic **imposter word game**,
but instead of giving a one-word clue, **each player draws a single stroke** on a
shared canvas. Most players know the secret word; the imposter doesn't, and has
to add believable strokes to a picture they can't read while the group hunts them
down with a **live, continuous vote**.

> ✅ **Status:** playable. The full game design lives in
> [`requirements.md`](./requirements.md); this repo now implements it as a
> server-authoritative real-time web app.

## Run it

```bash
npm install
npm run dev      # hot-reload dev server on http://localhost:3000
# or, for a production build:
npm run build && npm start
```

Open the URL on each player's device (phone or laptop), create a room, and share
the 6-digit code. `npm test` runs the game-logic + fuzzy-matcher test suite.

Set `PORT` to change the port (e.g. `PORT=8080 npm start`).

## How it's built

- **Server-authoritative** (`src/`): the secret word, roles, votes and the
  execution threshold all live on the server. State is redacted **per recipient**
  before being sent, so the imposter's client literally never receives the word
  (`src/views.ts`) — it can't be recovered via dev tools.
- **Real-time** over a single WebSocket; the server broadcasts a fresh redacted
  snapshot to every player on each change (`src/server.ts`).
- **Game engine** (`src/room.ts`) is transport-agnostic and time-injected, so the
  whole rules set — strict-rotation turns + per-turn timer, continuous live
  voting, instant >½ execution, the steal-the-win guess, the disconnect guard,
  2-imposter continuation, and scoring — is covered by deterministic unit tests
  (`test/run.ts`).
- **Client** (`public/`) is dependency-free vanilla JS: a `<canvas>` for stroke
  capture, a live public vote tally, the role panel, and the end-of-round reveal
  with a saveable picture and running scoreboard.

## The pitch

- One **shared canvas** that builds up one stroke at a time — the picture itself
  is the imposter's only clue.
- Voting is **live and continuous**: switch your vote any time (even mid-stroke),
  the tally is public, and the moment anyone crosses *more-than-half* of living
  players they're instantly executed.
- A **single execution decides it** — catch the imposter and the group wins (the
  caught imposter gets one guess to steal it back); execute an innocent and the
  imposter wins.
- 3–12 players, 1 or 2 imposters, hand-paired decoy words, category hints, and a
  running scoreboard across a series of rounds.

See **[`requirements.md`](./requirements.md)** for the complete rules, win
conditions, settings, and edge cases.

## Roadmap

- [x] Game design / rules spec
- [x] Category word packs (with hand-paired decoys)
- [x] Screen-by-screen UX flow (lobby → draw/vote → reveal)
- [x] Tech stack & architecture (server-authoritative real-time)
- [x] Implementation
