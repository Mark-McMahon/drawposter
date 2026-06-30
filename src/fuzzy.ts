// Fuzzy / synonym-tolerant guess checking for the steal-the-win guess.
// The server is the only place the real word lives, so matching happens here.

// A few hand-picked synonym clusters: a guess that lands in the same cluster
// as the answer counts. Keep this conservative — it should reward "clearly the
// same thing", not anything vaguely related.
const SYNONYMS: string[][] = [
  ['couch', 'sofa', 'settee'],
  ['soda', 'pop', 'fizzy drink'],
  ['cap', 'hat'],
  ['plane', 'airplane', 'aeroplane', 'jet'],
  ['bike', 'bicycle', 'cycle'],
  ['phone', 'telephone', 'mobile', 'cellphone', 'cell phone'],
  ['tv', 'television', 'telly'],
  ['car', 'automobile', 'auto'],
  ['boat', 'ship'],
  ['hound', 'dog'],
  ['kitty', 'cat'],
];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]/g, ' ') // strip punctuation/accents
    .replace(/\b(a|an|the)\b/g, ' ') // drop articles
    .replace(/\s+/g, ' ')
    .trim();
}

/** Crude singularization so "cats" matches "cat", "berries" matches "berry". */
function singular(s: string): string {
  if (s.length <= 3) return s;
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y';
  if (s.endsWith('ses') || s.endsWith('xes') || s.endsWith('zes') || s.endsWith('ches') || s.endsWith('shes'))
    return s.slice(0, -2);
  if (s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
  return s;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

function synonymKey(word: string): number | null {
  for (let i = 0; i < SYNONYMS.length; i++) {
    if (SYNONYMS[i].some((w) => normalize(w) === word)) return i;
  }
  return null;
}

/**
 * Does `guess` match the secret `answer`?
 * - case/punctuation/article insensitive
 * - singular/plural tolerant
 * - small edit-distance tolerance (typos), scaled to word length
 * - hand-picked synonym clusters
 */
export function matchGuess(guess: string, answer: string): boolean {
  const g = normalize(guess);
  const a = normalize(answer);
  if (!g) return false;
  if (g === a) return true;

  const gs = singular(g);
  const as = singular(a);
  if (gs === as) return true;

  // synonym clusters (use the full normalized form)
  const gk = synonymKey(g);
  const ak = synonymKey(a);
  if (gk !== null && gk === ak) return true;

  // typo tolerance: allow 1 edit for short words, 2 for longer ones.
  const tol = a.length <= 4 ? 1 : a.length <= 8 ? 2 : 3;
  if (levenshtein(gs, as) <= tol) return true;

  return false;
}
