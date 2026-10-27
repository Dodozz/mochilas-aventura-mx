import { db, aPesos, configNum, ErrorApi, ahora, aCentavos } from '../db.js';
import { validarComentario } from '../validadores.js';
import { buscar } from '../buscador.js';

const BASE = `
  SELECT p.*, c.nombre AS categoria,
         (SELECT url FROM producto_fotos f WHERE f.producto_id = p.id ORDER BY f.orden, f.id LIMIT 1) AS imagen,
         (SELECT ROUND(AVG(r.calificacion), 1) FROM resenas r WHERE r.producto_id = p.id AND r.oculta = 0) AS promedio,
         (SELECT COUNT(*) FROM resenas r WHERE r.producto_id = p.id AND r.oculta = 0) AS total_resenas
    FROM productos p JOIN categorias c ON c.id = p.categoria_id`;

/** Primera oración de la descripción (la que se muestra en las tarjetas del catálogo). */
export function resumir(texto = '') {
  const t = String(texto || '').trim();
  const m = /^(.+?[.!?])(\s|$)/s.exec(t);
  const frase = (m ? m[1] : t).trim();
  return frase.length > 160 ? `${frase.slice(0, 157).replace(/\s+\S*$/, '')}…` : frase;
}

export function formatear(p, favoritos = new Set()) {
  const colores = db.prepare('SELECT nombre, hex, foto FROM producto_colores WHERE producto_id = ? ORDER BY id').all(p.id);
  return {
    id: p.id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, categoria_id: p.categoria_id, coleccion: p.coleccion,
    resumen: resumir(p.descripcion),
    precio: aPesos(p.precio), existencias: p.existencias, umbral: p.umbral,
    agotado: p.existencias === 0,
    pocas_piezas: p.existencias > 0 && p.existencias <= p.umbral,   // RN-3
    destacada: !!p.destacada, estatus: p.estatus, forma: p.forma,
    imagen: p.imagen, colores,
    promedio: p.promedio ?? 0, total_resenas: p.total_resenas,
    favorito: favoritos.has(p.id),
    max_compra: Math.min(configNum('limite_modelo', 10), p.existencias),
  };
}

const favoritosDe = (usuarioId) =>
  new Set(usuarioId ? db.prepare('SELECT producto_id FROM favoritos WHERE usuario_id = ?').all(usuarioId).map((f) => f.producto_id) : []);

/**
 * RF-4 CA1 — búsqueda y filtros por categoría, rango de precio y disponibilidad.
 * La búsqueda por texto usa el buscador inteligente (src/buscador.js): nombre, descripción, categoría, colores,
 * sinónimos, errores de tecleo y orden por relevancia.
 */
export function listarCatalogo(q, usuarioId) {
  const donde = ["p.estatus = 'activo'", "c.estatus = 'activa'"];
  const par = [];
  const texto = String(q.q || '').trim().slice(0, 120);
  const cats = String(q.categoria || '').split(',').map(Number).filter(Boolean);
  if (cats.length) { donde.push(`p.categoria_id IN (${cats.map(() => '?').join(',')})`); par.push(...cats); }
  if (q.min !== undefined && q.min !== '' && !Number.isNaN(Number(q.min))) { donde.push('p.precio >= ?'); par.push(aCentavos(Math.max(0, Number(q.min)))); }
  if (q.max !== undefined && q.max !== '' && !Number.isNaN(Number(q.max))) { donde.push('p.precio <= ?'); par.push(aCentavos(Number(q.max))); }
  if (q.disponibles === '1' || q.disponibles === 'true') donde.push('p.existencias > 0');

  const ORDENES = {
    precio_asc: 'p.precio ASC, p.nombre',
    precio_desc: 'p.precio DESC, p.nombre',
    nuevo: 'p.creado_en DESC, p.id DESC',
  };
  const ordenBase = '(p.existencias > 0) DESC, p.destacada DESC, p.nombre';
  const porPagina = Math.min(Math.max(Number(q.por_pagina) || 9, 1), 48);
  const fav = favoritosDe(usuarioId);
  const rango = db.prepare(`SELECT MIN(p.precio) mn, MAX(p.precio) mx FROM productos p JOIN categorias c ON c.id = p.categoria_id WHERE p.estatus='activo' AND c.estatus='activa'`).get();
  const rangoPesos = { min: Math.floor(aPesos(rango.mn || 0)), max: Math.ceil(aPesos(rango.mx || 0)) };
  const paginar = (total, pagina0) => {
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    return { paginas, pagina: Math.min(Math.max(Number(pagina0) || 1, 1), paginas) };
  };

  if (!texto) {
    const orden = ORDENES[q.orden] || ordenBase;
    const total = db.prepare(`SELECT COUNT(*) n FROM productos p JOIN categorias c ON c.id = p.categoria_id WHERE ${donde.join(' AND ')}`).get(...par).n;
    const { paginas, pagina } = paginar(total, q.pagina);
    const filas = db.prepare(`${BASE} WHERE ${donde.join(' AND ')} ORDER BY ${orden} LIMIT ? OFFSET ?`).all(...par, porPagina, (pagina - 1) * porPagina);
    return { productos: filas.map((f) => formatear(f, fav)), total, pagina, paginas, rango: rangoPesos };
  }

  // Con texto: se buscan todos los que pasan los filtros y se ordenan por relevancia (el catálogo es pequeño;
  // aun con miles de productos esto toma milisegundos).
  const filas = db.prepare(`${BASE} WHERE ${donde.join(' AND ')} ORDER BY ${ordenBase}`).all(...par);
  const colores = new Map();
  for (const c of db.prepare('SELECT producto_id, nombre FROM producto_colores ORDER BY id').all()) {
    if (!colores.has(c.producto_id)) colores.set(c.producto_id, []);
    colores.get(c.producto_id).push(c.nombre);
  }
  const { resultados, info } = buscar(texto, filas.map((f) => ({
    id: f.id, codigo: f.codigo, nombre: f.nombre, categoria: f.categoria, coleccion: f.coleccion, material: f.material,
    descripcion: f.descripcion, colores: colores.get(f.id) || [], precio: aPesos(f.precio),
  })));
  const puntos = new Map(resultados.map((r) => [r.id, r.puntos]));
  const posicionBase = new Map(filas.map((f, i) => [f.id, i]));
  let encontrados = info.sin_criterio ? filas : filas.filter((f) => puntos.has(f.id));
  const orden = q.orden || info.orden; // el orden elegido manda; si no, "barata" ordena por precio
  if (orden === 'precio_asc') encontrados.sort((a, b) => a.precio - b.precio || a.nombre.localeCompare(b.nombre));
  else if (orden === 'precio_desc') encontrados.sort((a, b) => b.precio - a.precio || a.nombre.localeCompare(b.nombre));
  else if (orden === 'nuevo') encontrados.sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)) || b.id - a.id);
  else encontrados.sort((a, b) => (puntos.get(b.id) || 0) - (puntos.get(a.id) || 0) || posicionBase.get(a.id) - posicionBase.get(b.id));

  const total = encontrados.length;
  const { paginas, pagina } = paginar(total, q.pagina);
  encontrados = encontrados.slice((pagina - 1) * porPagina, pagina * porPagina);
  const { sin_criterio: _s, ...busqueda } = info;
  return { productos: encontrados.map((f) => formatear(f, fav)), total, pagina, paginas, rango: rangoPesos, busqueda };
}

/** RF-3 CA1 / RF-11 — solo las marcadas por el administrador; nunca agotadas ni ocultas (CA3). */
export function listarDestacadas(usuarioId) {
  const filas = db.prepare(`${BASE} WHERE p.destacada = 1 AND p.estatus = 'activo' AND c.estatus = 'activa' AND p.existencias > 0 ORDER BY p.nombre`).all();
  const fav = favoritosDe(usuarioId);
  return filas.map((f) => formatear(f, fav));
}

export function categoriasActivas() {
  return db.prepare("SELECT id, nombre, descripcion FROM categorias WHERE estatus = 'activa' ORDER BY orden, nombre").all();
}

// -------------------------------------------------------------------- Detalle y reseñas
/** ¿Tiene el usuario una compra completada (pedido entregado) de este producto? (RN-8) */
export function compraCompletada(usuarioId, productoId) {
  return !!db.prepare(
    `SELECT 1 FROM pedidos p JOIN pedido_items i ON i.pedido_id = p.id
      WHERE p.usuario_id = ? AND i.producto_id = ? AND p.estatus = 'entregado' LIMIT 1`
  ).get(usuarioId, productoId);
}

export function resumenResenas(productoId) {
  const fila = db.prepare('SELECT COUNT(*) total, ROUND(AVG(calificacion), 1) promedio FROM resenas WHERE producto_id = ? AND oculta = 0').get(productoId);
  const porEstrella = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of db.prepare('SELECT calificacion c, COUNT(*) n FROM resenas WHERE producto_id = ? AND oculta = 0 GROUP BY calificacion').all(productoId)) porEstrella[r.c] = r.n;
  return { total: fila.total, promedio: fila.promedio ?? 0, por_estrella: porEstrella };
}

export function listarResenas(productoId, orden, usuarioId) {
  const ord = { mejores: 'r.calificacion DESC, r.creado_en DESC', utiles: 'likes DESC, r.creado_en DESC' }[orden] || 'r.creado_en DESC';
  const filas = db.prepare(
    `SELECT r.id, r.calificacion, r.comentario, r.verificado, r.creado_en, u.nombres, u.apellido_paterno,
            (SELECT COUNT(*) FROM resena_likes l WHERE l.resena_id = r.id) AS likes,
            EXISTS(SELECT 1 FROM resena_likes l WHERE l.resena_id = r.id AND l.usuario_id = ?) AS di_like
       FROM resenas r JOIN usuarios u ON u.id = r.usuario_id
      WHERE r.producto_id = ? AND r.oculta = 0 ORDER BY ${ord}`
  ).all(usuarioId || 0, productoId);
  return filas.map((r) => ({
    id: r.id, calificacion: r.calificacion, comentario: r.comentario, verificado: !!r.verificado, fecha: r.creado_en,
    autor: `${r.nombres.split(' ')[0]} ${r.apellido_paterno.charAt(0)}.`, likes: r.likes, di_like: !!r.di_like,
  }));
}

export function detalleProducto(id, usuarioId, esAdmin = false) {
  const p = db.prepare(`${BASE} WHERE p.id = ?`).get(id);
  if (!p || (!esAdmin && (p.estatus !== 'activo' || db.prepare('SELECT estatus FROM categorias WHERE id = ?').get(p.categoria_id).estatus !== 'activa'))) {
    throw new ErrorApi(404, 'No encontramos esa mochila. Puede que ya no esté disponible.');
  }
  const base = formatear(p, favoritosDe(usuarioId));
  const fotos = db.prepare('SELECT url FROM producto_fotos WHERE producto_id = ? ORDER BY orden, id').all(id).map((f) => f.url);
  const yaReseno = usuarioId ? !!db.prepare('SELECT 1 FROM resenas WHERE producto_id = ? AND usuario_id = ?').get(id, usuarioId) : false;
  return {
    ...base, descripcion: p.descripcion, material: p.material,
    medidas: { largo: p.largo, alto: p.alto, ancho: p.ancho }, fotos,
    resumen: resumenResenas(id),
    puede_resenar: usuarioId ? compraCompletada(usuarioId, id) && !yaReseno : false,
    ya_reseno: yaReseno,
    compro: usuarioId ? compraCompletada(usuarioId, id) : false,
  };
}

export function crearResena(usuarioId, productoId, { calificacion, comentario }) {
  if (!compraCompletada(usuarioId, productoId)) {
    throw new ErrorApi(403, 'Solo puedes opinar sobre mochilas de pedidos que ya recibiste (compra completada).');
  }
  const cal = Number(calificacion);
  if (!Number.isInteger(cal) || cal < 1 || cal > 5) throw new ErrorApi(422, 'Elige una calificación de 1 a 5 estrellas.', { errores: { calificacion: 'Elige de 1 a 5 estrellas.' } });
  const err = validarComentario(comentario);
  if (err) throw new ErrorApi(422, err, { errores: { comentario: err } });
  if (db.prepare('SELECT 1 FROM resenas WHERE producto_id = ? AND usuario_id = ?').get(productoId, usuarioId)) {
    throw new ErrorApi(409, 'Ya escribiste una reseña de esta mochila (solo se permite una por producto).');
  }
  db.prepare('INSERT INTO resenas(producto_id, usuario_id, calificacion, comentario, verificado, creado_en) VALUES(?,?,?,?,1,?)')
    .run(productoId, usuarioId, cal, String(comentario).trim(), ahora());
}

export function alternarLike(usuarioId, resenaId) {
  const r = db.prepare('SELECT producto_id FROM resenas WHERE id = ? AND oculta = 0').get(resenaId);
  if (!r) throw new ErrorApi(404, 'La reseña no existe.');
  if (!compraCompletada(usuarioId, r.producto_id)) throw new ErrorApi(403, 'Solo puedes dar like si compraste y recibiste esta mochila.');
  const ya = db.prepare('SELECT 1 FROM resena_likes WHERE resena_id = ? AND usuario_id = ?').get(resenaId, usuarioId);
  if (ya) db.prepare('DELETE FROM resena_likes WHERE resena_id = ? AND usuario_id = ?').run(resenaId, usuarioId);
  else db.prepare('INSERT INTO resena_likes(resena_id, usuario_id) VALUES(?,?)').run(resenaId, usuarioId);
  return { di_like: !ya, likes: db.prepare('SELECT COUNT(*) n FROM resena_likes WHERE resena_id = ?').get(resenaId).n };
}

// -------------------------------------------------------------------- Favoritos (RF-12)
export function alternarFavorito(usuarioId, productoId) {
  if (!db.prepare('SELECT 1 FROM productos WHERE id = ?').get(productoId)) throw new ErrorApi(404, 'La mochila no existe.');
  const ya = db.prepare('SELECT 1 FROM favoritos WHERE usuario_id = ? AND producto_id = ?').get(usuarioId, productoId);
  if (ya) db.prepare('DELETE FROM favoritos WHERE usuario_id = ? AND producto_id = ?').run(usuarioId, productoId);
  else db.prepare('INSERT INTO favoritos(usuario_id, producto_id, creado_en) VALUES(?,?,?)').run(usuarioId, productoId, ahora());
  return { favorito: !ya };
}

export function listarFavoritos(usuarioId) {
  const filas = db.prepare(`${BASE} JOIN favoritos f ON f.producto_id = p.id WHERE f.usuario_id = ? ORDER BY f.creado_en DESC`).all(usuarioId);
  return filas.map((f) => ({ ...formatear(f, new Set([f.id])), oculto: f.estatus !== 'activo' }));
}
