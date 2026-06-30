// Shared domain + protocol types for drawposter.
// The server is authoritative: the secret word and roles live here and are
// redacted per-recipient before being sent to clients (see views.ts).

export type Role = 'innocent' | 'imposter';

export type Phase = 'lobby' | 'playing' | 'guessing' | 'reveal';

export type Winner = 'innocents' | 'imposters';

export interface Point {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface Stroke {
  playerId: string;
  color: string;
  points: Point[];
}

export interface Settings {
  imposterCount: 1 | 2;
  hint: boolean; // show category to imposter
  decoy: boolean; // give a paired decoy word to imposter
  turnSeconds: number; // ~15-20
  categories: string[]; // active category names
}

export interface Player {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  // round-scoped
  alive: boolean;
  role: Role | null;
  // running scoreboard
  score: number;
}

export interface RoundResult {
  winner: Winner;
  word: string;
  reason: string;
  guess?: string;   // the wrong word a caught imposter typed (omitted if they gave up or guessed right)
  guesser?: string; // name of the imposter who made that wrong guess
}

// ---- Client -> Server messages ----
export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; playerId: string }
  | { t: 'settings'; settings: Partial<Settings> }
  | { t: 'start' }
  | { t: 'stroke'; points: Point[] }
  | { t: 'vote'; target: string | null }
  | { t: 'guess'; word: string }
  | { t: 'guessSkip' }
  | { t: 'kick'; playerId: string }
  | { t: 'leave' }
  | { t: 'ping' };

// ---- Server -> Client messages ----
export interface SelfView {
  id: string;
  isHost: boolean;
  role: Role | null;
  // innocents see the word; imposters never do (until reveal).
  word: string | null;
  // imposter-only aids (depending on settings)
  decoy: string | null;
  category: string | null;
  alive: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  alive: boolean;
  // role only populated at reveal
  role: Role | null;
  votesReceived: number;
  votingFor: string | null; // who this player currently votes for (public)
  score: number; // running scoreboard total
}

export interface StateView {
  t: 'state';
  code: string;
  phase: Phase;
  hostId: string;
  settings: Settings;
  self: SelfView;
  players: PlayerView[];
  strokes: Stroke[];
  // playing
  currentTurnId: string | null;
  turnEndsAt: number | null; // epoch ms
  livingCount: number;
  threshold: number;
  // guessing
  guessingId: string | null;
  // reveal
  result: RoundResult | null;
  revealStrokes: Stroke[] | null;
  // catalog info for lobby
  allCategories: string[];
}

export type ServerMessage =
  | StateView
  | { t: 'joined'; code: string; playerId: string }
  | { t: 'error'; message: string }
  | { t: 'kicked' }
  | { t: 'pong' };
