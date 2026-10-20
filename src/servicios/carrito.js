import { db, aPesos, configNum, ivaIncluido, ErrorApi, ahora, transaccion } from '../db.js';
import { validarCantidad } from '../validadores.js';

const donde = (o) => (o.usuarioId ? ['usuario_id = ?', o.usuarioId] : ['visitante = ?', o.visitante]);
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const quedan = (n) => (n === 1 ? 'Solo queda 1 pieza' : `Solo quedan ${n} piezas`);

function purgarVencidos(owner) {
  const [cond, val] = donde(owner);
  const dias = configNum('dias_carrito', 7); // RN-12
  db.prepare(`DELETE FROM carrito_items WHERE ${cond} AND actualizado_en < ?`).run(val, new Date(Date.now() - dias * 86_400_000).toISOString());
}

/** Lee el carrito, lo reconcilia con la base (stock, productos ocultos, límites) y calcula los totales. */
export function leerCarrito(owner) {
  return transaccion(() => leerCarritoInterno(owner));
}

function leerCarritoInterno(owner) {
  purgarVencidos(owner);
  const [cond, val] = donde(owner);
  const avisos = [];
  const limModelo = configNum('limite_modelo', 10);
  const limPedido = configNum('limite_pedido', 30);

  let filas = db.prepare(
    `SELECT ci.id, ci.producto_id, ci.color, ci.cantidad, p.codigo, p.nombre, p.precio, p.existencias, p.umbral, p.estatus, c.estatus AS cat_estatus,
            COALESCE((SELECT pc.foto FROM producto_colores pc WHERE pc.producto_id = p.id AND pc.nombre = ci.color),
                     (SELECT url FROM producto_fotos f WHERE f.producto_id = p.id ORDER BY f.orden LIMIT 1)) AS imagen
       FROM carrito_items ci JOIN productos p ON p.id = ci.producto_id JOIN categorias c ON c.id = p.categoria_id
      WHERE ${cond.replace('usuario_id', 'ci.usuario_id').replace('visitante', 'ci.visitante')} ORDER BY ci.id`
  ).all(val);

  // Productos que ya no se pueden comprar
  for (const f of filas.filter((x) => x.estatus !== 'activo' || x.cat_estatus !== 'activa' || x.existencias === 0)) {
    db.prepare('DELETE FROM carrito_items WHERE id = ?').run(f.id);
    avisos.push(`"${f.nombre}" ya no está disponible y se quitó de tu carrito.`);
  }
  filas = filas.filter((x) => x.estatus === 'activo' && x.cat_estatus === 'activa' && x.existencias > 0);

  // RN-2 / RN-18: nunca más que las existencias ni que el límite por modelo
  const porModelo = new Map();
  for (const f of filas) porModelo.set(f.producto_id, [...(porModelo.get(f.producto_id) || []), f]);
  for (const lineas of porModelo.values()) {
    const tope = Math.min(limModelo, lineas[0].existencias);
    let exceso = lineas.reduce((s, l) => s + l.cantidad, 0) - tope;
    if (exceso > 0) {
      avisos.push(`${quedan(tope)} de "${lineas[0].nombre}"; ajustamos la cantidad de tu carrito.`);
      for (const l of [...lineas].reverse()) {
        if (exceso <= 0) break;
        const quitar = Math.min(exceso, l.cantidad);
        l.cantidad -= quitar; exceso -= quitar;
        if (l.cantidad === 0) db.prepare('DELETE FROM carrito_items WHERE id = ?').run(l.id);
        else db.prepare('UPDATE carrito_items SET cantidad = ? WHERE id = ?').run(l.cantidad, l.id);
      }
    }
  }
  filas = filas.filter((x) => x.cantidad > 0);

  const lineas = filas.map((f) => {
    const otros = filas.filter((x) => x.producto_id === f.producto_id && x.id !== f.id).reduce((s, x) => s + x.cantidad, 0);
    const maxLinea = Math.max(1, Math.min(limModelo, f.existencias) - otros);
    return {
      id: f.id, producto_id: f.producto_id, codigo: f.codigo, nombre: f.nombre, color: f.color, cantidad: f.cantidad,
      precio: aPesos(f.precio), subtotal: aPesos(f.precio * f.cantidad), imagen: f.imagen,
      existencias: f.existencias, max: maxLinea, pocas_piezas: f.existencias <= f.umbral,
    };
  });

  const subtotalC = filas.reduce((s, f) => s + f.precio * f.cantidad, 0);
  const minimoC = configNum('envio_gratis_desde', 99900);
  return {
    lineas, avisos,
    piezas: filas.reduce((s, f) => s + f.cantidad, 0),
    subtotal: aPesos(subtotalC),                                   // IVA incluido (RN-5)
    iva_incluido: aPesos(ivaIncluido(subtotalC, configNum('iva_pct', 16))),
    total: aPesos(subtotalC),                                      // sin envío; $0.00 si está vacío (RF-5 CA2)
    envio_gratis_desde: aPesos(minimoC),
    falta_envio_gratis: subtotalC === 0 ? aPesos(minimoC) : aPesos(Math.max(0, minimoC - subtotalC)),
    limite_modelo: limModelo, limite_pedido: limPedido,
  };
}

export const contarPiezas = (owner) => {
  const [cond, val] = donde(owner);
  return db.prepare(`SELECT COALESCE(SUM(cantidad), 0) n FROM carrito_items WHERE ${cond}`).get(val).n;
};

function productoComprable(productoId, color) {
  const p = db.prepare(
    `SELECT p.*, c.estatus AS cat_estatus FROM productos p JOIN categorias c ON c.id = p.categoria_id WHERE p.id = ?`
  ).get(productoId);
  if (!p || p.estatus !== 'activo' || p.cat_estatus !== 'activa') throw new ErrorApi(404, 'Esa mochila ya no está disponible.');
  if (p.existencias === 0) throw new ErrorApi(409, 'Esta mochila está agotada y no puede agregarse al carrito.');
  if (!db.prepare('SELECT 1 FROM producto_colores WHERE producto_id = ? AND nombre = ?').get(productoId, color)) {
    throw new ErrorApi(422, 'Elige un color disponible de esta mochila.');
  }
  return p;
}

/** RF-5 CA1/CA5 — agrega o suma a la línea existente (RN-26). */
export function agregar(owner, { producto_id, color, cantidad }) {
  const errCant = validarCantidad(cantidad);
  if (errCant) throw new ErrorApi(422, errCant);
  const cant = Number(cantidad);
  return transaccion(() => {
    const p = productoComprable(Number(producto_id), color);
    const limModelo = configNum('limite_modelo', 10);
    const tope = Math.min(limModelo, p.existencias);
    if (cant > p.existencias) {
      throw new ErrorApi(409, `Solo ${plural(p.existencias, 'pieza disponible', 'piezas disponibles')} de este modelo. Elige una cantidad menor.`);
    }
    if (cant > limModelo) throw new ErrorApi(409, `Puedes comprar máximo ${limModelo} piezas por modelo.`);

    const [cond, val] = donde(owner);
    const lineas = db.prepare(`SELECT id, color, cantidad FROM carrito_items WHERE ${cond} AND producto_id = ?`).all(val, p.id);
    const propia = lineas.find((l) => l.color === color);
    const otras = lineas.filter((l) => l.color !== color).reduce((s, l) => s + l.cantidad, 0);
    const enCarritoTotal = db.prepare(`SELECT COALESCE(SUM(cantidad),0) n FROM carrito_items WHERE ${cond}`).get(val).n;

    let espacio = tope - otras - (propia?.cantidad || 0);
    espacio = Math.min(espacio, configNum('limite_pedido', 30) - enCarritoTotal);
    if (espacio <= 0) {
      const porPedido = enCarritoTotal >= configNum('limite_pedido', 30);
      throw new ErrorApi(409, porPedido
        ? `Tu carrito ya tiene el máximo de ${configNum('limite_pedido', 30)} piezas por pedido.`
        : `Ya tienes en tu carrito el máximo disponible de este modelo (${plural(tope, 'pieza', 'piezas')}).`);
    }
    const sumar = Math.min(cant, espacio);
    const ajustado = sumar < cant;
    if (propia) db.prepare('UPDATE carrito_items SET cantidad = cantidad + ?, actualizado_en = ? WHERE id = ?').run(sumar, ahora(), propia.id);
    else {
      const cols = owner.usuarioId ? ['usuario_id', owner.usuarioId] : ['visitante', owner.visitante];
      db.prepare(`INSERT INTO carrito_items(${cols[0]}, producto_id, color, cantidad, actualizado_en) VALUES(?,?,?,?,?)`).run(cols[1], p.id, color, sumar, ahora());
    }
    return {
      ajustado,
      mensaje: ajustado
        ? `Agregamos ${plural(sumar, 'pieza', 'piezas')}: ese es el máximo permitido para este modelo.`
        : `Agregaste "${p.nombre}" (${color}) a tu carrito.`,
    };
  });
}

/** RF-5 CA3 — cambia la cantidad de una línea (mínimo 1; se corrige al máximo permitido). */
export function actualizarCantidad(owner, itemId, cantidad) {
  const err = validarCantidad(cantidad);
  if (err) throw new ErrorApi(422, err);
  return transaccion(() => {
    const [cond, val] = donde(owner);
    const item = db.prepare(`SELECT * FROM carrito_items WHERE id = ? AND ${cond}`).get(itemId, val);
    if (!item) throw new ErrorApi(404, 'Ese producto ya no está en tu carrito.');
    const p = db.prepare('SELECT existencias, nombre FROM productos WHERE id = ?').get(item.producto_id);
    const otras = db.prepare(`SELECT COALESCE(SUM(cantidad),0) n FROM carrito_items WHERE ${cond} AND producto_id = ? AND id <> ?`).get(val, item.producto_id, item.id).n;
    const totalOtros = db.prepare(`SELECT COALESCE(SUM(cantidad),0) n FROM carrito_items WHERE ${cond} AND id <> ?`).get(val, item.id).n;
    const maxModelo = Math.min(configNum('limite_modelo', 10), p.existencias) - otras;
    const maxPedido = configNum('limite_pedido', 30) - totalOtros;
    const maximo = Math.max(1, Math.min(maxModelo, maxPedido));
    const final = Math.min(Number(cantidad), maximo);
    db.prepare('UPDATE carrito_items SET cantidad = ?, actualizado_en = ? WHERE id = ?').run(final, ahora(), item.id);
    return { ajustado: final < Number(cantidad), mensaje: final < Number(cantidad) ? `El máximo para "${p.nombre}" es ${plural(maximo, 'pieza', 'piezas')}; ajustamos la cantidad.` : null };
  });
}

export function eliminar(owner, itemId) {
  const [cond, val] = donde(owner);
  db.prepare(`DELETE FROM carrito_items WHERE id = ? AND ${cond}`).run(itemId, val);
}

/** Al iniciar sesión o crear cuenta, el carrito del visitante pasa a la cuenta conservando su contenido (RF-1 CA2). */
export function fusionar(visitante, usuarioId) {
  transaccion(() => {
    const items = db.prepare('SELECT * FROM carrito_items WHERE visitante = ? ORDER BY id').all(visitante);
    for (const it of items) {
      try {
        agregar({ usuarioId }, { producto_id: it.producto_id, color: it.color, cantidad: it.cantidad });
      } catch { /* si ya no se puede agregar, se omite */ }
    }
    db.prepare('DELETE FROM carrito_items WHERE visitante = ?').run(visitante);
  });
}
