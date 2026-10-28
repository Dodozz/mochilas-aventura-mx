import { db } from './db.js';
import { enviarCorreo } from './mailer.js';
import { moneda, esc, fechaLarga, nombreCompleto } from './formato.js';

/** Datos de la tienda para los correos (una sola consulta). */
async function tienda() {
  const filas = await db.prepare("SELECT clave, valor FROM configuracion WHERE clave IN ('nombre_tienda','correo_contacto','telefono','horario','email_admin')").all();
  const c = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
  return { nombre: c.nombre_tienda || 'Mochilas Aventura MX', correo: c.correo_contacto || '', telefono: c.telefono || '', horario: c.horario || '', admin: c.email_admin || c.correo_contacto || '' };
}

// RNF-1 CA1: el nombre comercial aparece en los correos.
function plantilla(t, titulo, cuerpo) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F8F3E7;font-family:Arial,Helvetica,sans-serif;color:#1B2A4A">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;max-width:100%">
<tr><td style="background:#1B2A4A;color:#fff;padding:18px 28px;font-size:20px;font-weight:bold">
${esc(t.nombre)} <span style="color:#FF6B2C"></span></td></tr>
<tr><td style="padding:28px"><h2 style="margin:0 0 14px">${esc(titulo)}</h2>${cuerpo}</td></tr>
<tr><td style="background:#F8F3E7;padding:16px 28px;font-size:12px;color:#5b6783">
${esc(t.nombre)} · ${esc(t.correo)} · WhatsApp ${esc(t.telefono)} · ${esc(t.horario)}</td></tr>
</table></td></tr></table></body></html>`;
}

const filas = (items) =>
  items
    .map(
      (i) => `<tr><td style="padding:6px 0">${esc(i.nombre)} <span style="color:#5b6783">(${esc(i.color)}) × ${i.cantidad}</span></td>
<td align="right" style="padding:6px 0">${moneda(i.precio_unitario * i.cantidad)}</td></tr>`
    )
    .join('');

function resumen(pedido, items) {
  const dir = [
    `${pedido.dir_calle}${pedido.dir_num_ext ? ' ' + pedido.dir_num_ext : ''}${pedido.dir_num_int ? ' Int. ' + pedido.dir_num_int : ''}`,
    `Col. ${pedido.dir_colonia}, CP ${pedido.dir_cp}`,
    `${pedido.dir_municipio}, ${pedido.dir_estado}, México`,
  ].join('<br>');
  return `<p>Folio: <b>${esc(pedido.folio)}</b> · ${fechaLarga(pedido.creado_en)}</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee">${filas(items)}</table>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">
<tr><td>Subtotal (IVA incluido)</td><td align="right">${moneda(pedido.subtotal)}</td></tr>
<tr><td>Envío (${esc(pedido.zona_nombre)})</td><td align="right">${pedido.envio === 0 ? 'Gratis' : moneda(pedido.envio)}</td></tr>
<tr><td style="font-size:18px"><b>Total</b></td><td align="right" style="font-size:18px"><b>${moneda(pedido.total)} MXN</b></td></tr>
<tr><td colspan="2" style="color:#5b6783;font-size:12px">Incluye ${moneda(pedido.iva_incluido)} de IVA (16 %).</td></tr></table>
<p><b>Dirección de envío</b><br>${esc(pedido.dir_destinatario)}<br>${dir}</p>
${pedido.dir_referencias ? `<p><b>Referencias de entrega:</b> ${esc(pedido.dir_referencias)}</p>` : ''}
<p>Tiempo estimado de entrega: ${esc(pedido.tiempo_estimado)}.</p>`;
}

const itemsDe = (pedidoId) => db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedidoId);

/** RF-6 CA4 — comprobante al cliente. */
export async function correoComprobante(pedido, usuario) {
  const t = await tienda();
  await enviarCorreo({
    para: usuario.correo,
    asunto: `Comprobante de tu pedido ${pedido.folio} — ${t.nombre}`,
    html: plantilla(t, `¡Pago aprobado, ${usuario.nombres}!`, `<p>Gracias por tu compra. Este es tu comprobante.</p>${resumen(pedido, await itemsDe(pedido.id))}`),
  });
}

/** RF-18 CA6 / RN-25 — aviso al administrador por cada pedido con pago aprobado. */
export async function correoNuevoPedidoAdmin(pedido, usuario) {
  const t = await tienda();
  await enviarCorreo({
    para: t.admin,
    asunto: `Pedido nuevo ${pedido.folio} — ${moneda(pedido.total)}`,
    html: plantilla(t,
      `Pedido nuevo ${pedido.folio}`,
      `<p>Cliente: <b>${esc(nombreCompleto(usuario))}</b> (${esc(usuario.correo)})</p>${resumen(pedido, await itemsDe(pedido.id))}
       <p>Zona de envío: ${esc(pedido.zona_nombre)}</p>`
    ),
  });
}

const ETIQUETA_ESTATUS = { pagado: 'Pagado', preparando: 'Preparando', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado', devuelto: 'Devuelto' };

/** RF-7 CA3 / RF-18 CA5 — correo en cada cambio de estatus. */
export async function correoCambioEstatus(pedido, usuario) {
  const t = await tienda();
  await enviarCorreo({
    para: usuario.correo,
    asunto: `Tu pedido ${pedido.folio} ahora está: ${ETIQUETA_ESTATUS[pedido.estatus]}`,
    html: plantilla(t,
      `Actualización de tu pedido ${pedido.folio}`,
      `<p>Hola ${esc(usuario.nombres)}, el estatus de tu pedido cambió a <b>${ETIQUETA_ESTATUS[pedido.estatus]}</b>.</p>
       ${pedido.numero_guia ? `<p>Número de guía: <b>${esc(pedido.numero_guia)}</b></p>` : ''}
       <p>Puedes consultarlo en <b>Mi cuenta → Mis pedidos</b>.</p>`
    ),
  });
}

/** RF-15 CA3 — resolución de la devolución. */
export async function correoResolucionDevolucion(pedido, usuario, dev) {
  const t = await tienda();
  const aprobada = dev.estatus === 'aprobada';
  await enviarCorreo({
    para: usuario.correo,
    asunto: `Tu solicitud de devolución del pedido ${pedido.folio} fue ${aprobada ? 'aprobada' : 'rechazada'}`,
    html: plantilla(t,
      `Devolución ${aprobada ? 'aprobada' : 'rechazada'}`,
      `<p>Hola ${esc(usuario.nombres)}, revisamos tu solicitud del pedido <b>${esc(pedido.folio)}</b>.</p>
       ${aprobada ? `<p>Se reembolsará ${moneda(pedido.total)} por el mismo medio de pago en un máximo de <b>10 días hábiles</b>.</p>` : ''}
       ${dev.respuesta ? `<p><b>Comentarios de la tienda:</b> ${esc(dev.respuesta)}</p>` : ''}`
    ),
  });
}

/** RF-15 — cancelación antes del envío. */
export async function correoCancelacion(pedido, usuario) {
  const t = await tienda();
  await enviarCorreo({
    para: usuario.correo,
    asunto: `Pedido ${pedido.folio} cancelado`,
    html: plantilla(t,
      'Tu pedido fue cancelado',
      `<p>Hola ${esc(usuario.nombres)}, cancelamos tu pedido <b>${esc(pedido.folio)}</b>. El reembolso de ${moneda(pedido.total)} se hará por el mismo medio de pago en un máximo de 10 días hábiles.</p>`
    ),
  });
}

/** RF-9 CA2/CA7 — factura al correo de la cuenta. */
export async function correoFactura(factura, pedido, usuario, pdfBuffer) {
  const t = await tienda();
  await enviarCorreo({
    para: usuario.correo,
    asunto: `Factura ${factura.folio} (simulada) — ${t.nombre}`,
    html: plantilla(t,
      `Tu factura ${factura.folio}`,
      `<p>Hola ${esc(usuario.nombres)}, adjuntamos la factura simulada del pedido <b>${esc(pedido.folio)}</b> por ${moneda(pedido.total)} MXN.</p>
       <p style="color:#5b6783;font-size:12px">Documento fiscal simulado para fines académicos; no tiene validez ante el SAT.</p>`
    ),
    adjunto: `${factura.folio}.pdf`,
    adjuntoBuffer: pdfBuffer,
  });
}
