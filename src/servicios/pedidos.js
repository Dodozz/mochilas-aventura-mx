import { db, aPesos, ahora, configNum, configuracion, num, ivaIncluido, ErrorApi, transaccion, siguienteFolio, registrarMovimiento } from '../db.js';
import { validarDireccion, validarDatosTarjeta, soloDigitos, limpiar } from '../validadores.js';
import { nombreCompleto } from '../formato.js';
import { leerCarrito } from './carrito.js';
import { correoComprobante, correoNuevoPedidoAdmin, correoCancelacion } from '../correos.js';

// ====================================================================== Geografía y envíos
export const listarEstados = () => db.prepare('SELECT id, nombre FROM estados ORDER BY nombre COLLATE NOCASE').all();
export const listarMunicipios = (estadoId) => db.prepare('SELECT id, nombre FROM municipios WHERE estado_id = ? ORDER BY nombre COLLATE NOCASE').all(estadoId);

/** RN-17: la zona sale del estado; el envío es gratis desde el monto mínimo (RN-6). Montos en centavos. */
export async function calcularEnvio(estadoId, subtotalC) {
  const z = await db.prepare('SELECT z.* FROM estados e JOIN zonas_envio z ON z.id = e.zona_id WHERE e.id = ?').get(estadoId);
  if (!z) throw new ErrorApi(422, 'Selecciona un estado de la lista.');
  const gratis = subtotalC >= await configNum('envio_gratis_desde', 99900);
  return {
    zona_nombre: z.nombre, tarifa: z.tarifa, costo_base: z.costo, costo: gratis ? 0 : z.costo, gratis,
    tiempo: `${z.dias_min} a ${z.dias_max} días`,
  };
}

// ====================================================================== Direcciones (RF-7 CA1, RF-19)
const SELECT_DIR = `SELECT d.*, e.nombre AS estado, m.nombre AS municipio FROM direcciones d
  JOIN estados e ON e.id = d.estado_id JOIN municipios m ON m.id = d.municipio_id`;

export const listarDirecciones = (usuarioId) => db.prepare(`${SELECT_DIR} WHERE d.usuario_id = ? ORDER BY d.id`).all(usuarioId);

function normalizarDireccion(d) {
  return {
    alias: limpiar(d.alias) || 'Casa', estado_id: Number(d.estado_id) || 0, municipio_id: Number(d.municipio_id) || 0,
    calle: limpiar(d.calle), colonia: limpiar(d.colonia), cp: String(d.cp ?? '').trim(),
    num_ext: limpiar(d.num_ext) || null, num_int: limpiar(d.num_int) || null, referencias: String(d.referencias ?? '').trim() || null,
  };
}

async function validarDireccionCompleta(d) {
  const e = validarDireccion(d);
  if (!e.estado_id && !await db.prepare('SELECT 1 FROM estados WHERE id = ?').get(d.estado_id)) e.estado_id = 'Selecciona un estado de la lista.';
  if (!e.municipio_id && !await db.prepare('SELECT 1 FROM municipios WHERE id = ? AND estado_id = ?').get(d.municipio_id, d.estado_id)) {
    e.municipio_id = 'Selecciona un municipio del estado elegido.';
  }
  if (d.alias && d.alias.length > 30) e.alias = 'El nombre de la dirección no puede superar 30 caracteres.';
  return e;
}

export async function guardarDireccion(usuarioId, datos, id = null) {
  const d = normalizarDireccion(datos);
  const errores = await validarDireccionCompleta(d);
  if (Object.keys(errores).length) throw new ErrorApi(422, 'Revisa los datos de la dirección.', { errores });
  if (id) {
    const r = await db.prepare(
      `UPDATE direcciones SET alias=?, estado_id=?, municipio_id=?, calle=?, colonia=?, cp=?, num_ext=?, num_int=?, referencias=? WHERE id=? AND usuario_id=?`
    ).run(d.alias, d.estado_id, d.municipio_id, d.calle, d.colonia, d.cp, d.num_ext, d.num_int, d.referencias, id, usuarioId);
    if (!r.changes) throw new ErrorApi(404, 'La dirección no existe.');
    return id;
  }
  return Number((await db.prepare(
    `INSERT INTO direcciones(usuario_id, alias, estado_id, municipio_id, calle, colonia, cp, num_ext, num_int, referencias) VALUES(?,?,?,?,?,?,?,?,?,?)`
  ).run(usuarioId, d.alias, d.estado_id, d.municipio_id, d.calle, d.colonia, d.cp, d.num_ext, d.num_int, d.referencias)).lastInsertRowid);
}

export async function eliminarDireccion(usuarioId, id) {
  const r = await db.prepare('DELETE FROM direcciones WHERE id = ? AND usuario_id = ?').run(id, usuarioId);
  if (!r.changes) throw new ErrorApi(404, 'La dirección no existe.');
}

// ====================================================================== Resumen previo al pago (RF-6 CA3)
export async function resumenCheckout(owner, estadoId) {
  const carrito = await leerCarrito(owner);
  const subtotalC = Math.round(carrito.subtotal * 100);
  let envio = null;
  if (estadoId) envio = await calcularEnvio(Number(estadoId), subtotalC);
  const envioC = envio ? envio.costo : 0;
  return {
    carrito, envio: envio && { ...envio, costo: aPesos(envio.costo), costo_base: aPesos(envio.costo_base) },
    subtotal: carrito.subtotal, iva_incluido: carrito.iva_incluido,
    total: aPesos(subtotalC + envioC), // RN-5: el IVA no se suma
  };
}

// ====================================================================== Pago simulado (RF-6, RF-8, RN-4)
export async function pagar(usuario, body) {
  const owner = { usuarioId: usuario.id };
  const carritoPrevio = await leerCarrito(owner);
  // Si las existencias cambiaron, leerCarrito ya ajustó el carrito: se avisa y NO se cobra hasta que el cliente lo confirme (RF-8 CA4)
  if (carritoPrevio.avisos.length) throw new ErrorApi(409, carritoPrevio.avisos.join(' '), { carrito_ajustado: true });
  if (!carritoPrevio.lineas.length) throw new ErrorApi(409, 'Tu carrito está vacío. Agrega una mochila para continuar.');

  // ---- Validación en servidor (RF-6 CA5, RF-20)
  const errores = {};
  let dir = null;
  if (body.direccion_id) {
    dir = await db.prepare(`${SELECT_DIR} WHERE d.id = ? AND d.usuario_id = ?`).get(Number(body.direccion_id), usuario.id);
    if (!dir) errores.direccion = { general: 'La dirección seleccionada no existe. Elige o captura una dirección de entrega.' };
  } else if (body.direccion && typeof body.direccion === 'object') {
    const d = normalizarDireccion(body.direccion);
    const e = await validarDireccionCompleta(d);
    if (Object.keys(e).length) errores.direccion = e;
    else dir = d;
  } else {
    errores.direccion = { general: 'Falta la dirección de entrega.' };
  }
  const t = body.tarjeta || {};
  const et = validarDatosTarjeta(t);
  if (Object.keys(et).length) errores.tarjeta = et;
  if (!body.acepta_politicas) errores.politicas = 'Debes aceptar las políticas de la tienda para pagar.';
  if (Object.keys(errores).length) throw new ErrorApi(422, 'Revisa los campos marcados: faltan datos o no tienen el formato correcto.', { errores });

  const resultado = await transaccion(async () => {
    // ---- Transacción: el stock se vuelve a leer y se descuenta con bloqueo de escritura (RNF-4 CA2)
    const [cond, val] = ['usuario_id = ?', usuario.id];
    const cfg = await configuracion();
    const lineas = await db.prepare(
      `SELECT ci.*, p.nombre, p.codigo, p.precio, p.existencias, p.estatus FROM carrito_items ci JOIN productos p ON p.id = ci.producto_id WHERE ci.${cond} ORDER BY ci.id`
    ).all(val);
    const porModelo = new Map();
    for (const l of lineas) porModelo.set(l.producto_id, [...(porModelo.get(l.producto_id) || []), l]);
    const mensajes = [];
    for (const ls of porModelo.values()) {
      const disp = ls[0].estatus === 'activo' ? ls[0].existencias : 0;
      let exceso = ls.reduce((s, l) => s + l.cantidad, 0) - disp;
      if (exceso > 0) {
        mensajes.push(disp === 0 ? `"${ls[0].nombre}" se agotó y se quitó de tu carrito.` : `${disp === 1 ? 'Solo queda 1 pieza' : `Solo quedan ${disp} piezas`} de "${ls[0].nombre}"; ajustamos tu carrito.`);
        for (const l of [...ls].reverse()) {
          if (exceso <= 0) break;
          const q = Math.min(exceso, l.cantidad); exceso -= q;
          if (q === l.cantidad) await db.prepare('DELETE FROM carrito_items WHERE id = ?').run(l.id);
          else await db.prepare('UPDATE carrito_items SET cantidad = cantidad - ? WHERE id = ?').run(q, l.id);
        }
      }
    }
    if (mensajes.length) return { ajustado: mensajes };

    const total_piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
    if (total_piezas > num(cfg, 'limite_pedido', 30)) return { ajustado: [`El máximo es ${num(cfg, 'limite_pedido', 30)} piezas por pedido.`] };

    // ---- Dirección (se guarda en la cuenta si es nueva y el cliente lo pidió)
    let direccion = dir;
    if (!body.direccion_id && body.guardar_direccion !== false) {
      const id = await guardarDireccion(usuario.id, dir);
      direccion = await db.prepare(`${SELECT_DIR} WHERE d.id = ?`).get(id);
    } else if (!body.direccion_id) {
      direccion = {
        ...dir, estado: (await db.prepare('SELECT nombre FROM estados WHERE id = ?').get(dir.estado_id)).nombre,
        municipio: (await db.prepare('SELECT nombre FROM municipios WHERE id = ?').get(dir.municipio_id)).nombre,
      };
    }

    const subtotalC = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
    const envio = await calcularEnvio(direccion.estado_id, subtotalC);
    const totalC = subtotalC + envio.costo;
    const folio = await siguienteFolio('pedido');
    const ultimos4 = soloDigitos(t.numero).slice(-4);

    const pedidoId = Number((await db.prepare(
      `INSERT INTO pedidos(folio, usuario_id, estatus, subtotal, envio, total, iva_incluido, tarjeta_ultimos4, zona_nombre, tiempo_estimado,
        dir_destinatario, dir_estado, dir_municipio, dir_calle, dir_colonia, dir_cp, dir_num_ext, dir_num_int, dir_referencias, creado_en)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(folio, usuario.id, 'pagado', subtotalC, envio.costo, totalC, ivaIncluido(subtotalC, num(cfg, 'iva_pct', 16)), ultimos4,
      envio.zona_nombre, envio.tiempo, nombreCompleto(usuario), direccion.estado, direccion.municipio, direccion.calle, direccion.colonia,
      direccion.cp, direccion.num_ext, direccion.num_int, direccion.referencias, ahora())).lastInsertRowid);

    for (const l of lineas) {
      await db.prepare('INSERT INTO pedido_items(pedido_id, producto_id, codigo, nombre, color, cantidad, precio_unitario) VALUES(?,?,?,?,?,?,?)')
        .run(pedidoId, l.producto_id, l.codigo, l.nombre, l.color, l.cantidad, l.precio);
    }
    // Descuento de stock inmediato tras aprobar el pago (RF-8 CA1) y bitácora (RNF-4 CA4)
    for (const [productoId, ls] of porModelo) {
      const cant = ls.reduce((s, l) => s + l.cantidad, 0);
      const r = await db.prepare('UPDATE productos SET existencias = existencias - ? WHERE id = ? AND existencias >= ? RETURNING existencias').get(cant, productoId, cant);
      if (!r) throw new ErrorApi(409, 'Las existencias cambiaron mientras pagabas. Revisa tu carrito.', { carrito_ajustado: true });
      await registrarMovimiento({ usuarioId: usuario.id, productoId, tipo: 'venta', cantidad: -cant, resultante: r.existencias, referencia: folio });
    }
    await db.prepare('INSERT INTO pedido_historial(pedido_id, estatus, nota, autor) VALUES(?,?,?,?)').run(pedidoId, 'pagado', 'Pedido recibido y pago aprobado', nombreCompleto(usuario));
    await db.prepare('DELETE FROM carrito_items WHERE usuario_id = ?').run(usuario.id); // RF-5 CA4: el carrito queda vacío
    return { pedidoId, folio };
  });

  if (resultado.ajustado) {
    throw new ErrorApi(409, resultado.ajustado.join(' '), { carrito_ajustado: true });
  }
  // ---- Correos (fuera de la transacción): comprobante al cliente y aviso al administrador (RN-25)
  const pedido = await db.prepare('SELECT * FROM pedidos WHERE id = ?').get(resultado.pedidoId);
  await correoComprobante(pedido, usuario);
  await correoNuevoPedidoAdmin(pedido, usuario);
  return { folio: resultado.folio, pedido_id: resultado.pedidoId };
}

// ====================================================================== Pedidos del cliente (RF-19)
const MESES_CDMX = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }).slice(0, 7);

/**
 * Da forma a varios pedidos con 5 consultas en total (no 5 por pedido): artículos, facturas, devoluciones,
 * historial y configuración.
 */
export async function formatearPedidos(pedidos, { admin = false } = {}) {
  if (!pedidos.length) return [];
  const ids = pedidos.map((p) => p.id);
  const enLista = `(${ids.map(() => '?').join(',')})`;
  const [items, facturas, devs, historial, diasDev] = await Promise.all([
    db.prepare(
      `SELECT i.*, COALESCE((SELECT pc.foto FROM producto_colores pc WHERE pc.producto_id = i.producto_id AND pc.nombre = i.color),
              (SELECT url FROM producto_fotos f WHERE f.producto_id = i.producto_id ORDER BY f.orden LIMIT 1)) AS imagen
         FROM pedido_items i WHERE i.pedido_id IN ${enLista} ORDER BY i.id`
    ).all(...ids),
    db.prepare(`SELECT pedido_id, folio FROM facturas WHERE pedido_id IN ${enLista}`).all(...ids),
    db.prepare(`SELECT * FROM devoluciones WHERE pedido_id IN ${enLista} ORDER BY id DESC`).all(...ids),
    db.prepare(`SELECT pedido_id, estatus, nota, autor, fecha FROM pedido_historial WHERE pedido_id IN ${enLista} ORDER BY id`).all(...ids),
    configNum('dias_devolucion', 15),
  ]);
  const agrupar = (filas) => { const m = new Map(); for (const f of filas) { if (!m.has(f.pedido_id)) m.set(f.pedido_id, []); m.get(f.pedido_id).push(f); } return m; };
  const itemsDe = agrupar(items), histDe = agrupar(historial), devDe = agrupar(devs);
  const facturaDe = new Map(facturas.map((f) => [f.pedido_id, f.folio]));
  return pedidos.map((p) => {
    const dev = devDe.get(p.id)?.[0];
    const factura = facturaDe.get(p.id) || null;
    const limiteDev = p.entregado_en ? new Date(new Date(p.entregado_en).getTime() + diasDev * 86_400_000) : null;
    const puedeFacturar = ['pagado', 'preparando', 'enviado', 'entregado'].includes(p.estatus) && MESES_CDMX(p.creado_en) === MESES_CDMX(ahora());
    const salida = {
      id: p.id, folio: p.folio, estatus: p.estatus, fecha: p.creado_en, entregado_en: p.entregado_en,
      subtotal: aPesos(p.subtotal), envio: aPesos(p.envio), total: aPesos(p.total), iva_incluido: aPesos(p.iva_incluido),
      numero_guia: p.numero_guia, zona: p.zona_nombre, tiempo_estimado: p.tiempo_estimado, tarjeta_ultimos4: p.tarjeta_ultimos4,
      direccion: {
        destinatario: p.dir_destinatario, estado: p.dir_estado, municipio: p.dir_municipio, calle: p.dir_calle, colonia: p.dir_colonia,
        cp: p.dir_cp, num_ext: p.dir_num_ext, num_int: p.dir_num_int, referencias: p.dir_referencias,
      },
      items: (itemsDe.get(p.id) || []).map((i) => ({
        producto_id: i.producto_id, codigo: i.codigo, nombre: i.nombre, color: i.color, cantidad: i.cantidad,
        precio_unitario: aPesos(i.precio_unitario), subtotal: aPesos(i.precio_unitario * i.cantidad), imagen: i.imagen,
      })),
      factura,
      puede_facturar: !factura && puedeFacturar,
      puede_cancelar: ['pagado', 'preparando'].includes(p.estatus),                              // RN-10
      devolucion: dev ? { estatus: dev.estatus, motivo: dev.motivo, respuesta: dev.respuesta, fecha: dev.creado_en } : null,
      puede_devolver: p.estatus === 'entregado' && !!limiteDev && new Date() <= limiteDev && !dev, // RN-9
      devolucion_vence: limiteDev ? limiteDev.toISOString() : null,
      historial: (histDe.get(p.id) || []).map(({ pedido_id: _p, ...h }) => h),
    };
    if (admin) salida.visto_admin = !!p.visto_admin;
    return salida;
  });
}
export const formatearPedido = async (p, opciones) => (await formatearPedidos([p], opciones))[0];

export async function listarPedidosCliente(usuarioId) {
  return formatearPedidos(await db.prepare('SELECT * FROM pedidos WHERE usuario_id = ? ORDER BY id DESC').all(usuarioId));
}

export async function pedidoDeCliente(usuarioId, id) {
  const p = await db.prepare('SELECT * FROM pedidos WHERE id = ? AND usuario_id = ?').get(id, usuarioId);
  if (!p) throw new ErrorApi(404, 'No encontramos ese pedido en tu cuenta.');
  return p;
}

/** RN-10 / RF-8 CA3 — cancelar antes del envío restituye el inventario. */
export async function cancelarPedido(usuario, id) {
  const pedido = await pedidoDeCliente(usuario.id, id);
  await transaccion(async () => {
    const actual = await db.prepare('SELECT estatus FROM pedidos WHERE id = ?').get(id);
    if (!['pagado', 'preparando'].includes(actual.estatus)) throw new ErrorApi(409, 'Este pedido ya no se puede cancelar porque ya fue enviado. Solicita una devolución cuando lo recibas.');
    await db.prepare("UPDATE pedidos SET estatus = 'cancelado' WHERE id = ?").run(id);
    for (const i of await db.prepare('SELECT producto_id, SUM(cantidad) n FROM pedido_items WHERE pedido_id = ? GROUP BY producto_id').all(id)) {
      const { existencias } = await db.prepare('UPDATE productos SET existencias = existencias + ? WHERE id = ? RETURNING existencias').get(i.n, i.producto_id);
      await registrarMovimiento({ usuarioId: usuario.id, productoId: i.producto_id, tipo: 'cancelacion', cantidad: i.n, resultante: existencias, referencia: pedido.folio });
    }
    await db.prepare('INSERT INTO pedido_historial(pedido_id, estatus, nota, autor) VALUES(?,?,?,?)').run(id, 'cancelado', 'Cancelado por el cliente antes del envío', nombreCompleto(usuario));
  });
  await correoCancelacion(await db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id), usuario);
}

export const MOTIVOS_DEVOLUCION = [
  'Producto dañado o con defecto', 'No es lo que pedí', 'No cumple mis expectativas', 'Llegó incompleto', 'Otro motivo',
];

/** RF-15 CA1/CA2 — solo pedidos entregados y dentro del plazo. */
export async function solicitarDevolucion(usuario, id, { motivo, comentarios }) {
  const p = await pedidoDeCliente(usuario.id, id);
  if (!MOTIVOS_DEVOLUCION.includes(motivo)) throw new ErrorApi(422, 'Selecciona un motivo de la lista.', { errores: { motivo: 'Selecciona un motivo.' } });
  if (String(comentarios || '').length > 300) throw new ErrorApi(422, 'Los comentarios no pueden superar 300 caracteres.', { errores: { comentarios: 'Máximo 300 caracteres.' } });
  if (p.estatus !== 'entregado') throw new ErrorApi(409, 'Solo puedes solicitar devoluciones de pedidos que ya fueron entregados.');
  const dias = await configNum('dias_devolucion', 15);
  if (Date.now() > new Date(p.entregado_en).getTime() + dias * 86_400_000) {
    throw new ErrorApi(409, `El plazo de devolución (${dias} días naturales después de la entrega) ya venció.`);
  }
  if (await db.prepare("SELECT 1 FROM devoluciones WHERE pedido_id = ? AND estatus IN ('pendiente','aprobada')").get(id)) {
    throw new ErrorApi(409, 'Ya existe una solicitud de devolución para este pedido.');
  }
  await db.prepare('INSERT INTO devoluciones(pedido_id, usuario_id, motivo, comentarios, creado_en) VALUES(?,?,?,?,?)')
    .run(id, usuario.id, motivo, String(comentarios || '').trim() || null, ahora());
}
