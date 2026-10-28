import PDFDocument from 'pdfkit';
import { db, ErrorApi, siguienteFolio, transaccion, ahora, config_ } from '../db.js';
import { validarDatosFiscales } from '../validadores.js';
import { moneda, fechaLarga, nombreCompleto } from '../formato.js';
import { listarDirecciones, guardarDireccion, pedidoDeCliente, formatearPedido } from './pedidos.js';
import { correoFactura } from '../correos.js';

export const catalogosFiscales = async () => {
  const [regimenes, usos_cfdi] = await Promise.all([
    db.prepare('SELECT clave, nombre FROM regimenes_fiscales ORDER BY clave').all(),
    db.prepare('SELECT clave, nombre FROM usos_cfdi ORDER BY clave').all(),
  ]);
  return { regimenes, usos_cfdi };
};

/** RF-9 CA3/CA4, RN-11, RN-15 — genera la factura simulada de un pedido con pago aprobado. */
export async function solicitarFactura(usuario, pedidoId, datos) {
  const pedido = await pedidoDeCliente(usuario.id, pedidoId);
  const info = await formatearPedido(pedido);
  if (info.factura) throw new ErrorApi(409, `Este pedido ya tiene la factura ${info.factura}. Puedes descargarla o reenviarla desde Mis pedidos.`);
  if (!['pagado', 'preparando', 'enviado', 'entregado'].includes(pedido.estatus)) throw new ErrorApi(409, 'Solo se puede facturar un pedido con pago aprobado (no cancelado ni devuelto).');
  if (!info.puede_facturar) throw new ErrorApi(409, 'La factura solo puede solicitarse dentro del mismo mes de la compra.');

  const errores = validarDatosFiscales(datos);
  if (!await db.prepare('SELECT 1 FROM regimenes_fiscales WHERE clave = ?').get(datos.regimen)) errores.regimen = 'Selecciona un régimen fiscal de la lista.';
  if (!await db.prepare('SELECT 1 FROM usos_cfdi WHERE clave = ?').get(datos.uso_cfdi)) errores.uso_cfdi = 'Selecciona un uso de CFDI de la lista.';

  // Dirección de facturación: una guardada o una nueva
  let dir = null;
  if (datos.direccion_id) {
    dir = (await listarDirecciones(usuario.id)).find((d) => d.id === Number(datos.direccion_id));
    if (!dir) errores.direccion = 'Selecciona una de tus direcciones guardadas.';
  } else if (datos.direccion) {
    try {
      const nuevaId = await guardarDireccion(usuario.id, { ...datos.direccion, alias: datos.direccion.alias || 'Facturación' });
      dir = (await listarDirecciones(usuario.id)).find((d) => d.id === nuevaId);
    }
    catch (e) { errores.direccion = Object.values(e.extra?.errores || { x: e.message })[0]; }
  } else errores.direccion = 'Selecciona o captura la dirección de facturación.';
  if (Object.keys(errores).length) throw new ErrorApi(422, 'Revisa los datos de facturación.', { errores });

  const dirTexto = `${dir.calle}${dir.num_ext ? ' ' + dir.num_ext : ''}${dir.num_int ? ' Int. ' + dir.num_int : ''}, Col. ${dir.colonia}, CP ${dir.cp}, ${dir.municipio}, ${dir.estado}, México`;
  const factura = await transaccion(async () => {
    const folio = await siguienteFolio('factura'); // RN-20
    await db.prepare(
      `INSERT INTO facturas(folio, pedido_id, rfc, razon_social, cp_fiscal, regimen_clave, uso_cfdi_clave, dir_facturacion, creado_en) VALUES(?,?,?,?,?,?,?,?,?)`
    ).run(folio, pedido.id, datos.rfc, String(datos.razon_social).trim(), String(datos.cp_fiscal).trim(), datos.regimen, datos.uso_cfdi, dirTexto, ahora());
    return db.prepare('SELECT * FROM facturas WHERE pedido_id = ?').get(pedido.id);
  }).catch((e) => {
    if (/UNIQUE/i.test(e.message)) throw new ErrorApi(409, 'Este pedido ya tiene factura. Puedes descargarla o reenviarla desde Mis pedidos.');
    throw e;
  });
  return enviarFacturaPorCorreo(usuario, factura, pedido);
}

async function bufferPdf(factura, pedido) {
  const pdf = await generarPdf(factura, pedido);
  return pdf;
}

export async function enviarFacturaPorCorreo(usuario, factura, pedido) {
  await correoFactura(factura, pedido, usuario, await bufferPdf(factura, pedido));
  return { folio: factura.folio, pedido_id: pedido.id };
}

export async function facturaDePedido(usuario, pedidoId) {
  const pedido = await pedidoDeCliente(usuario.id, pedidoId);
  const factura = await db.prepare('SELECT * FROM facturas WHERE pedido_id = ?').get(pedido.id);
  if (!factura) throw new ErrorApi(404, 'Este pedido todavía no tiene factura. Solicítala desde Mis pedidos.');
  return { factura, pedido };
}

export async function generarPdf(factura, pedido) {
  const [items, regimen, uso, cliente, nombreTienda] = await Promise.all([
    db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedido.id),
    db.prepare('SELECT nombre FROM regimenes_fiscales WHERE clave = ?').get(factura.regimen_clave),
    db.prepare('SELECT nombre FROM usos_cfdi WHERE clave = ?').get(factura.uso_cfdi_clave),
    db.prepare('SELECT * FROM usuarios WHERE id = ?').get(pedido.usuario_id),
    config_('nombre_tienda', 'Mochilas Aventura MX'),
  ]);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: `Factura ${factura.folio}`, Author: nombreTienda } });
    const trozos = [];
    doc.on('data', (c) => trozos.push(c));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    const NAVY = '#1B2A4A', NARANJA = '#FF6B2C', GRIS = '#5b6783';

    doc.rect(0, 0, 612, 90).fill(NAVY);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(22).text(nombreTienda, 50, 30);
    doc.fontSize(10).font('Helvetica').text('FACTURA SIMULADA — sin validez fiscal ante el SAT', 50, 58);
    doc.fillColor(NARANJA).font('Helvetica-Bold').fontSize(14).text(factura.folio, 380, 30, { width: 182, align: 'right' });
    doc.fillColor('#fff').font('Helvetica').fontSize(10).text(`Fecha: ${fechaLarga(factura.creado_en)}`, 380, 52, { width: 182, align: 'right' });

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('Datos del receptor', 50, 112);
    doc.font('Helvetica').fontSize(10).fillColor('#000')
      .text(`Razón social: ${factura.razon_social}`, 50, 130)
      .text(`RFC: ${factura.rfc}`)
      .text(`Código postal fiscal: ${factura.cp_fiscal}`)
      .text(`Régimen fiscal: ${factura.regimen_clave} — ${regimen?.nombre ?? ''}`)
      .text(`Uso de CFDI: ${factura.uso_cfdi_clave} — ${uso?.nombre ?? ''}`)
      .text(`Dirección de facturación: ${factura.dir_facturacion}`, { width: 500 })
      .text(`Cliente: ${nombreCompleto(cliente)} (${cliente.correo})`);

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('Datos de la operación', 50, 262);
    doc.font('Helvetica').fontSize(10).fillColor('#000')
      .text(`Folio del pedido (validación): ${pedido.folio}`, 50, 280)
      .text(`Fecha de compra: ${fechaLarga(pedido.creado_en)}   ·   Pago aprobado con tarjeta terminación ${pedido.tarjeta_ultimos4}   ·   Moneda: MXN`);

    // Tabla de artículos
    let y = 320;
    doc.rect(50, y, 512, 22).fill(NAVY);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10)
      .text('Código', 56, y + 6).text('Descripción', 120, y + 6).text('Cant.', 330, y + 6, { width: 40, align: 'right' })
      .text('P. unitario', 380, y + 6, { width: 80, align: 'right' }).text('Importe', 470, y + 6, { width: 86, align: 'right' });
    y += 28;
    doc.font('Helvetica').fillColor('#000');
    for (const i of items) {
      doc.text(i.codigo, 56, y).text(`${i.nombre} (${i.color})`, 120, y, { width: 200 }).text(String(i.cantidad), 330, y, { width: 40, align: 'right' })
        .text(moneda(i.precio_unitario), 380, y, { width: 80, align: 'right' }).text(moneda(i.precio_unitario * i.cantidad), 470, y, { width: 86, align: 'right' });
      y += 22;
      doc.moveTo(50, y - 4).lineTo(562, y - 4).strokeColor('#e6dfcf').stroke();
    }
    y += 8;
    const fila = (t, v, negrita = false) => {
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(negrita ? 12 : 10).fillColor(negrita ? NAVY : '#000')
        .text(t, 330, y, { width: 130, align: 'right' }).text(v, 470, y, { width: 86, align: 'right' });
      y += negrita ? 22 : 18;
    };
    const subtotalSinIva = pedido.subtotal - pedido.iva_incluido;
    fila('Subtotal (sin IVA)', moneda(subtotalSinIva));
    fila('IVA 16 % (incluido)', moneda(pedido.iva_incluido));
    fila('Subtotal (IVA incluido)', moneda(pedido.subtotal));
    fila('Envío', pedido.envio === 0 ? 'Gratis' : moneda(pedido.envio));
    fila('TOTAL MXN', moneda(pedido.total), true);

    doc.fillColor(GRIS).font('Helvetica').fontSize(8.5)
      .text('Documento fiscal simulado generado con fines académicos. Los precios publicados ya incluyen IVA; el IVA se muestra solo como desglose informativo.', 50, 700, { width: 512, align: 'center' });
    doc.end();
  });
}
