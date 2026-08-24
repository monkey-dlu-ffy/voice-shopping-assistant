import type { Category } from '@vsa/shared';

/**
 * UI copy.
 *
 * Small enough that a dependency would cost more than it saves. The spoken
 * confirmations come from the shared lexicon on the server; this covers only
 * the chrome around them.
 */

export interface Strings {
  tagline: string;
  listeningHint: string;
  idleHint: string;
  idlePrompt: string;
  handsFree: string;
  handsFreeOn: string;
  language: string;
  yourList: string;
  suggested: string;
  results: string;
  instead: string;
  emptyTitle: string;
  emptyBody: string;
  tryExamples: string[];
  typeInstead: string;
  send: string;
  loadDemo: string;
  clearDemo: string;
  markBought: string;
  removeItem: string;
  addItem: string;
  micBlockedTitle: string;
  micBlockedBody: string;
  unsupportedTitle: string;
  unsupportedBody: string;
  micErrorTitle: (code: string) => string;
  micErrorBody: (code: string) => string;
  offlineTitle: string;
  offlineBody: string;
  thinking: string;
  aisles: Record<Category, string>;
  kinds: Record<string, string>;
}

const EN: Strings = {
  tagline: 'say it, see it',
  listeningHint: 'listening — speak now',
  idleHint: 'tap to speak',
  idlePrompt: 'Tap the microphone and say what you need.',
  handsFree: 'Hands-free',
  handsFreeOn: 'Hands-free on',
  language: 'Language',
  yourList: 'Your list',
  suggested: 'Suggested for you',
  results: 'Search results',
  instead: 'Or instead',
  emptyTitle: 'Nothing on the list yet.',
  emptyBody: 'Speak or type a command to get started.',
  tryExamples: ['add milk', 'I need two bottles of water', 'find toothpaste under $5'],
  typeInstead: 'Type a command',
  send: 'Send',
  loadDemo: 'Load demo history',
  clearDemo: 'Reset',
  markBought: 'Mark as bought',
  removeItem: 'Remove',
  addItem: 'Add to list',
  micBlockedTitle: 'Microphone access is blocked.',
  micBlockedBody: 'Allow the microphone in your browser settings, or type commands below.',
  unsupportedTitle: 'This browser does not support voice input.',
  unsupportedBody: 'Chrome, Edge and Android browsers do. You can type commands below instead.',
  micErrorTitle: (code) =>
    code === 'no-speech' ? "Didn't hear anything." : `Voice recognition stopped (${code}).`,
  micErrorBody: (code) =>
    code === 'no-speech'
      ? 'Check the right microphone is selected and unmuted in your system sound settings, then tap the mic to try again.'
      : 'This is usually your network or a browser extension interfering with the microphone. Tap the mic to try again, or type commands below.',
  offlineTitle: 'Cannot reach the server.',
  offlineBody: 'Check your connection. Your list is safe and will reload when you are back.',
  thinking: 'working it out',
  aisles: {
    produce: 'Produce',
    dairy: 'Dairy',
    bakery: 'Bakery',
    meat: 'Meat',
    seafood: 'Seafood',
    pantry: 'Pantry',
    frozen: 'Frozen',
    beverages: 'Drinks',
    snacks: 'Snacks',
    household: 'Household',
    'personal care': 'Personal care',
    other: 'Other',
  },
  kinds: {
    replenishment: 'Running low',
    seasonal: 'In season',
    deal: 'On offer',
    'co-purchase': 'Goes with',
    substitute: 'Alternative',
  },
};

const HI: Strings = {
  ...EN,
  tagline: 'बोलिए, देखिए',
  listeningHint: 'सुन रहे हैं — बोलिए',
  idleHint: 'बोलने के लिए दबाएँ',
  idlePrompt: 'माइक दबाइए और बताइए क्या चाहिए।',
  handsFree: 'हैंड्स-फ़्री',
  handsFreeOn: 'हैंड्स-फ़्री चालू',
  language: 'भाषा',
  yourList: 'आपकी सूची',
  suggested: 'आपके लिए सुझाव',
  results: 'खोज परिणाम',
  instead: 'या इसके बदले',
  emptyTitle: 'सूची अभी खाली है।',
  emptyBody: 'शुरू करने के लिए बोलिए या लिखिए।',
  tryExamples: ['दूध जोड़ो', 'दो बोतल पानी चाहिए', 'टूथपेस्ट ढूंढो'],
  typeInstead: 'कमांड लिखिए',
  send: 'भेजें',
  loadDemo: 'डेमो इतिहास लोड करें',
  clearDemo: 'रीसेट',
  markBought: 'खरीद लिया',
  removeItem: 'हटाएँ',
  addItem: 'सूची में जोड़ें',
  thinking: 'समझ रहे हैं',
  aisles: {
    produce: 'सब्ज़ी-फल',
    dairy: 'डेयरी',
    bakery: 'बेकरी',
    meat: 'मांस',
    seafood: 'समुद्री भोजन',
    pantry: 'किराना',
    frozen: 'फ़्रोज़न',
    beverages: 'पेय',
    snacks: 'स्नैक्स',
    household: 'घरेलू',
    'personal care': 'व्यक्तिगत देखभाल',
    other: 'अन्य',
  },
  kinds: {
    replenishment: 'ख़त्म हो रहा है',
    seasonal: 'मौसमी',
    deal: 'ऑफ़र',
    'co-purchase': 'साथ में',
    substitute: 'विकल्प',
  },
};

const ES: Strings = {
  ...EN,
  tagline: 'dilo, velo',
  listeningHint: 'escuchando — habla ahora',
  idleHint: 'toca para hablar',
  idlePrompt: 'Toca el micrófono y di lo que necesitas.',
  handsFree: 'Manos libres',
  handsFreeOn: 'Manos libres activado',
  language: 'Idioma',
  yourList: 'Tu lista',
  suggested: 'Sugerencias para ti',
  results: 'Resultados',
  instead: 'O en su lugar',
  emptyTitle: 'La lista está vacía.',
  emptyBody: 'Habla o escribe un comando para empezar.',
  tryExamples: ['añade leche', 'necesito dos botellas de agua', 'busca pasta de dientes'],
  typeInstead: 'Escribe un comando',
  send: 'Enviar',
  loadDemo: 'Cargar historial de demo',
  clearDemo: 'Reiniciar',
  markBought: 'Marcar como comprado',
  removeItem: 'Eliminar',
  addItem: 'Añadir a la lista',
  thinking: 'procesando',
  aisles: {
    produce: 'Frutas y verduras',
    dairy: 'Lácteos',
    bakery: 'Panadería',
    meat: 'Carne',
    seafood: 'Pescado',
    pantry: 'Despensa',
    frozen: 'Congelados',
    beverages: 'Bebidas',
    snacks: 'Aperitivos',
    household: 'Hogar',
    'personal care': 'Cuidado personal',
    other: 'Otros',
  },
  kinds: {
    replenishment: 'Se está acabando',
    seasonal: 'De temporada',
    deal: 'En oferta',
    'co-purchase': 'Va con',
    substitute: 'Alternativa',
  },
};

const TABLE: Record<string, Strings> = { en: EN, hi: HI, es: ES };

export function stringsFor(language: string): Strings {
  return TABLE[language.split('-')[0]!.toLowerCase()] ?? EN;
}
