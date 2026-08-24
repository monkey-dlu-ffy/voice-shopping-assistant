import type { Lexicon } from './types.js';

/**
 * Hindi is verb-final (SOV): "दूध खरीदो" is literally "milk buy".
 * Both Devanagari (what `hi-IN` speech recognition returns) and romanised
 * Hinglish (what people type) are covered, because real users mix the two.
 */
export const hi: Lexicon = {
  code: 'hi',
  tags: ['hi', 'hi-IN'],
  label: 'हिन्दी (Hindi)',
  verbFinal: true,

  fillers: [
    'मुझे', 'मेरे लिए', 'कृपया', 'ज़रा', 'जरा', 'थोड़ा', 'अरे',
    'mujhe', 'mere liye', 'kripya', 'zara', 'thoda', 'please', 'yaar', 'bhai',
  ],

  numberWords: {
    एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, सात: 7,
    आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12, दर्जन: 12,
    ek: 1, do: 2, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5,
    chhah: 6, saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, darjan: 12,
  },

  verbs: {
    add: [
      'जोड़ो', 'जोड़ दो', 'जोड़ें', 'खरीदो', 'खरीदना है', 'खरीद', 'चाहिए',
      'लाओ', 'ले आओ', 'लेना है', 'डालो', 'डाल दो', 'चाहिये',
      'jodo', 'jod do', 'kharido', 'kharidna hai', 'chahiye',
      'lao', 'le aao', 'lena hai', 'dalo', 'daal do', 'add karo',
    ],
    remove: [
      'हटाओ', 'हटा दो', 'निकालो', 'निकाल दो', 'मिटाओ', 'नहीं चाहिए',
      'नहीं चाहिये',
      'hatao', 'hata do', 'nikalo', 'nikal do', 'mitao', 'nahi chahiye',
      'nahin chahiye', 'remove karo', 'delete karo',
    ],
    update_quantity: ['बदलो', 'बदल दो', 'badlo', 'badal do'],
    search: [
      'ढूंढो', 'ढूँढो', 'खोजो', 'दिखाओ', 'बताओ',
      'dhundo', 'dhoondo', 'khojo', 'dikhao', 'search karo',
    ],
    clear_list: [
      'साफ़ करो', 'साफ करो', 'सब हटाओ', 'खाली करो',
      'saaf karo', 'sab hatao', 'khali karo', 'clear karo',
    ],
    mark_bought: ['खरीद लिया', 'ले लिया', 'हो गया', 'kharid liya', 'le liya', 'ho gaya'],
    read_list: [
      'लिस्ट में क्या है', 'सूची पढ़ो', 'क्या क्या चाहिए', 'मेरी लिस्ट',
      'list mein kya hai', 'meri list', 'suchi padho', 'list padho',
    ],
    undo: ['वापस', 'रहने दो', 'wapas', 'rehne do', 'undo'],
  },

  units: {
    किलो: 'kg', किलोग्राम: 'kg', ग्राम: 'g', लीटर: 'litre', मिलीलीटर: 'ml',
    बोतल: 'bottle', बोतलें: 'bottle', पैकेट: 'packet', डिब्बा: 'box',
    डिब्बे: 'box', थैला: 'bag', दर्जन: 'dozen', टुकड़ा: 'piece',
    // Hinglish reality: English unit words are used constantly in spoken Hindi.
    kilo: 'kg', gram: 'g', litre: 'litre', liter: 'litre', botal: 'bottle',
    bottle: 'bottle', bottles: 'bottle', can: 'can', cans: 'can', pack: 'pack',
    box: 'box', kg: 'kg', dozen: 'dozen', piece: 'piece', pieces: 'piece',
    packet: 'packet', dibba: 'box', thaila: 'bag', darjan: 'dozen', tukda: 'piece',
  },

  attributes: {
    ऑर्गेनिक: 'organic', जैविक: 'organic', ताज़ा: 'fresh', ताजा: 'fresh',
    बड़ा: 'large', छोटा: 'small',
    organic: 'organic', jaivik: 'organic', taaza: 'fresh', bada: 'large', chota: 'small',
  },

  conjunctions: ['और', 'तथा', 'aur', 'and'],

  stopWords: [
    'में', 'से', 'को', 'का', 'की', 'के', 'लिस्ट', 'सूची', 'है', 'हैं',
    'mein', 'se', 'ko', 'ka', 'ki', 'ke', 'list', 'hai', 'hain',
  ],

  maxPricePatterns: [
    /(\d+(?:\.\d+)?)\s*(?:रुपये|रुपए|rupaye|rupees|rs\.?)?\s*(?:से कम|se kam|के अंदर|ke andar)/,
    /(?:under|below)\s*\$?\s*(\d+(?:\.\d+)?)/,
  ],
  minPricePatterns: [
    /(\d+(?:\.\d+)?)\s*(?:रुपये|रुपए|rupees|rs\.?)?\s*(?:से ज्यादा|se zyada|से अधिक)/,
  ],

  responses: {
    added: (w) => `${w} जोड़ दिया`,
    removed: (w) => `${w} हटा दिया`,
    updated: (w) => `${w} बदल दिया`,
    cleared: () => 'सूची साफ़ कर दी',
    bought: (w) => `${w} खरीद लिया`,
    listEmpty: () => 'आपकी सूची खाली है',
    listIs: (w) => `आपकी सूची में ${w} है`,
    found: (n) => `${n} चीज़ें मिलीं`,
    nothingFound: () => 'कुछ नहीं मिला',
    undone: () => 'वापस कर दिया',
    notUnderstood: () => 'समझ नहीं आया, दोबारा बोलिए',
  },
};
