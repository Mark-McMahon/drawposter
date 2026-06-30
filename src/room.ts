// Server-authoritative game engine for a single room.
//
// Transport-agnostic: the Room mutates its own state and calls `onChange()`
// whenever a client-visible change happens (including timer-driven turn
// advances). The transport layer (server.ts) reacts to onChange by broadcasting
// redacted per-player views. A Scheduler is injected so tests can drive time.

import {
  Phase,
  Player,
  Point,
  RoundResult,
  Settings,
  Stroke,
  Winner,
} from './types';
import { matchGuess } from './fuzzy';
import { categoryNames, pickWord } from './words';

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

const realScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

// Distinct, high-contrast per-player colors (also aids final-picture readability).
const PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231',
  '#911eb4', '#42d4f4', '#f032e6', '#bfef45',
  '#fabed4', '#469990', '#9a6324', '#000000',
];

export const DEFAULT_SETTINGS: Settings = {
  imposterCount: 1,
  hint: false,
  decoy: false,
  turnSeconds: 20,
  categories: categoryNames(),
};

export interface RoomOpts {
  scheduler?: Scheduler;
  rng?: () => number;
  idGen?: () => string;
  onChange?: () => void;
}

let idCounter = 0;
function defaultIdGen(): string {
  idCounter += 1;
  return `p${idCounter.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export class Room {
  readonly code: string;
  players: Player[] = [];
  hostId = '';
  settings: Settings;
  phase: Phase = 'lobby';
  strokes: Stroke[] = [];

  // round-scoped secrets (never sent raw to clients; redacted in views)
  secretWord: string | null = null;
  decoyWord: string | null = null;
  category: string | null = null;

  // turn state
  turnOrder: string[] = [];
  turnIndex = 0;
  turnEndsAt: number | null = null;

  // votes: voterId -> targetId (only living voters; abstain = absent)
  votes = new Map<string, string>();

  // guessing / reveal
  guessingId: string | null = null;
  result: RoundResult | null = null;
  revealStrokes: Stroke[] | null = null;

  private turnTimer: unknown = null;
  private readonly sched: Scheduler;
  private readonly rng: () => number;
  private readonly idGen: () => string;
  private onChange: () => void;

  constructor(code: string, opts: RoomOpts = {}) {
    this.code = code;
    this.sched = opts.scheduler ?? realScheduler;
    this.rng = opts.rng ?? Math.random;
    this.idGen = opts.idGen ?? defaultIdGen;
    this.onChange = opts.onChange ?? (() => {});
    this.settings = { ...DEFAULT_SETTINGS, categories: [...DEFAULT_SETTINGS.categories] };
  }

  setOnChange(fn: () => void) {
    this.onChange = fn;
  }

  // ---------- lookups ----------

  getPlayer(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  livingPlayers(): Player[] {
    return this.players.filter((p) => p.alive && p.connected);
  }

  threshold(): number {
    return Math.floor(this.livingPlayers().length / 2) + 1;
  }

  get currentTurnId(): string | null {
    if (this.phase !== 'playing') return null;
    return this.turnOrder[this.turnIndex] ?? null;
  }

  private aliveByRole(role: 'imposter' | 'innocent'): Player[] {
    return this.players.filter((p) => p.alive && p.connected && p.role === role);
  }

  // ---------- lobby management ----------

  addPlayer(name: string): Player {
    const color = this.nextColor();
    const isFirst = this.players.filter((p) => p.connected).length === 0;
    const player: Player = {
      id: this.idGen(),
      name: this.cleanName(name),
      color,
      isHost: false,
      connected: true,
      // joins during a live round are spectators until the next round
      alive: this.phase === 'lobby',
      role: null,
      score: 0,
    };
    this.players.push(player);
    if (isFirst || !this.getPlayer(this.hostId)?.connected) {
      this.setHost(player.id);
    }
    this.onChange();
    return player;
  }

  private cleanName(name: string): string {
    const n = (name || '').trim().slice(0, 20);
    return n.length > 0 ? n : 'Player';
  }

  private nextColor(): string {
    const used = new Set(this.players.map((p) => p.color));
    for (const c of PALETTE) if (!used.has(c)) return c;
    // more players than palette: fall back to a generated hue
    const hue = (this.players.length * 47) % 360;
    return `hsl(${hue} 70% 45%)`;
  }

  private setHost(id: string) {
    this.hostId = id;
    for (const p of this.players) p.isHost = p.id === id;
  }

  private reassignHostIfNeeded() {
    const host = this.getPlayer(this.hostId);
    if (host && host.connected) return;
    const next = this.players.find((p) => p.connected);
    if (next) this.setHost(next.id);
    else this.hostId = '';
  }

  /** Permanently remove a player from the room (leave / kick from lobby). */
  removePlayer(id: string) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    this.players.splice(idx, 1);
    this.votes.delete(id);
    for (const [voter, target] of this.votes) if (target === id) this.votes.delete(voter);
    this.turnOrder = this.turnOrder.filter((pid) => pid !== id);
    this.reassignHostIfNeeded();
    this.onChange();
  }

  isEmpty(): boolean {
    return this.players.every((p) => !p.connected);
  }

  // ---------- settings ----------

  applySettings(host: string, partial: Partial<Settings>) {
    if (host !== this.hostId) return;
    const s = this.settings;
    if (partial.imposterCount === 1 || partial.imposterCount === 2) s.imposterCount = partial.imposterCount;
    if (typeof partial.hint === 'boolean') s.hint = partial.hint;
    if (typeof partial.decoy === 'boolean') s.decoy = partial.decoy;
    if (typeof partial.turnSeconds === 'number') {
      s.turnSeconds = Math.max(10, Math.min(40, Math.round(partial.turnSeconds)));
    }
    if (Array.isArray(partial.categories)) {
      const valid = new Set(categoryNames());
      const next = partial.categories.filter((c) => valid.has(c));
      s.categories = next.length > 0 ? next : categoryNames();
    }
    this.onChange();
  }

  // ---------- round lifecycle ----------

  startRound(host: string): string | null {
    if (host !== this.hostId) return 'Only the host can start.';
    if (this.phase === 'playing' || this.phase === 'guessing') return 'A round is already in progress.';
    const participants = this.players.filter((p) => p.connected);
    if (participants.length < 3) return 'Need at least 3 players.';

    // reset round state
    this.strokes = [];
    this.votes.clear();
    this.guessingId = null;
    this.result = null;
    this.revealStrokes = null;
    for (const p of participants) {
      p.alive = true;
      p.role = 'innocent';
    }

    // pick word + decoy
    const { entry, category } = pickWord(this.settings.categories, this.rng);
    this.secretWord = entry.word;
    this.decoyWord = entry.decoy;
    this.category = category;

    // assign imposters (pure random; >=1 innocent guaranteed)
    const imposterCount = Math.min(this.settings.imposterCount, participants.length - 1);
    const shuffled = this.shuffle(participants.slice());
    for (let i = 0; i < imposterCount; i++) shuffled[i].role = 'imposter';

    // randomized strict-rotation turn order
    this.turnOrder = this.shuffle(participants.slice()).map((p) => p.id);
    this.turnIndex = 0;
    this.phase = 'playing';
    this.beginTurn(true);
    this.onChange();
    return null;
  }

  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- turns ----------

  private clearTurnTimer() {
    if (this.turnTimer !== null) {
      this.sched.clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnEndsAt = null;
  }

  /** Find the next living player's index in turnOrder, scanning forward. */
  private findLivingIndex(from: number, inclusive: boolean): number {
    const n = this.turnOrder.length;
    if (n === 0) return -1;
    for (let step = inclusive ? 0 : 1; step <= n; step++) {
      const idx = (from + step) % n;
      const p = this.getPlayer(this.turnOrder[idx]);
      if (p && p.alive && p.connected) return idx;
    }
    return -1;
  }

  private beginTurn(inclusive: boolean) {
    this.clearTurnTimer();
    const idx = this.findLivingIndex(this.turnIndex, inclusive);
    if (idx === -1) return; // no living players; population check handles end
    this.turnIndex = idx;
    const ms = this.settings.turnSeconds * 1000;
    this.turnEndsAt = this.sched.now() + ms;
    this.turnTimer = this.sched.setTimeout(() => this.onTurnExpire(), ms);
  }

  private advanceTurn() {
    this.clearTurnTimer();
    const idx = this.findLivingIndex(this.turnIndex, false);
    if (idx === -1) return;
    this.turnIndex = idx;
    const ms = this.settings.turnSeconds * 1000;
    this.turnEndsAt = this.sched.now() + ms;
    this.turnTimer = this.sched.setTimeout(() => this.onTurnExpire(), ms);
  }

  private onTurnExpire() {
    if (this.phase !== 'playing') return;
    this.advanceTurn(); // auto-pass, no stroke
    this.onChange();
  }

  handleStroke(playerId: string, points: Point[]): string | null {
    if (this.phase !== 'playing') return 'Not drawing right now.';
    if (this.currentTurnId !== playerId) return "It's not your turn.";
    const cleaned = this.cleanPoints(points);
    if (cleaned.length === 0) return 'Empty stroke.';
    const player = this.getPlayer(playerId)!;
    this.strokes.push({ playerId, color: player.color, points: cleaned });
    this.advanceTurn(); // exactly one stroke per turn, then advance
    this.onChange();
    return null;
  }

  private cleanPoints(points: Point[]): Point[] {
    if (!Array.isArray(points)) return [];
    const out: Point[] = [];
    for (const p of points) {
      if (typeof p?.x !== 'number' || typeof p?.y !== 'number') continue;
      if (!isFinite(p.x) || !isFinite(p.y)) continue;
      out.push({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) });
      if (out.length >= 1000) break; // sanity cap per stroke
    }
    return out;
  }

  // ---------- voting ----------

  handleVote(voterId: string, target: string | null): string | null {
    if (this.phase !== 'playing') return 'Voting is closed.';
    const voter = this.getPlayer(voterId);
    if (!voter || !voter.alive || !voter.connected) return 'You cannot vote.';
    if (target === null) {
      this.votes.delete(voterId); // abstain
    } else {
      if (target === voterId) return 'No self-voting.';
      const t = this.getPlayer(target);
      if (!t || !t.alive || !t.connected) return 'Invalid vote target.';
      this.votes.set(voterId, target);
    }
    // Execution is checked only on a real vote action (the disconnect guard
    // relies on this: lowering the threshold via a leave must NOT auto-kill).
    this.checkExecution();
    this.onChange();
    return null;
  }

  private tally(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const [voter, target] of this.votes) {
      const v = this.getPlayer(voter);
      const t = this.getPlayer(target);
      if (!v || !v.alive || !v.connected) continue;
      if (!t || !t.alive || !t.connected) continue;
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    return counts;
  }

  private checkExecution() {
    const need = this.threshold();
    const counts = this.tally();
    for (const [target, count] of counts) {
      if (count >= need) {
        this.executePlayer(target);
        return;
      }
    }
  }

  private executePlayer(victimId: string) {
    const victim = this.getPlayer(victimId);
    if (!victim) return;
    victim.alive = false;
    this.cleanupVotesFor(victimId);

    if (victim.role === 'innocent') {
      this.endGame('imposters', `${victim.name} was innocent — the imposters win.`);
      return;
    }
    // victim is an imposter: pause for their last-chance steal guess
    this.clearTurnTimer();
    this.guessingId = victimId;
    this.phase = 'guessing';
  }

  private cleanupVotesFor(deadId: string) {
    this.votes.delete(deadId);
    for (const [voter, target] of this.votes) {
      if (target === deadId) this.votes.delete(voter);
    }
  }

  // ---------- steal-the-win guess ----------

  handleGuess(playerId: string, word: string): string | null {
    if (this.phase !== 'guessing' || this.guessingId !== playerId) return 'Not your guess to make.';
    const correct = matchGuess(word, this.secretWord ?? '');
    this.resolveGuess(correct, word);
    this.onChange();
    return null;
  }

  handleGuessSkip(playerId: string): string | null {
    if (this.phase !== 'guessing' || this.guessingId !== playerId) return 'Not your guess to make.';
    this.resolveGuess(false, null);
    this.onChange();
    return null;
  }

  private resolveGuess(correct: boolean, typed: string | null) {
    if (correct) {
      this.endGame('imposters', 'The caught imposter guessed the word and steals the win!');
      return;
    }
    // wrong guess: let the group see the word the imposter actually typed
    const guesser = this.guessingId ? this.getPlayer(this.guessingId) : null;
    const wrong: Partial<RoundResult> =
      typed && typed.trim() ? { guess: typed.trim(), guesser: guesser?.name } : {};
    if (this.settings.imposterCount === 1) {
      this.endGame('innocents', 'The imposter was caught and guessed wrong — the group wins!', wrong);
      return;
    }
    // 2-imposter mode: caught imposter now spectates; keep hunting.
    this.guessingId = null;
    if (this.aliveByRole('imposter').length === 0) {
      this.endGame('innocents', 'Both imposters were caught — the group wins!');
      return;
    }
    this.phase = 'playing';
    this.beginTurn(true);
  }

  // ---------- end ----------

  private endGame(winner: Winner, reason: string, extra: Partial<RoundResult> = {}) {
    this.clearTurnTimer();
    this.phase = 'reveal';
    this.guessingId = null;
    this.revealStrokes = this.strokes.slice();
    this.result = { winner, word: this.secretWord ?? '', reason, ...extra };
    this.awardScores(winner);
  }

  private awardScores(winner: Winner) {
    for (const p of this.players) {
      if (p.role === null) continue; // spectators who joined mid-round
      if (winner === 'imposters' && p.role === 'imposter') {
        p.score += 1; // the imposter team scores regardless of survival
      } else if (winner === 'innocents' && p.role === 'innocent' && p.alive && p.connected) {
        p.score += 1; // only surviving innocents score
      }
    }
  }

  // ---------- disconnects ----------

  onDisconnect(playerId: string) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.connected = false;

    if (this.phase === 'lobby' || this.phase === 'reveal') {
      // not mid-round: drop them entirely
      this.removePlayer(playerId);
      return;
    }

    const wasActive = this.currentTurnId === playerId;
    player.alive = false;
    this.cleanupVotesFor(playerId);
    this.reassignHostIfNeeded();

    // NOTE: intentionally NOT calling checkExecution — the disconnect guard
    // requires a fresh vote to cross a (newly lowered) threshold.

    if (this.guessingId === playerId) {
      this.resolveGuess(false, null); // the guessing imposter bailed (no word to show)
    } else {
      if (this.maybeEndByPopulation()) {
        this.onChange();
        return;
      }
      if (wasActive && this.phase === 'playing') this.advanceTurn();
    }
    this.onChange();
  }

  /** End the round if one side has been wiped out by departures. */
  private maybeEndByPopulation(): boolean {
    if (this.phase !== 'playing') return false;
    if (this.aliveByRole('imposter').length === 0) {
      this.endGame('innocents', 'All imposters left — the group wins.');
      return true;
    }
    if (this.aliveByRole('innocent').length === 0) {
      this.endGame('imposters', 'All innocents left — the imposters win.');
      return true;
    }
    return false;
  }

  // ---------- host actions ----------

  kick(host: string, targetId: string): string | null {
    if (host !== this.hostId) return 'Only the host can kick.';
    if (targetId === host) return 'You cannot kick yourself.';
    const target = this.getPlayer(targetId);
    if (!target) return 'No such player.';
    // Treat as a disconnect (handles mid-round removal + guards), then purge.
    this.onDisconnect(targetId);
    this.removePlayer(targetId);
    return null;
  }

  dispose() {
    this.clearTurnTimer();
  }
}
