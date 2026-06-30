// Curated category packs. Each word ships with a hand-paired, close decoy
// (given to the imposter when the decoy setting is on) so they can draw
// "confidently wrong but plausible".

export interface WordEntry {
  word: string;
  decoy: string;
}

export interface Category {
  name: string;
  words: WordEntry[];
}

export const CATEGORIES: Category[] = [
  {
    name: 'Animals',
    words: [
      { word: 'cat', decoy: 'dog' },
      { word: 'lion', decoy: 'tiger' },
      { word: 'horse', decoy: 'donkey' },
      { word: 'frog', decoy: 'toad' },
      { word: 'shark', decoy: 'dolphin' },
      { word: 'rabbit', decoy: 'hare' },
      { word: 'elephant', decoy: 'rhino' },
      { word: 'penguin', decoy: 'puffin' },
      { word: 'crocodile', decoy: 'alligator' },
      { word: 'butterfly', decoy: 'moth' },
      { word: 'owl', decoy: 'hawk' },
      { word: 'whale', decoy: 'walrus' },
    ],
  },
  {
    name: 'Food',
    words: [
      { word: 'apple', decoy: 'tomato' },
      { word: 'pizza', decoy: 'pie' },
      { word: 'banana', decoy: 'plantain' },
      { word: 'burger', decoy: 'sandwich' },
      { word: 'carrot', decoy: 'parsnip' },
      { word: 'donut', decoy: 'bagel' },
      { word: 'grapes', decoy: 'berries' },
      { word: 'ice cream', decoy: 'popsicle' },
      { word: 'pancake', decoy: 'waffle' },
      { word: 'taco', decoy: 'burrito' },
      { word: 'corn', decoy: 'wheat' },
      { word: 'pretzel', decoy: 'croissant' },
    ],
  },
  {
    name: 'Objects',
    words: [
      { word: 'guitar', decoy: 'violin' },
      { word: 'umbrella', decoy: 'parasol' },
      { word: 'clock', decoy: 'watch' },
      { word: 'lamp', decoy: 'lantern' },
      { word: 'scissors', decoy: 'pliers' },
      { word: 'key', decoy: 'lock' },
      { word: 'glasses', decoy: 'goggles' },
      { word: 'ladder', decoy: 'staircase' },
      { word: 'phone', decoy: 'remote' },
      { word: 'hammer', decoy: 'axe' },
      { word: 'candle', decoy: 'torch' },
      { word: 'anchor', decoy: 'hook' },
    ],
  },
  {
    name: 'Places',
    words: [
      { word: 'castle', decoy: 'palace' },
      { word: 'lighthouse', decoy: 'watchtower' },
      { word: 'bridge', decoy: 'pier' },
      { word: 'pyramid', decoy: 'tent' },
      { word: 'windmill', decoy: 'water tower' },
      { word: 'igloo', decoy: 'dome' },
      { word: 'barn', decoy: 'shed' },
      { word: 'church', decoy: 'temple' },
      { word: 'volcano', decoy: 'mountain' },
      { word: 'island', decoy: 'peninsula' },
    ],
  },
  {
    name: 'Nature',
    words: [
      { word: 'tree', decoy: 'bush' },
      { word: 'sun', decoy: 'moon' },
      { word: 'cloud', decoy: 'fog' },
      { word: 'flower', decoy: 'weed' },
      { word: 'river', decoy: 'lake' },
      { word: 'cactus', decoy: 'aloe' },
      { word: 'snowflake', decoy: 'raindrop' },
      { word: 'mushroom', decoy: 'umbrella' },
      { word: 'leaf', decoy: 'feather' },
      { word: 'star', decoy: 'sparkle' },
    ],
  },
  {
    name: 'Vehicles',
    words: [
      { word: 'car', decoy: 'truck' },
      { word: 'bicycle', decoy: 'motorcycle' },
      { word: 'airplane', decoy: 'helicopter' },
      { word: 'boat', decoy: 'canoe' },
      { word: 'train', decoy: 'tram' },
      { word: 'rocket', decoy: 'missile' },
      { word: 'submarine', decoy: 'torpedo' },
      { word: 'tractor', decoy: 'bulldozer' },
      { word: 'scooter', decoy: 'skateboard' },
      { word: 'hot air balloon', decoy: 'blimp' },
    ],
  },
];

export function categoryNames(): string[] {
  return CATEGORIES.map((c) => c.name);
}

/** Pick a random word entry from the active categories. */
export function pickWord(
  activeCategories: string[],
  rng: () => number = Math.random,
): { entry: WordEntry; category: string } {
  const active = CATEGORIES.filter(
    (c) => activeCategories.length === 0 || activeCategories.includes(c.name),
  );
  const pool = active.length > 0 ? active : CATEGORIES;
  const cat = pool[Math.floor(rng() * pool.length)];
  const entry = cat.words[Math.floor(rng() * cat.words.length)];
  return { entry, category: cat.name };
}
