import type { Lexicon } from './types.js';

export const en: Lexicon = {
  code: 'en',
  tags: ['en', 'en-US', 'en-GB', 'en-IN', 'en-AU'],
  label: 'English',
  verbFinal: false,

  fillers: [
    "i would like to", "i'd like to", "i want to", "i need to", "can you please",
    "could you please", "can you", "could you", "would you", "please can you",
    "i think i", "let me", "let's", "lets", "you know", "sort of", "kind of",
    "hey", "okay", "ok", "alright", "well", "um", "uh", "erm", "hmm",
    "for me", "please", "actually", "just", "maybe", "also",
  ],

  numberWords: {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
    a: 1, an: 1, couple: 2, pair: 2, few: 3, dozen: 12,
  },

  verbs: {
    add: [
      'add', 'buy', 'get', 'grab', 'need', 'want', 'purchase', 'pick up',
      'put', 'include', 'order', 'throw in', 'stock up on', 'running low on',
      'out of', 'remind me to buy',
    ],
    remove: [
      'remove', 'delete', 'drop', 'cancel', 'take off', 'take out',
      'get rid of', "don't need", 'do not need', "don't want", 'no longer need',
      'take',
      'scratch', 'forget',
    ],
    update_quantity: ['change', 'make it', 'update', 'set', 'change quantity of'],
    search: ['find', 'search for', 'search', 'look for', 'look up'],
    clear_list: ['clear', 'empty', 'start over', 'wipe', 'reset', 'clear everything'],
    mark_bought: ['bought', 'got', 'purchased', 'check off', 'tick off', 'mark', 'picked up'],
    read_list: [
      "what's on my list", 'what is on my list', 'read my list', 'read the list',
      "what's on the list", 'show my list', 'tell me my list', 'my list',
      "what do i need", 'read list',
    ],
    undo: ['undo', 'undo that', 'never mind', 'nevermind', 'go back'],
  },

  units: {
    bottle: 'bottle', bottles: 'bottle', can: 'can', cans: 'can',
    packet: 'packet', packets: 'packet', pack: 'pack', packs: 'pack',
    box: 'box', boxes: 'box', bag: 'bag', bags: 'bag', jar: 'jar', jars: 'jar',
    tin: 'tin', tins: 'tin', carton: 'carton', cartons: 'carton',
    bunch: 'bunch', bunches: 'bunch', loaf: 'loaf', loaves: 'loaf',
    head: 'head', heads: 'head', piece: 'piece', pieces: 'piece',
    slice: 'slice', slices: 'slice', dozen: 'dozen', dozens: 'dozen',
    kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
    gram: 'g', grams: 'g', g: 'g',
    litre: 'litre', litres: 'litre', liter: 'litre', liters: 'litre', l: 'litre',
    ml: 'ml', millilitre: 'ml', millilitres: 'ml',
    pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
    ounce: 'oz', ounces: 'oz', oz: 'oz',
    roll: 'roll', rolls: 'roll', tub: 'tub', tubs: 'tub',
  },

  attributes: {
    organic: 'organic', fresh: 'fresh', frozen: 'frozen', whole: 'whole',
    skim: 'skim', skimmed: 'skim', 'low fat': 'low-fat', 'low-fat': 'low-fat',
    'full fat': 'full-fat', 'gluten free': 'gluten-free', 'gluten-free': 'gluten-free',
    'sugar free': 'sugar-free', 'sugar-free': 'sugar-free',
    unsalted: 'unsalted', salted: 'salted', ripe: 'ripe', diet: 'diet',
    large: 'large', small: 'small', free_range: 'free-range',
    'free range': 'free-range', wholemeal: 'wholemeal', 'whole wheat': 'whole-wheat',
    dairy: 'dairy', 'dairy free': 'dairy-free', 'dairy-free': 'dairy-free',
  },

  conjunctions: ['and', 'plus', 'also', 'as well as', 'along with', '&'],

  stopWords: [
    'to', 'my', 'the', 'a', 'an', 'some', 'from', 'list', 'shopping',
    'of', 'on', 'for', 'in', 'into', 'please', 'more', 'it', 'that', 'this',
    'off', 'up', 'out', 'me', 'i', 'we', 'as', 'done', 'now',
    'is', 'are', 'am', 'was', 'were', 'be', 'been', 'do', 'does', 'did',
  ],

  maxPricePatterns: [
    /(?:under|below|less than|cheaper than|no more than|at most|within|max)\s*\$?\s*(\d+(?:\.\d+)?)/,
    /\$?\s*(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?)?\s*(?:or less|and under|and below)/,
  ],
  minPricePatterns: [
    /(?:over|above|more than|at least|minimum|starting at)\s*\$?\s*(\d+(?:\.\d+)?)/,
  ],

  responses: {
    added: (w) => `Added ${w}`,
    removed: (w) => `Removed ${w}`,
    updated: (w) => `Updated ${w}`,
    cleared: () => 'Cleared your list',
    bought: (w) => `Marked ${w} as bought`,
    listEmpty: () => 'Your list is empty',
    listIs: (w) => `You have ${w}`,
    found: (n) => `Found ${n} ${n === 1 ? 'match' : 'matches'}`,
    nothingFound: () => 'I could not find anything matching that',
    undone: () => 'Undone',
    notUnderstood: () => "I didn't catch that. Try rephrasing.",
  },
};
