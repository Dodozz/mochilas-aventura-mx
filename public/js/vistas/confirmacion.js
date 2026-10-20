import { estado, esc, ico, get, moneda, precio } from '../util.js';
import { pasosHtml } from './checkout.js';

export async function render(ctx) {
  if (!ctx.requiereSesion('login')) return;
  const p = await get(`/pedidos/${ctx.params[0]}`);
  if (!ctx.sigue()) return;
  ctx.titulo('Pago aprobado');
  const d = p.direccion;
  ctx.contenedor.innerHTML = `<div class="contenedor seccion" style="max-width:860px">${pasosHtml(5).replace('act', 'hecho')}
    <div class="exito"><div class="check" aria-hidden="true">${ico('check')}</div><h1>¡Pago aprobado!</h1><p style="font-size:1.15rem">Te enviamos el comprobante<br>a ${esc(estado.usuario.correo)}</p></div>
    <article class="tarjeta" style="max-width:640px;margin:1rem auto"><div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--borde);padding-bottom:.8rem"><span style="font-size:1.15rem">Folio <b>${esc(p.folio)}</b></span><span class="pill p-entregado">Pagado</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;padding:1rem 0;border-bottom:1px solid var(--borde)">${p.items.map((i) => `<div style="display:flex;gap:.7rem;align-items:center"><img src="${esc(i.imagen)}" alt="" style="width:62px;height:62px;border-radius:12px;object-fit:cover;background:var(--crema-2)"><div><div>${esc(i.nombre)} <span class="muted">(${esc(i.color)})</span></div><b>${precio(i.subtotal)}</b> <span class="muted">· ${i.cantidad}x</span></div></div>`).join('')}</div>
      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:1.2rem;padding:1rem 0">
        <div><b>Dirección de envío:</b><p style="margin:.3rem 0 0">${esc(d.destinatario)}<br>${esc(d.calle)}${d.num_ext ? ' ' + esc(d.num_ext) : ''}${d.num_int ? ', Int. ' + esc(d.num_int) : ''},<br>Col. ${esc(d.colonia)}, CP ${esc(d.cp)}<br>${esc(d.municipio)}, ${esc(d.estado)}, México</p>${d.referencias ? `<p class="muted" style="margin:.4rem 0 0;font-size:.9rem">Referencias: ${esc(d.referencias)}</p>` : ''}<p class="muted" style="margin:.4rem 0 0;font-size:.9rem">Entrega estimada: ${esc(p.tiempo_estimado)}</p></div>
        <div class="resumen"><div class="fila"><span>Subtotal:</span><span>${moneda(p.subtotal)}</span></div><div class="fila"><span>Envío:</span><span>${p.envio ? moneda(p.envio) : 'Gratis'}</span></div><div class="fila" style="border-top:1px solid var(--borde);font-weight:800;font-size:1.2rem"><span>Total:</span><span>${moneda(p.total)}</span></div><p class="muted" style="font-size:.8rem;margin:0">Incluye ${moneda(p.iva_incluido)} de IVA · MXN</p></div></div>
      <div style="display:flex;gap:.8rem;flex-wrap:wrap"><a class="btn" style="flex:1" href="/cuenta/pedidos" data-link>Ver mis pedidos</a><a class="btn sec" style="flex:1" href="/catalogo" data-link>Seguir comprando</a></div></article></div>`;
}
