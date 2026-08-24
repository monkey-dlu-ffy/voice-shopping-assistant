import type { Lexicon } from './types.js';

export const es: Lexicon = {
  code: 'es',
  tags: ['es', 'es-ES', 'es-MX', 'es-AR', 'es-US'],
  label: 'Espanol (Spanish)',
  verbFinal: false,

  fillers: [
    'me gustaria', 'quisiera', 'por favor', 'puedes',
    'podrias', 'oye', 'bueno', 'vale', 'pues', 'eh',
  ],

  numberWords: {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
    trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30,
    docena: 12, par: 2,
  },

  verbs: {
    add: [
      'anade', 'anadir', 'agrega', 'agregar', 'compra', 'comprar',
      'necesito', 'quiero', 'pon', 'poner', 'mete', 'consigue', 'me falta',
    ],
    remove: [
      'quita', 'quitar', 'elimina', 'eliminar', 'borra', 'borrar', 'saca',
      'no necesito', 'no quiero', 'olvida',
    ],
    update_quantity: ['cambia', 'cambiar', 'actualiza'],
    search: ['busca', 'buscar', 'encuentra', 'encontrar', 'muestrame', 'ensename'],
    clear_list: ['borra todo', 'limpia', 'vacia', 'empezar de nuevo'],
    mark_bought: ['comprado', 'ya compre', 'marca', 'conseguido'],
    read_list: [
      'que hay en mi lista', 'lee mi lista',
      'mi lista', 'que necesito', 'muestra mi lista',
    ],
    undo: ['deshacer', 'deshaz', 'no importa', 'olvidalo'],
  },

  units: {
    botella: 'bottle', botellas: 'bottle', lata: 'can', latas: 'can',
    paquete: 'packet', paquetes: 'packet', caja: 'box', cajas: 'box',
    bolsa: 'bag', bolsas: 'bag', tarro: 'jar', carton: 'carton',
    docena: 'dozen', docenas: 'dozen', pieza: 'piece', piezas: 'piece',
    kilo: 'kg', kilos: 'kg', kilogramo: 'kg', gramo: 'g', gramos: 'g',
    litro: 'litre', litros: 'litre', mililitro: 'ml', barra: 'loaf',
    manojo: 'bunch', rebanada: 'slice', rebanadas: 'slice',
  },

  attributes: {
    organico: 'organic', organica: 'organic',
    fresco: 'fresh', fresca: 'fresh', congelado: 'frozen', congelada: 'frozen',
    entera: 'whole', entero: 'whole', desnatada: 'skim', descremada: 'skim',
    'sin gluten': 'gluten-free', 'sin azucar': 'sugar-free',
    grande: 'large', pequeno: 'small',
  },

  conjunctions: ['y', 'e', 'tambien', 'ademas'],

  stopWords: [
    'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'mi', 'mis',
    'lista', 'compra', 'a', 'en', 'para', 'por', 'que', 'me',
  ],

  maxPricePatterns: [
    /(?:menos de|por debajo de|bajo|maximo|hasta)\s*\$?\s*(\d+(?:\.\d+)?)/,
  ],
  minPricePatterns: [
    /(?:mas de|por encima de|minimo|desde)\s*\$?\s*(\d+(?:\.\d+)?)/,
  ],

  responses: {
    added: (w) => `Anadido ${w}`,
    removed: (w) => `Eliminado ${w}`,
    updated: (w) => `Actualizado ${w}`,
    cleared: () => 'Lista vaciada',
    bought: (w) => `${w} marcado como comprado`,
    listEmpty: () => 'Tu lista esta vacia',
    listIs: (w) => `Tienes ${w}`,
    found: (n) => `${n} ${n === 1 ? 'resultado' : 'resultados'}`,
    nothingFound: () => 'No encontre nada que coincida',
    undone: () => 'Deshecho',
    notUnderstood: () => 'No te entendi. Intenta de nuevo.',
  },
};
