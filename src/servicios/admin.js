import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, aCentavos, aPesos, ahora, configNum, config_, guardarConfig, ErrorApi, transaccion, registrarMovimiento } from '../db.js';
import { config } from '../config.js';
import { validarPrecio, validarMedida, validarEnteroNoNegativo, validarTexto, limpiar } from '../validadores.js';
import { formatearPedido } from './pedidos.js';
import { correoCambioEstatus, correoResolucionDevolucion } from '../correos.js';

// ====================================================================== Tablero
export function contadores() {
  return {
    pedidos_nuevos: db.prepare('SELECT COUNT(*) n FROM pedidos WHERE visto_admin = 0').get().n,
    stock_bajo: db.prepare("SELECT COUNT(*) n FROM productos WHERE existencias <= umbral AND estatus = 'activo'").get().n,
    devoluciones_pendientes: db.prepare("SELECT COUNT(*) n FROM devoluciones WHERE estatus = 'pendiente'").get().n,
  };
}

// ====================================================================== Pedidos (RF-18 CA5/CA6)
const inicioDiaMX = (desplazarDias = 0) => {
  const hoyMX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }); // AAAA-MM-DD
  return new Date(new Date(`${hoyMX}T00:00:00-06:00`).getTime() + desplazarDias * 86_400_000);
};

export function listarPedidosAdmin(q) {
  const donde = [], par = [];
  const est = String(q.estatus || '');
  if (est === 'nuevo') donde.push('p.visto_admin = 0');
  else if (['pagado', 'preparando', 'enviado', 'entregado', 'cancelado', 'devuelto'].includes(est)) { donde.push('p.estatus = ?'); par.push(est); }
  const f = String(q.fecha || '');
  if (f === 'hoy') { donde.push('p.creado_en >= ?'); par.push(inicioDiaMX().toISOString()); }
  else if (f === 'ayer') { donde.push('p.creado_en >= ? AND p.creado_en < ?'); par.push(inicioDiaMX(-1).toISOString(), inicioDiaMX().toISOString()); }
  else if (f === '7d') { donde.push('p.creado_en >= ?'); par.push(inicioDiaMX(-6).toISOString()); }
  else if (f === '30d') { donde.push('p.creado_en >= ?'); par.push(inicioDiaMX(-29).toISOString()); }
  const texto = String(q.q || '').trim();
  if (texto) {
    donde.push("(p.folio LIKE ? OR u.nombres || ' ' || u.apellido_paterno || ' ' || u.apellido_materno LIKE ? OR u.correo LIKE ?)");
    par.push(`%${texto}%`, `%${texto}%`, `%${texto}%`);
  }
  const W = donde.length ? `WHERE ${donde.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id ${W}`).get(...par).n;
  const porPagina = 10;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(Math.max(Number(q.pagina) || 1, 1), paginas);
  const filas = db.prepare(
    `SELECT p.id, p.folio, p.estatus, p.total, p.creado_en, p.visto_admin, u.nombres || ' ' || u.apellido_paterno || ' ' || u.apellido_materno AS cliente
       FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id ${W} ORDER BY p.id DESC LIMIT ? OFFSET ?`
  ).all(...par, porPagina, (pagina - 1) * porPagina);
  return { pedidos: filas.map((p) => ({ ...p, total: aPesos(p.total), nuevo: !p.visto_admin })), total, pagina, paginas };
}

export function detallePedidoAdmin(id) {
  const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  if (!p) throw new ErrorApi(404, 'El pedido no existe.');
  db.prepare('UPDATE pedidos SET visto_admin = 1 WHERE id = ?').run(id); // deja de ser "Pedido nuevo"
  const u = db.prepare('SELECT nombres, apellido_paterno, apellido_materno, correo, telefono FROM usuarios WHERE id = ?').get(p.usuario_id);
  return { ...formatearPedido(p, { admin: true }), cliente: u };
}

const ORDEN = ['pagado', 'preparando', 'enviado', 'entregado'];
export function cambiarEstatus(admin, id, { estatus, numero_guia }) {
  const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  if (!p) throw new ErrorApi(404, 'El pedido no existe.');
  if (!ORDEN.includes(estatus)) throw new ErrorApi(422, 'Elige un estatus válido: pagado, preparando, enviado o entregado.');
  if (['cancelado', 'devuelto'].includes(p.estatus)) throw new ErrorApi(409, `El pedido está ${p.estatus} y ya no puede cambiar de estatus.`);
  if (ORDEN.indexOf(estatus) < ORDEN.indexOf(p.estatus)) throw new ErrorApi(409, 'El estatus no puede retroceder.');
  const guia = String(numero_guia ?? '').trim() || p.numero_guia || null;
  if (guia && !/^[A-Za-z0-9-]{4,30}$/.test(guia)) throw new ErrorApi(422, 'El número de guía debe tener de 4 a 30 caracteres (letras, números o guion).', { errores: { numero_guia: 'De 4 a 30 caracteres: letras, números o guion.' } });
  if (estatus === 'enviado' && !guia) throw new ErrorApi(422, 'Registra el número de guía para marcar el pedido como enviado.', { errores: { numero_guia: 'Obligatorio al marcar como enviado.' } });
  if (estatus === p.estatus && guia === p.numero_guia) throw new ErrorApi(422, 'No hay cambios que guardar.');

  transaccion(() => {
    db.prepare('UPDATE pedidos SET estatus = ?, numero_guia = ?, entregado_en = CASE WHEN ? = \'entregado\' AND entregado_en IS NULL THEN ? ELSE entregado_en END WHERE id = ?')
      .run(estatus, guia, estatus, ahora(), id);
    db.prepare('INSERT INTO pedido_historial(pedido_id, estatus, nota, autor) VALUES(?,?,?,?)')
      .run(id, estatus, guia && guia !== p.numero_guia ? `Guía: ${guia}` : null, `${admin.nombres} (administrador)`);
  });
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(p.usuario_id);
  correoCambioEstatus(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id), usuario); // RF-7 CA3
}

// ====================================================================== Categorías (RF-18 CA2)
export const listarCategorias = () =>
  db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id) AS productos FROM categorias c ORDER BY c.orden, c.nombre`).all();

export function guardarCategoria({ id, nombre, estatus }) {
  const err = validarTexto(nombre, 'El nombre de la categoría', { max: 40 });
  const errores = {};
  if (err) errores.nombre = err;
  if (!['activa', 'oculta'].includes(estatus)) errores.estatus = 'Elige activa u oculta.';
  const dup = db.prepare('SELECT id FROM categorias WHERE nombre = ? COLLATE NOCASE').get(limpiar(nombre));
  if (dup && dup.id !== Number(id)) errores.nombre = 'Ya existe una categoría con ese nombre.';
  if (Object.keys(errores).length) throw new ErrorApi(422, 'Revisa los datos de la categoría.', { errores });
  if (id) db.prepare('UPDATE categorias SET nombre = ?, estatus = ? WHERE id = ?').run(limpiar(nombre), estatus, id);
  else db.prepare('INSERT INTO categorias(nombre, estatus, orden) VALUES(?,?,(SELECT COALESCE(MAX(orden),0)+1 FROM categorias))').run(limpiar(nombre), estatus);
}

/** Una categoría con mochilas asociadas no se elimina: solo se oculta. */
export function eliminarCategoria(id) {
  const n = db.prepare('SELECT COUNT(*) n FROM productos WHERE categoria_id = ?').get(id).n;
  if (n > 0) {
    db.prepare("UPDATE categorias SET estatus = 'oculta' WHERE id = ?").run(id);
    return { oculta: true, mensaje: 'La categoría tiene mochilas asociadas, por eso no se eliminó: quedó oculta.' };
  }
  db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
  return { oculta: false, mensaje: 'Categoría eliminada.' };
}

// ====================================================================== Catálogo (RF-18 CA1/CA3)
const salidaProducto = (p) => ({
  id: p.id, codigo: p.codigo, nombre: p.nombre, categoria_id: p.categoria_id, categoria: p.categoria, coleccion: p.coleccion,
  descripcion: p.descripcion, material: p.material, largo: p.largo, alto: p.alto, ancho: p.ancho, precio: aPesos(p.precio),
  existencias: p.existencias, umbral: p.umbral, estatus: p.estatus, destacada: !!p.destacada,
  colores: db.prepare('SELECT nombre, hex, foto FROM producto_colores WHERE producto_id = ? ORDER BY id').all(p.id),
  fotos: db.prepare('SELECT url FROM producto_fotos WHERE producto_id = ? ORDER BY orden, id').all(p.id).map((f) => f.url),
  imagen: db.prepare('SELECT url FROM producto_fotos WHERE producto_id = ? ORDER BY orden, id LIMIT 1').get(p.id)?.url,
});

export function listarProductosAdmin() {
  return db.prepare('SELECT p.*, c.nombre AS categoria FROM productos p JOIN categorias c ON c.id = p.categoria_id ORDER BY p.id').all().map(salidaProducto);
}

function validarProducto(d, idActual) {
  const e = {};
  const cod = String(d.codigo ?? '').trim();
  if (!cod) e.codigo = 'El código es obligatorio.';
  else if (!/^[A-Za-z0-9-]{2,20}$/.test(cod)) e.codigo = 'El código debe tener de 2 a 20 caracteres (letras, números o guion).';
  else {
    const dup = db.prepare('SELECT id FROM productos WHERE codigo = ? COLLATE NOCASE').get(cod);
    if (dup && dup.id !== idActual) e.codigo = 'Ya existe una mochila con ese código.';
  }
  const n = validarTexto(d.nombre, 'El nombre', { max: 80 }); if (n) e.nombre = n;
  if (!db.prepare("SELECT 1 FROM categorias WHERE id = ?").get(Number(d.categoria_id))) e.categoria_id = 'Elige una categoría.';
  if (String(d.coleccion ?? '').length > 60) e.coleccion = 'La colección no puede superar 60 caracteres.';
  const de = validarTexto(d.descripcion, 'La descripción', { max: 1000 }); if (de) e.descripcion = de;
  const m = validarTexto(d.material, 'El material', { max: 60 }); if (m) e.material = m;
  for (const k of ['largo', 'alto', 'ancho']) { const r = validarMedida(d[k], `El ${k}`); if (r) e[k] = r; }
  const pr = validarPrecio(d.precio); if (pr) e.precio = pr;
  const ex = validarEnteroNoNegativo(d.existencias, 'Las existencias'); if (ex) e.existencias = ex;
  const um = validarEnteroNoNegativo(d.umbral, 'El umbral de alerta'); if (um) e.umbral = um;
  if (!['activo', 'oculto'].includes(d.estatus)) e.estatus = 'Elige activo u oculto.';
  const cols = Array.isArray(d.colores) ? d.colores : [];
  if (!cols.length) e.colores = 'Agrega al menos un color.';
  else if (cols.some((c) => !limpiar(c.nombre) || !/^#[0-9a-fA-F]{6}$/.test(c.hex || ''))) e.colores = 'Cada color necesita nombre y un tono válido.';
  else if (new Set(cols.map((c) => limpiar(c.nombre).toLowerCase())).size !== cols.length) e.colores = 'Los colores no pueden repetirse.';
  return e;
}

export function guardarProducto(admin, d) {
  const id = d.id ? Number(d.id) : null;
  const errores = validarProducto(d, id);
  if (Object.keys(errores).length) throw new ErrorApi(422, 'Revisa los campos marcados.', { errores });
  const campos = [
    String(d.codigo).trim(), limpiar(d.nombre), Number(d.categoria_id), limpiar(d.coleccion) || null, String(d.descripcion).trim(), limpiar(d.material),
    Number(d.largo), Number(d.alto), Number(d.ancho), aCentavos(d.precio), Number(d.existencias), Number(d.umbral), d.estatus, d.destacada ? 1 : 0,
  ];
  return transaccion(() => {
    let pid = id;
    if (id) {
      const antes = db.prepare('SELECT existencias FROM productos WHERE id = ?').get(id);
      if (!antes) throw new ErrorApi(404, 'La mochila no existe.');
      db.prepare(`UPDATE productos SET codigo=?, nombre=?, categoria_id=?, coleccion=?, descripcion=?, material=?, largo=?, alto=?, ancho=?, precio=?, existencias=?, umbral=?, estatus=?, destacada=? WHERE id=?`).run(...campos, id);
      if (antes.existencias !== Number(d.existencias)) {
        registrarMovimiento({ usuarioId: admin.id, productoId: id, tipo: 'ajuste', cantidad: Number(d.existencias) - antes.existencias, resultante: Number(d.existencias), referencia: 'Edición de la mochila' });
      }
    } else {
      pid = Number(db.prepare(`INSERT INTO productos(codigo,nombre,categoria_id,coleccion,descripcion,material,largo,alto,ancho,precio,existencias,umbral,estatus,destacada) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...campos).lastInsertRowid);
      if (Number(d.existencias) > 0) registrarMovimiento({ usuarioId: admin.id, productoId: pid, tipo: 'entrada', cantidad: Number(d.existencias), resultante: Number(d.existencias), referencia: 'Alta de la mochila' });
    }
    // Colores y fotos: se reemplazan por lo capturado
    const previos = db.prepare('SELECT nombre, foto FROM producto_colores WHERE producto_id = ?').all(pid);
    db.prepare('DELETE FROM producto_colores WHERE producto_id = ?').run(pid);
    for (const c of d.colores) {
      const foto = previos.find((x) => x.nombre === limpiar(c.nombre))?.foto || c.foto || null;
      db.prepare('INSERT INTO producto_colores(producto_id, nombre, hex, foto) VALUES(?,?,?,?)').run(pid, limpiar(c.nombre), c.hex, foto);
    }
    const fotos = (Array.isArray(d.fotos) ? d.fotos : []).filter((u) => /^(\/img\/|\/subidas\/|\/api\/ilustracion\/)/.test(u));
    if (!fotos.length) fotos.push(`/api/ilustracion/${d.forma || 'mochila'}.svg?c1=${encodeURIComponent(d.colores[0].hex)}&c2=%23FF6B2C`);
    db.prepare('DELETE FROM producto_fotos WHERE producto_id = ?').run(pid);
    fotos.forEach((u, i) => db.prepare('INSERT INTO producto_fotos(producto_id, url, orden) VALUES(?,?,?)').run(pid, u, i));
    return pid;
  });
}

export function alternarDestacada(id) {
  const p = db.prepare('SELECT destacada FROM productos WHERE id = ?').get(id);
  if (!p) throw new ErrorApi(404, 'La mochila no existe.');
  db.prepare('UPDATE productos SET destacada = ? WHERE id = ?').run(p.destacada ? 0 : 1, id);
  return { destacada: !p.destacada };
}

export function alternarEstatus(id) {
  const p = db.prepare('SELECT estatus FROM productos WHERE id = ?').get(id);
  if (!p) throw new ErrorApi(404, 'La mochila no existe.');
  const nuevo = p.estatus === 'activo' ? 'oculto' : 'activo';
  db.prepare('UPDATE productos SET estatus = ? WHERE id = ?').run(nuevo, id);
  return { estatus: nuevo };
}

/** Un producto con pedidos asociados no se elimina: solo se oculta (RF-18 CA3). */
export function eliminarProducto(id) {
  if (!db.prepare('SELECT 1 FROM productos WHERE id = ?').get(id)) throw new ErrorApi(404, 'La mochila no existe.');
  if (db.prepare('SELECT 1 FROM pedido_items WHERE producto_id = ?').get(id) || db.prepare('SELECT 1 FROM movimientos_inventario WHERE producto_id = ? LIMIT 1').get(id)) {
    db.prepare("UPDATE productos SET estatus = 'oculto', destacada = 0 WHERE id = ?").run(id);
    return { oculto: true, mensaje: 'La mochila tiene pedidos o movimientos asociados, por eso no se eliminó: quedó oculta.' };
  }
  db.prepare('DELETE FROM productos WHERE id = ?').run(id);
  return { oculto: false, mensaje: 'Mochila eliminada.' };
}

/** Sube una foto (data URL) a data/subidas. Solo PNG, JPG o WEBP de máximo 2 MB. */
export function guardarFoto(dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new ErrorApi(422, 'La foto debe ser una imagen PNG, JPG o WEBP.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) throw new ErrorApi(422, 'La foto no puede pesar más de 2 MB.');
  const nombre = `${crypto.randomBytes(12).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(config.carpetaSubidas, nombre), buf);
  return `/subidas/${nombre}`;
}

// ====================================================================== Inventario (RF-18 CA4/CA7, RNF-4 CA4)
export function inventario() {
  return {
    alertas: db.prepare("SELECT id, codigo, nombre, existencias, umbral FROM productos WHERE existencias <= umbral AND estatus = 'activo' ORDER BY existencias, nombre").all()
      .map((p) => ({ ...p, agotado: p.existencias === 0 })),
    productos: db.prepare('SELECT id, codigo, nombre, existencias FROM productos ORDER BY nombre').all(),
    movimientos: db.prepare(
      `SELECT m.fecha, m.tipo, m.cantidad, m.existencias_resultantes, m.referencia, p.nombre AS producto, p.codigo,
              COALESCE(u.nombres || ' ' || u.apellido_paterno, 'Sistema') AS usuario
         FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id LEFT JOIN usuarios u ON u.id = m.usuario_id
        ORDER BY m.id DESC LIMIT 40`
    ).all(),
  };
}

export function registrarEntrada(admin, { producto_id, cantidad }) {
  const err = validarEnteroNoNegativo(cantidad, 'La cantidad');
  if (err || Number(cantidad) < 1 || Number(cantidad) > 100000) {
    throw new ErrorApi(422, 'La cantidad debe ser un número entero de 1 en adelante.', { errores: { cantidad: 'Escribe un entero de 1 en adelante.' } });
  }
  return transaccion(() => {
    const p = db.prepare('SELECT id, nombre FROM productos WHERE id = ?').get(Number(producto_id));
    if (!p) throw new ErrorApi(422, 'Elige un modelo de la lista.', { errores: { producto_id: 'Elige un modelo.' } });
    db.prepare('UPDATE productos SET existencias = existencias + ? WHERE id = ?').run(Number(cantidad), p.id);
    const { existencias } = db.prepare('SELECT existencias FROM productos WHERE id = ?').get(p.id);
    registrarMovimiento({ usuarioId: admin.id, productoId: p.id, tipo: 'entrada', cantidad: Number(cantidad), resultante: existencias, referencia: 'Entrada de inventario' });
    return { existencias, nombre: p.nombre };
  });
}

// ====================================================================== Devoluciones (RF-15 CA3, RN-22)
export function listarDevoluciones() {
  return db.prepare(
    `SELECT d.*, p.folio, p.total, u.nombres || ' ' || u.apellido_paterno || ' ' || u.apellido_materno AS cliente
       FROM devoluciones d JOIN pedidos p ON p.id = d.pedido_id JOIN usuarios u ON u.id = d.usuario_id
      ORDER BY (d.estatus = 'pendiente') DESC, d.id DESC`
  ).all().map((d) => ({ ...d, total: aPesos(d.total) }));
}

export function resolverDevolucion(admin, id, { decision, respuesta, reingresar }) {
  const d = db.prepare('SELECT * FROM devoluciones WHERE id = ?').get(id);
  if (!d) throw new ErrorApi(404, 'La solicitud no existe.');
  if (d.estatus !== 'pendiente') throw new ErrorApi(409, 'Esta solicitud ya fue resuelta.');
  if (!['aprobada', 'rechazada'].includes(decision)) throw new ErrorApi(422, 'Elige aprobar o rechazar.');
  const texto = String(respuesta || '').trim();
  if (decision === 'rechazada' && !texto) throw new ErrorApi(422, 'Escribe el motivo del rechazo para informárselo al cliente.', { errores: { respuesta: 'Obligatorio al rechazar.' } });
  if (texto.length > 300) throw new ErrorApi(422, 'La respuesta no puede superar 300 caracteres.', { errores: { respuesta: 'Máximo 300 caracteres.' } });
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(d.pedido_id);
  transaccion(() => {
    db.prepare('UPDATE devoluciones SET estatus = ?, respuesta = ?, reingreso_inventario = ?, resuelto_en = ? WHERE id = ?')
      .run(decision, texto || null, decision === 'aprobada' && reingresar ? 1 : 0, ahora(), id);
    if (decision === 'aprobada') {
      db.prepare("UPDATE pedidos SET estatus = 'devuelto' WHERE id = ?").run(pedido.id);
      db.prepare('INSERT INTO pedido_historial(pedido_id, estatus, nota, autor) VALUES(?,?,?,?)').run(pedido.id, 'devuelto', 'Devolución aprobada', `${admin.nombres} (administrador)`);
      if (reingresar) { // RN-22: solo regresa al inventario si llega en buen estado
        for (const i of db.prepare('SELECT producto_id, SUM(cantidad) n FROM pedido_items WHERE pedido_id = ? GROUP BY producto_id').all(pedido.id)) {
          db.prepare('UPDATE productos SET existencias = existencias + ? WHERE id = ?').run(i.n, i.producto_id);
          const { existencias } = db.prepare('SELECT existencias FROM productos WHERE id = ?').get(i.producto_id);
          registrarMovimiento({ usuarioId: admin.id, productoId: i.producto_id, tipo: 'devolucion', cantidad: i.n, resultante: existencias, referencia: pedido.folio });
        }
      }
    }
  });
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(d.usuario_id);
  correoResolucionDevolucion(pedido, usuario, db.prepare('SELECT * FROM devoluciones WHERE id = ?').get(id));
}

// ====================================================================== Reseñas (RN-21)
export const listarResenasAdmin = () =>
  db.prepare(
    `SELECT r.id, r.calificacion, r.comentario, r.oculta, r.creado_en, p.nombre AS producto,
            u.nombres || ' ' || u.apellido_paterno AS autor
       FROM resenas r JOIN productos p ON p.id = r.producto_id JOIN usuarios u ON u.id = r.usuario_id ORDER BY r.id DESC`
  ).all().map((r) => ({ ...r, oculta: !!r.oculta }));

export function alternarResena(id) {
  const r = db.prepare('SELECT oculta FROM resenas WHERE id = ?').get(id);
  if (!r) throw new ErrorApi(404, 'La reseña no existe.');
  db.prepare('UPDATE resenas SET oculta = ? WHERE id = ?').run(r.oculta ? 0 : 1, id);
  return { oculta: !r.oculta };
}

// ====================================================================== Configuración (RF-18 CA8)
export function leerConfiguracion() {
  return {
    zonas: db.prepare('SELECT id, nombre, tarifa, costo, dias_min, dias_max FROM zonas_envio ORDER BY id').all().map((z) => ({ ...z, costo: aPesos(z.costo) })),
    envio_gratis_desde: aPesos(configNum('envio_gratis_desde', 99900)),
    limite_modelo: configNum('limite_modelo', 10),
    limite_pedido: configNum('limite_pedido', 30),
    video_url: config_('video_url', ''),
  };
}

export function guardarConfiguracion(d) {
  const e = {};
  const costos = {};
  for (const z of d.zonas || []) {
    const r = /^\d+(\.\d{1,2})?$/.test(String(z.costo ?? '').trim()) ? null : 'El costo debe ser un número de 0 en adelante con máximo 2 decimales.';
    if (r) e[`zona_${z.id}`] = r; else costos[z.id] = aCentavos(z.costo);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(String(d.envio_gratis_desde ?? '').trim()) || Number(d.envio_gratis_desde) <= 0) e.envio_gratis_desde = 'El monto mínimo debe ser mayor a 0 (máximo 2 decimales).';
  const lm = validarEnteroNoNegativo(d.limite_modelo, 'El límite por modelo');
  if (lm || Number(d.limite_modelo) < 1) e.limite_modelo = 'Escribe un entero de 1 en adelante.';
  const lp = validarEnteroNoNegativo(d.limite_pedido, 'El límite por pedido');
  if (lp || Number(d.limite_pedido) < 1) e.limite_pedido = 'Escribe un entero de 1 en adelante.';
  if (!e.limite_modelo && !e.limite_pedido && Number(d.limite_pedido) < Number(d.limite_modelo)) e.limite_pedido = 'El límite por pedido no puede ser menor al límite por modelo.';
  const video = String(d.video_url ?? '').trim();
  if (d.video_url !== undefined && !/^https?:\/\/[^\s]{3,290}$/i.test(video)) e.video_url = 'Escribe un enlace válido que empiece con https:// (YouTube, TikTok, Instagram o un archivo .mp4).';
  if (Object.keys(e).length) throw new ErrorApi(422, 'Revisa los valores de configuración.', { errores: e });
  transaccion(() => {
    for (const [id, c] of Object.entries(costos)) db.prepare('UPDATE zonas_envio SET costo = ? WHERE id = ?').run(c, id);
    guardarConfig('envio_gratis_desde', aCentavos(d.envio_gratis_desde));
    guardarConfig('limite_modelo', Number(d.limite_modelo));
    guardarConfig('limite_pedido', Number(d.limite_pedido));
    if (d.video_url !== undefined) guardarConfig('video_url', video);
  });
}

export const listarCorreos = () => db.prepare('SELECT id, fecha, para, asunto, adjunto, estado_envio FROM correos ORDER BY id DESC LIMIT 60').all();
export const correoPorId = (id) => db.prepare('SELECT * FROM correos WHERE id = ?').get(id);
