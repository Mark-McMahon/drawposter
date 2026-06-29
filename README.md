# drawposter 🎭✏️

A real-time, online multiplayer party game — the classic **imposter word game**,
but instead of giving a one-word clue, **each player draws a single stroke** on a
shared canvas. Most players know the secret word; the imposter doesn't, and has
to add believable strokes to a picture they can't read while the group hunts them
down with a **live, continuous vote**.

> 🚧 **Status:** design phase. The full game design lives in
> [`requirements.md`](./requirements.md). No application code yet.

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
- [ ] Category word packs (with hand-paired decoys)
- [ ] Screen-by-screen UX flow (lobby → draw/vote → reveal)
- [ ] Tech stack & architecture (server-authoritative real-time)
- [ ] Implementation
