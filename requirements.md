# drawposter — Requirements

A real-time, online multiplayer social-deduction party game. It's the classic
"imposter word game," but **instead of giving a one-word clue, each player draws
a single stroke** on a shared canvas. Most players know the secret word; the
imposter doesn't — and has to add believable strokes to a picture they can't read
while the group hunts them down with a live, continuous vote.

> **Scope of this document:** game design / rules only. No implementation is
> specified here beyond the constraints the rules impose (e.g. server-authoritative
> state). This is the agreed shared understanding to build from.

---

## 1. Core concept

- **Genre:** social deduction (imposter / hidden-role).
- **Twist:** clues are *drawn*, not spoken. One clue = **one stroke**.
- **Surface:** a **single shared canvas** that **accumulates** strokes into one
  collective picture of the secret word. The evolving picture is the imposter's
  primary source of information.
- **Tension:** the longer a round goes, the more strokes the imposter is forced
  to contribute — and the more likely they expose themselves. The game is
  self-balancing; no artificial clock is needed.

## 2. Platform & players

- **Online multiplayer.** Each player on their own device (phone / laptop).
- **Rooms** joined via a **6-digit code**. One **host** owns the room.
- **3–12 players.**
- **Server-authoritative.** The secret word, roles, votes, and the vote
  threshold all live on the server. **The imposter's client never receives the
  word** — it cannot be recovered via dev tools.

## 3. Roles

| Role | Knows | Goal |
|------|-------|------|
| **Innocent** | the secret word | identify & execute the imposter(s) without ever executing an innocent |
| **Imposter** | that they are the imposter (+ optional hint/decoy) | survive; or get caught and steal the win by guessing the word |

- **Imposter count:** host sets **1 or 2**. (No minimum-player guard — 2 imposters
  is *allowed* even in tiny lobbies; see §11.)
- **Two imposters know each other** and may coordinate — alibi each other and
  stack votes to bait the mob into a fatal mistake.

## 4. The drawing

- **One shared canvas;** strokes accumulate; never auto-wiped mid-round.
- **Strict rotation:** turns pass around the table; **only the active player may
  draw, exactly one stroke per turn**, then the turn advances.
- **The active drawer's name is shown** — strokes are attributable in the moment.
  Deduction is about *stroke quality* (does this stroke fit the emerging picture?),
  not whodunit.
- **A "stroke"** = one continuous **pen-down → pen-up** (any path, any shape).
- **Per-player fixed color** (also aids the end-of-game picture readability).
- **Strokes are unconstrained** (no length/extent limits). Rationale: a sabotage
  scribble is *self-incriminating* — it makes the drawer the obvious vote target —
  so the social mechanic polices griefing without code limits.
- **Per-turn timer ≈ 20s** (host-configurable, ~15–20s). If it expires, the turn
  auto-passes.
- **No overall game clock.** Drawing cycles indefinitely until an execution ends
  the game (§6). It is a **pure standoff**.

## 5. Voting — continuous & live

- Every **living** player holds a single vote they may **cast or switch at any
  time, even mid-stroke**. Tap a player to point your vote; tap again / tap
  another to switch.
- **Abstaining is allowed** (hold no vote). **No self-voting.**
- **Fully public, real-time tally:** everyone sees who is currently voting for
  whom, updating live. Open bandwagons, panic, and last-second switches are
  intended drama.
- **Threshold = more than half of living players** → `floor(living / 2) + 1`.
- The **instant** any single player meets the threshold, they are **executed
  immediately**. This is the only death mechanic.

## 6. Win / loss

A **single execution decides the game** in the 1-imposter mode.

### 1 imposter
- **Execute the imposter → group wins.** The caught imposter then gets **one
  last-chance guess** at the word (§7); a correct guess **steals the win** for
  the imposter.
- **Execute an innocent → imposters win immediately.**

### 2 imposters (the "catch all, zero mistakes" variant)
- The group must **execute both imposters** and **never execute an innocent**.
- **Any innocent execution → imposters win immediately.**
- A correctly-executed imposter is **revealed and removed**, then **spectates**;
  the game continues hunting the remaining imposter.
- **Each caught imposter may take the last-chance guess (§7).** A **correct guess
  immediately steals the win for the imposter team** — even if the other imposter
  was never found. (Deliberately high-variance.)

> *Note:* parity-style win conditions were rejected — death here is **vote-only**,
> so imposters cannot thin the herd by killing, and parity would almost never
> trigger. "Catch all, zero wrong kills" fits a vote-only game and is symmetric
> across both modes.

## 7. Steal-the-win guess

- A caught imposter **types the word** (free-text).
- The **server checks** it against the answer with **fuzzy / synonym tolerance**.
- Correct → that imposter (1-imposter) or the imposter **team** (2-imposter) wins.

## 8. Disconnects

- A dropped/leaving player is **removed from the living count**, and **their
  votes are cleared**, so the **threshold recomputes** cleanly.
- **Guard:** if a player leaving would *instantly* push someone over the
  threshold, **do not auto-execute** — require a fresh vote to cross it. Prevents
  phantom kills caused by a disconnect.

## 9. Series & scoring

- A session is a **series of rounds** with a **running scoreboard**.
- **Team points per round** awarded to the winning side (surviving innocents /
  the imposter team).
- **Imposter assignment: pure random each round** (back-to-back repeats allowed).
- **Host controls:** owns the room, **starts each round**, and may **kick players
  and change settings at any time** (including between rounds).

## 10. End-of-round reveal

On game end: reveal the **secret word** and **all roles**, and **keep/show the
final shared picture** (saveable / shareable). Then return to the lobby / next
round.

## 11. Words & content

- **Curated category packs** (e.g. Food, Animals, Objects, …).
- The **host selects active categories**; the **server picks a random word** per
  round.
- **Decoy** (when the setting is on): each word ships with a **hand-paired, close
  decoy** (e.g. cat→dog, guitar→violin) given to the imposter so they can draw
  *confidently wrong but plausible*.
- **Hint** (when on): the **category** is shown to the imposter.

## 12. Settings (host-configurable) & defaults

| Setting | Options | Default |
|---------|---------|---------|
| Imposter count | 1 or 2 | **1** |
| Category hint to imposter | on / off | **off** |
| Decoy word to imposter | on / off | **off** |
| Per-turn timer | ~15–20s | **20s** |
| Active categories | any subset | **all** |

Default config is the **purest / hardest** game: 1 imposter relying solely on the
canvas. Groups can enable hint and/or decoy to make the imposter's life easier.

## 13. Notes, edge cases & accepted risks

- **Hint + Decoy together is redundant** — the decoy already gives the imposter a
  word to draw. Treat as allowed but unnecessary.
- **No 2-imposter player minimum (accepted):** tiny lobbies (e.g. 2 imposters vs
  1 innocent) are degenerate but permitted — "at your own fun."
- **Blind first turn (intended):** with hint & decoy both off (the default), an
  imposter who draws early does so with zero information. This is intended
  hard-mode, not a bug.
- **No grace period:** votes are live from second one; a coordinated majority
  *can* execute someone before any strokes exist (risky, but truest to
  "vote at any time").
- **3-player dynamic:** threshold is 2, so the imposter can force a wrong kill by
  bandwagoning with a single innocent's vote against the other. Tense by design.
