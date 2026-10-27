/**
 * Buscador del catálogo (RF-4 CA1, ampliado).
 *
 * Entiende la búsqueda como la escribiría un cliente, no solo el nombre exacto:
 *  - busca en nombre, categoría, colores, colección, material, código y DESCRIPCIÓN, con más peso en el nombre;
 *  - ignora mayúsculas, acentos y la ñ ("ninos" = "niños"), y plural/singular y masculino/femenino ("rojas" = "rojo");
 *  - conoce sinónimos y palabras de uso común en México ("maleta" → mochila, "compu" → laptop, "lunch" → lonchera,
 *    "para niña" → infantil, "dino" → dinosaurio, "con llantitas" → ruedas…);
 *  - tolera errores de tecleo ("mochla", "dinosuario", "lonchra") y palabras a medio escribir ("moch", "unicor");
 *  - todas las palabras importantes deben coincidir ("mochila azul" no muestra loncheras azules); las palabras que no
 *    describen a ningún producto ("mochila azul bonita") se ignoran en lugar de dejar la búsqueda vacía;
 *  - entiende exclusiones ("mochila sin ruedas") y precios ("menos de 600", "entre 500 y 700", "barata");
 *  - ordena por relevancia.
 *
 * Es JavaScript puro, sin dependencias ni servicios externos, para que funcione igual en local y en Vercel.
 */

// ------------------------------------------------------------------ Normalización
export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos y la tilde de la ñ
    .replace(/["“”″'’]/g, ' ');
}

/** Palabras del texto ya normalizado: letras y números (conserva decimales como 15.6). */
export function palabras(texto) {
  return normalizar(texto)
    .replace(/[^a-z0-9.]+/g, ' ')
    .split(' ')
    .map((p) => p.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);
}

/** Raíz sencilla para español: une singular/plural y masculino/femenino. Se aplica igual al texto y a la búsqueda. */
export function raiz(p) {
  if (/^\d/.test(p) || p.length <= 3) return p;
  let r = p;
  if (r.length > 4 && r.endsWith('ces')) r = `${r.slice(0, -3)}z`;              // lápices → lapiz
  else if (r.length > 4 && /[^aeiou]es$/.test(r)) r = r.slice(0, -2);           // flores → flor, azules → azul
  else if (r.length > 3 && /[aeo]s$/.test(r)) r = r.slice(0, -1);               // mochilas → mochila (gris se queda)
  if (r.length > 3 && /[aeo]$/.test(r)) r = r.slice(0, -1);                     // mochila/rojo/roja/niña → mochil/roj/roj/nin
  return r;
}

const VACIAS = new Set(`
  de del la las el lo los un una unos unas para pa por con y o u e a al en mi mis tu tus su sus que quiero busco buscar
  buscando necesito necesita tienen tiene tengo hay me te se algo alguna alguno algun como cual cuales muy mas menos tipo
  modelo modelos producto productos articulo pesos mxn peso favor porfa gracias hola ver ensename muestrame dame quisiera
  this the for with and of to bonita bonito linda lindo chida chido bueno buena mejor
`.trim().split(/\s+/));

// Sinónimos: palabra del cliente → palabra(s) que aparecen en los productos. Van de una sola dirección para no
// mezclar conceptos (p. ej. "lluvia" lleva a "impermeable", pero "impermeable" no trae todo lo que diga "agua").
const SINONIMOS_BASE = {
  mochila: 'morral maleta maletita backpack bulto mochi mochilita',
  rueda: 'llanta llantita rueditas ruedita trolley arrastrar arrastre rodante carrito',
  infantil: 'nino nina ninos ninas niño niña kids kid kinder preescolar primaria pequeno pequena peque peques hijo hija infancia chiquito chiquita',
  juvenil: 'joven jovenes adolescente adolescentes teen secundaria prepa preparatoria bachillerato universidad universitario universitaria uni facultad adulto adulta trabajo oficina',
  laptop: 'lap computadora compu notebook portatil macbook pc ordenador tablet ipad',
  dinosaurio: 'dino dinos trex rex jurasico triceratops estegosaurio',
  unicornio: 'pony poni fantasia magia magico unicor',
  galaxia: 'espacio espacial astronauta cohete planeta estrella universo cosmos nasa astral',
  flor: 'floral floreado floreada florecita florecitas jardin primavera',
  lonchera: 'lunchera lonchero lunch almuerzo comida refrigerio recreo desayuno hielera tupper',
  estuche: 'lapicera lapicero cartuchera plumier portalapices cosmetiquera neceser',
  lapiz: 'lapices lapicero pluma plumas boligrafo crayola crayolas plumones',
  antirrobo: 'seguridad segura seguro robo robos ladron ladrones asalto rateros',
  usb: 'cargador carga cargar bateria powerbank',
  impermeable: 'lluvia waterproof mojar mojarse',
  termica: 'termico frio fria caliente aislante',
  accesorios: 'accesorio complemento complementos',
  escolar: 'escuela colegio clases utiles regreso',
  // colores
  azul: 'blue celeste azulito',
  rosa: 'rosado rosada rosita pink fucsia fiusha',
  morado: 'morada purpura violeta purple',
  lila: 'lavanda',
  negro: 'negra black oscuro oscura obscuro obscura',
  gris: 'gray grey plata plateado plateada',
  rojo: 'roja red rojizo carmesi tinto',
  verde: 'green',
};

/** alias (raíz) → lista de raíces de destino */
const SINONIMOS = new Map();
for (const [destino, alias] of Object.entries(SINONIMOS_BASE)) {
  const r = raiz(normalizar(destino));
  for (const a of alias.split(/\s+/)) {
    const ra = raiz(normalizar(a));
    if (ra === r) continue;
    if (!SINONIMOS.has(ra)) SINONIMOS.set(ra, new Set());
    SINONIMOS.get(ra).add(r);
  }
}
// "escuela", "clases", "útiles"… también deben encontrar descripciones que dicen "escuela" (no solo "escolar")
for (const a of SINONIMOS_BASE.escolar.split(/\s+/)) SINONIMOS.get(raiz(a))?.add(raiz('escuela'));
SINONIMOS.get(raiz('escuela'))?.add(raiz('escuela'));

// Palabras que dicen QUÉ es el producto: solo cuentan si están en el nombre, la categoría o la colección
// (así "mochila" no trae el estuche porque su descripción dice "cabe en cualquier mochila").
const TIPOS = new Set(['mochila', 'lonchera', 'estuche'].map((p) => raiz(p)));

const BARATO = new Set(['barata', 'barato', 'baratas', 'baratos', 'economica', 'economico', 'economicas', 'economicos', 'accesible', 'accesibles']);
const CARO = new Set(['cara', 'caro', 'caras', 'caros', 'premium', 'lujo']);

// ------------------------------------------------------------------ Distancia de edición (errores de tecleo)
function distancia(a, b, tope) {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let minFila = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // letras volteadas
      minFila = Math.min(minFila, d[i][j]);
    }
    if (minFila > tope) return tope + 1;
  }
  return d[a.length][b.length];
}
const toleranciaPara = (r) => (r.length >= 7 ? 2 : r.length >= 4 ? 1 : 0);

// ------------------------------------------------------------------ Interpretación de la búsqueda
/**
 * Convierte el texto del cliente en términos buscables.
 * @returns {{terminos: {original:string, raiz:string, alternativas:string[]}[], excluidos: {...}[], min:number|null, max:number|null, orden:string|null, codigo:string|null}}
 */
export function interpretar(texto) {
  let t = normalizar(texto).replace(/\s+/g, ' ').trim();
  let min = null, max = null, orden = null, codigo = null;
  const num = (s) => Number(String(s).replace(/,/g, ''));

  const cod = /^\s*([a-z]{2})\s*-?\s*(\d{3})\s*$/.exec(t);
  if (cod) codigo = `${cod[1]}-${cod[2]}`;

  // precios: "entre 500 y 700", "menos de $600", "desde 300"
  t = t.replace(/\bentre\s*\$?\s*(\d[\d,]*)\s*(?:y|a|-)\s*\$?\s*(\d[\d,]*)(?:\s*pesos)?/g, (_, a, b) => { min = Math.min(num(a), num(b)); max = Math.max(num(a), num(b)); return ' '; });
  t = t.replace(/\b(?:menos de|hasta|maximo|max|debajo de|por debajo de|menor a|menor que|no mas de|abajo de)\s*\$?\s*(\d[\d,]*)(?:\s*pesos)?/g, (_, a) => { max = num(a); return ' '; });
  t = t.replace(/\b(?:mas de|desde|minimo|arriba de|mayor a|mayor que|por encima de|encima de)\s*\$?\s*(\d[\d,]*)(?:\s*pesos)?/g, (_, a) => { min = num(a); return ' '; });

  const terminos = [], excluidos = [];
  let negar = false;
  for (const p of palabras(t)) {
    if (p === 'sin' || p === 'no') { negar = true; continue; }
    if (BARATO.has(p)) { orden = 'precio_asc'; continue; }
    if (CARO.has(p)) { orden = 'precio_desc'; continue; }
    if (VACIAS.has(p) || (p.length < 2 && !/^\d/.test(p))) continue;
    const r = raiz(p);
    const alternativas = [...(SINONIMOS.get(r) || [])];
    // una palabra completa que ya conocemos ("uni", "lap") no se trata como palabra a medio escribir
    const termino = { original: p, raiz: r, alternativas, prefijo: !SINONIMOS.has(r) };
    (negar ? excluidos : terminos).push(termino);
    negar = false;
  }
  return { terminos, excluidos, min, max, orden, codigo };
}

// ------------------------------------------------------------------ Índice de un producto
const PESOS = { nombre: 5, categoria: 3, colores: 3, coleccion: 2, material: 1.5, descripcion: 1, codigo: 4 };

/** Prepara un producto para buscar en él. `p` trae nombre, categoria, colores[], coleccion, material, descripcion, codigo. */
export function indexar(p) {
  const campos = {
    nombre: p.nombre, categoria: p.categoria, colores: (p.colores || []).join(' '), coleccion: p.coleccion,
    material: p.material, descripcion: p.descripcion, codigo: p.codigo,
  };
  const indice = {};
  const formas = new Map(); // raíz → palabra tal como aparece (para sugerir "quizá quisiste decir")
  for (const [campo, valor] of Object.entries(campos)) {
    const ps = palabras(valor);
    indice[campo] = new Set(ps.map((x) => { const r = raiz(x); if (!formas.has(r)) formas.set(r, x); return r; }));
  }
  return { indice, formas, nombreNormal: palabras(p.nombre).join(' ') };
}

/** Calidad de coincidencia (0 a 1) de una raíz buscada contra una raíz del producto. */
function calidad(q, d, conErrores, prefijo = true) {
  if (q === d) return 1;
  if (prefijo && q.length >= 2 && d.startsWith(q)) return 0.8;   // palabra a medio escribir: "moch" → mochila
  if (q.length >= 5 && q.startsWith(d) && d.length >= 4) return 0.7; // "dinosaurios" vs raíz más corta
  if (conErrores) {
    const tol = toleranciaPara(q);
    if (tol && distancia(q, d, tol) <= tol) return 0.6;
    // error de tecleo en una palabra a medio escribir: "mochl" → "mochil…"
    if (tol && d.length > q.length && distancia(q, d.slice(0, q.length), 1) <= 1 && q.length >= 4) return 0.5;
  }
  return 0;
}

/** Mejor puntaje de un término en un producto: {puntos, forma} */
function puntuarTermino(term, prod, conErrores) {
  let mejor = { puntos: 0, forma: null };
  const opciones = [[term.raiz, 1, term.prefijo !== false], ...term.alternativas.map((a) => [a, 0.9, false])];
  for (const [campo, raices] of Object.entries(prod.indice)) {
    const peso = PESOS[campo];
    const campoDeTipo = campo === 'nombre' || campo === 'categoria' || campo === 'coleccion';
    for (const d of raices) {
      for (const [q, factor, prefijo] of opciones) {
        if (!campoDeTipo && (TIPOS.has(q) || TIPOS.has(d))) continue;
        const c = calidad(q, d, conErrores, prefijo);
        if (!c) continue;
        const pts = peso * c * factor;
        if (pts > mejor.puntos) mejor = { puntos: pts, forma: prod.formas.get(d) };
      }
    }
  }
  return mejor;
}

/**
 * Busca `texto` entre los productos.
 * @param {string} texto
 * @param {Array<{id:number, nombre:string, categoria:string, colores:string[], coleccion?:string, material?:string, descripcion?:string, codigo:string, precio:number}>} productos
 *        precio en pesos (para los filtros de precio escritos en la búsqueda)
 * @returns {{resultados: {id:number, puntos:number}[], info: object}}
 */
export function buscar(texto, productos) {
  const consulta = interpretar(texto);
  const idx = productos.map((p) => ({ p, ...indexar(p) }));
  const info = { ignoradas: [], correcciones: [], excluidas: consulta.excluidos.map((e) => e.original), min: consulta.min, max: consulta.max, orden: consulta.orden };

  // Código exacto ("IN-003")
  if (consulta.codigo) {
    const r = idx.filter((x) => normalizar(x.p.codigo) === consulta.codigo);
    if (r.length) return { resultados: r.map((x) => ({ id: x.p.id, puntos: 100 })), info };
  }

  // 1) cada término se busca primero sin errores de tecleo; si no aparece en ningún producto, se intenta con tolerancia;
  //    si ni así aparece, se ignora (no describe a ningún producto del catálogo).
  const activos = [];
  for (const term of consulta.terminos) {
    const exactos = idx.map((x) => puntuarTermino(term, x, false));
    if (exactos.some((m) => m.puntos > 0)) { activos.push({ term, conErrores: false }); continue; }
    const aprox = idx.map((x) => puntuarTermino(term, x, true));
    const hit = aprox.reduce((a, m) => (m.puntos > a.puntos ? m : a), { puntos: 0 });
    if (hit.puntos > 0) {
      activos.push({ term, conErrores: true });
      if (hit.forma && hit.forma !== term.original) info.correcciones.push({ de: term.original, a: hit.forma });
    } else info.ignoradas.push(term.original);
  }

  const frase = palabras(consulta.terminos.map((t) => t.original).join(' ')).join(' ');
  // Solo palabras vacías ("para", "de") o nada: equivale a no buscar
  const sinCriterio = !consulta.terminos.length && !consulta.excluidos.length && consulta.min === null && consulta.max === null;
  const resultados = [];
  for (const x of idx) {
    // precio escrito en la búsqueda
    if (consulta.min !== null && x.p.precio < consulta.min) continue;
    if (consulta.max !== null && x.p.precio > consulta.max) continue;
    // exclusiones: "sin ruedas"
    if (consulta.excluidos.some((e) => puntuarTermino(e, x, false).puntos >= PESOS.material)) continue;
    let total = 0, todos = true, fuertes = 0;
    for (const { term, conErrores } of activos) {
      const m = puntuarTermino(term, x, conErrores);
      if (!m.puntos) { todos = false; break; }
      total += m.puntos;
      if (m.puntos >= PESOS.categoria * 0.8) fuertes++;
    }
    if (!todos) continue;
    if (activos.length && fuertes === activos.length) total += 3;           // todas las palabras están en nombre/categoría/colores
    if (frase && x.nombreNormal.includes(frase)) total += 4;                 // la frase completa aparece en el nombre
    resultados.push({ id: x.p.id, puntos: Math.round(total * 100) / 100 });
  }
  // Si TODAS las palabras se ignoraron, no se muestra el catálogo completo como si coincidiera.
  if (consulta.terminos.length && !activos.length) return { resultados: [], info };
  info.sin_criterio = sinCriterio;
  resultados.sort((a, b) => b.puntos - a.puntos);
  return { resultados, info };
}
