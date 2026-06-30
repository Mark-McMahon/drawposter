// Curated category packs. Each word ships with a hand-paired, close decoy
// (given to the imposter when the decoy setting is on) so they can draw
// "confidently wrong but plausible".
//
// Curation rule: a good pair shares a SILHOUETTE but differs by one tell-tale
// detail (cat vs dog: the snout/ears). That single difference is the whole
// deduction — innocents catch the imposter when the rendered detail is wrong.
// So we avoid: identical twins (no tell), complexity-mismatched decoys (the
// imposter is exposed instantly), and one-stroke icons like sun/star (too easy,
// the standoff never develops).

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
      { word: 'elephant', decoy: 'rhino' },
      { word: 'shark', decoy: 'dolphin' },
      { word: 'octopus', decoy: 'squid' },
      { word: 'snail', decoy: 'turtle' },
      { word: 'fox', decoy: 'wolf' },
      { word: 'bee', decoy: 'wasp' },
      { word: 'crab', decoy: 'lobster' },
      { word: 'butterfly', decoy: 'moth' },
      { word: 'owl', decoy: 'hawk' },
      { word: 'penguin', decoy: 'puffin' },
      { word: 'whale', decoy: 'walrus' },
    ],
  },
  {
    name: 'Food',
    words: [
      { word: 'apple', decoy: 'tomato' },
      { word: 'pizza', decoy: 'pie' },
      { word: 'burger', decoy: 'sandwich' },
      { word: 'taco', decoy: 'burrito' },
      { word: 'donut', decoy: 'bagel' },
      { word: 'cupcake', decoy: 'muffin' },
      { word: 'ice cream', decoy: 'popsicle' },
      { word: 'pretzel', decoy: 'croissant' },
      { word: 'pineapple', decoy: 'pinecone' },
      { word: 'carrot', decoy: 'chili pepper' },
      { word: 'fried egg', decoy: 'pancake' },
      { word: 'cherries', decoy: 'grapes' },
      { word: 'corn', decoy: 'wheat' },
    ],
  },
  {
    name: 'Objects',
    words: [
      { word: 'guitar', decoy: 'violin' },
      { word: 'clock', decoy: 'watch' },
      { word: 'lamp', decoy: 'lantern' },
      { word: 'scissors', decoy: 'pliers' },
      { word: 'glasses', decoy: 'goggles' },
      { word: 'ladder', decoy: 'staircase' },
      { word: 'phone', decoy: 'remote' },
      { word: 'hammer', decoy: 'axe' },
      { word: 'paintbrush', decoy: 'pencil' },
      { word: 'anchor', decoy: 'hook' },
      { word: 'camera', decoy: 'microwave' },
      { word: 'vase', decoy: 'goblet' },
      { word: 'saw', decoy: 'comb' },
      { word: 'spoon', decoy: 'shovel' },
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
      { word: 'ferris wheel', decoy: 'water wheel' },
      { word: 'skyscraper', decoy: 'apartment' },
      { word: 'fountain', decoy: 'birdbath' },
    ],
  },
  {
    name: 'Nature',
    words: [
      { word: 'tree', decoy: 'bush' },
      { word: 'palm tree', decoy: 'pine tree' },
      { word: 'cactus', decoy: 'aloe' },
      { word: 'rose', decoy: 'tulip' },
      { word: 'flower', decoy: 'sun' },
      { word: 'mushroom', decoy: 'umbrella' },
      { word: 'leaf', decoy: 'feather' },
      { word: 'rainbow', decoy: 'arch' },
      { word: 'wave', decoy: 'sand dune' },
      { word: 'seashell', decoy: 'fan' },
      { word: 'acorn', decoy: 'chestnut' },
      { word: 'tornado', decoy: 'waterspout' },
    ],
  },
  {
    name: 'Vehicles',
    words: [
      { word: 'car', decoy: 'truck' },
      { word: 'bus', decoy: 'van' },
      { word: 'bicycle', decoy: 'motorcycle' },
      { word: 'scooter', decoy: 'skateboard' },
      { word: 'airplane', decoy: 'helicopter' },
      { word: 'boat', decoy: 'canoe' },
      { word: 'sailboat', decoy: 'pirate ship' },
      { word: 'train', decoy: 'tram' },
      { word: 'rocket', decoy: 'crayon' },
      { word: 'submarine', decoy: 'whale' },
      { word: 'tractor', decoy: 'bulldozer' },
      { word: 'ambulance', decoy: 'fire truck' },
      { word: 'hot air balloon', decoy: 'blimp' },
    ],
  },
  {
    name: 'Sports',
    words: [
      { word: 'soccer ball', decoy: 'basketball' },
      { word: 'football', decoy: 'rugby ball' },
      { word: 'tennis racket', decoy: 'ping pong paddle' },
      { word: 'baseball bat', decoy: 'cricket bat' },
      { word: 'hockey stick', decoy: 'golf club' },
      { word: 'bowling pin', decoy: 'bottle' },
      { word: 'dartboard', decoy: 'target' },
      { word: 'skis', decoy: 'snowboard' },
      { word: 'boxing glove', decoy: 'oven mitt' },
      { word: 'dumbbell', decoy: 'barbell' },
      { word: 'kite', decoy: 'sail' },
      { word: 'trophy', decoy: 'medal' },
    ],
  },
  {
    name: 'Fantasy',
    words: [
      { word: 'dragon', decoy: 'dinosaur' },
      { word: 'unicorn', decoy: 'horse' },
      { word: 'mermaid', decoy: 'fish' },
      { word: 'wizard', decoy: 'witch' },
      { word: 'fairy', decoy: 'butterfly' },
      { word: 'knight', decoy: 'robot' },
      { word: 'ghost', decoy: 'cloud' },
      { word: 'crown', decoy: 'tiara' },
      { word: 'sword', decoy: 'dagger' },
      { word: 'shield', decoy: 'turtle' },
      { word: 'wand', decoy: 'arrow' },
      { word: 'treasure chest', decoy: 'toolbox' },
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
