import { estado, esc, $, $$, ico, get, post, moneda, precio, toast, errorToast, errorCampo, marcarErrores, validarEnVivo } from '../util.js';
import { formDireccion, activarDireccion, leerDireccion, validarFormDireccion, textoDireccion } from '../direccion.js';
import { validarDatosTarjeta, validarTarjeta, validarVencimiento, validarCVV, soloDigitos } from '../validators.js';

export const pasosHtml = (actual) => {
  const P = [['Carrito', 'check'], ['Entrega', 'usuario'], ['Pago', 'tarjeta'], ['Confirmación', 'check']];
  return `<ol class="pasos" aria-label="Pasos de la compra" style="list-style:none;padding:0">${P.map(([n, i], k) => `<li class="paso ${k + 1 < actual ? 'hecho' : ''} ${k + 1 === actual ? 'act' : ''}" ${k + 1 === actual ? 'aria-current="step"' : ''}><span class="c">${ico(k + 1 < actual ? 'check' : i)}</span>${n}</li>`).join('')}</ol>`;
};
const guardado = () => JSON.parse(sessionStorage.getItem('checkout') || 'null');
const guardar = (d) => sessionStorage.setItem('checkout', JSON.stringify(d));

function resumenHtml(r, { boton, desactivado = false }) {
  const e = r.envio;
  return `<aside class="tarjeta resumen" aria-label="Resumen del pedido"><h3>Resumen del pedido</h3>
    ${r.carrito.lineas.map((l) => `<div class="item-res"><img src="${esc(l.imagen)}" alt=""><div><b>${esc(l.nombre)}</b><div class="muted">${esc(l.color)} · ${l.cantidad}x</div></div><b>${precio(l.subtotal)}</b></div>`).join('')}
    <div style="border-top:1px solid var(--borde);margin-top:.5rem;padding-top:.6rem">
    <div class="fila"><span>Subtotal (IVA incluido):</span><span>${moneda(r.subtotal)}</span></div>
    <div class="fila"><span>Envío${e ? ` (Entrega en ${e.tiempo})` : ''}:</span><span>${e ? (e.gratis ? '<b style="color:var(--verde)">Gratis</b>' : moneda(e.costo)) : '<span class="muted">Elige tu estado</span>'}</span></div>
    <div class="fila total"><span>Total:</span><span>${moneda(r.total)}</span></div>
    <p class="muted" style="font-size:.9rem;margin:0">Incluye ${moneda(r.iva_incluido)} de IVA</p></div>
    <button class="btn block ${desactivado ? 'desactivado' : ''}" id="btn-sig" ${desactivado ? 'aria-disabled="true"' : ''} style="margin-top:1rem">${boton}</button></aside>`;
}

export async function render(ctx) {
  if (!ctx.requiereSesion('login')) return;
  const paso = ctx.params[0];
  const [dirs, base] = await Promise.all([get('/cuenta/direcciones'), get('/checkout/resumen')]);
  if (!ctx.sigue()) return;
  if (base.carrito.avisos.length) toast(base.carrito.avisos.join(' '));
  if (!base.carrito.lineas.length) { toast('Tu carrito está vacío.'); return ctx.navegar('/carrito', { reemplazar: true }); }
  return paso === 'entrega' ? entrega(ctx, dirs, base) : pago(ctx, dirs, base);
}

// ====================================================================== Paso 2: Entrega
async function entrega(ctx, dirs, base) {
  ctx.titulo('Entrega');
  const previo = guardado();
  let modo = dirs.length && !(previo?.direccion) ? 'guardada' : dirs.length ? (previo?.direccion ? 'nueva' : 'guardada') : 'nueva';
  let seleccion = previo?.direccion_id && dirs.some((d) => d.id === previo.direccion_id) ? previo.direccion_id : dirs[0]?.id;
  let resumen = base;

  ctx.contenedor.innerHTML = `<div class="contenedor seccion">${pasosHtml(2)}
    <div class="dos-col"><div><h1>Dirección de entrega</h1>
      <div id="guardadas"></div>
      <form id="f-dir" novalidate>${formDireccion(previo?.direccion || {})}
        <label class="chk-linea"><input type="checkbox" id="guardar-dir" ${previo?.guardar === false ? '' : 'checked'}><span>Guardar esta dirección en mi cuenta</span></label></form></div>
      <div id="res"></div></div></div>`;
  const form = $('#f-dir');
  await activarDireccion(form, previo?.direccion || {}, { alCambiarEstado: (id) => actualizarResumen(id) });

  const estadoActual = () => (modo === 'guardada' ? dirs.find((d) => d.id === seleccion)?.estado_id : Number($('[name=estado_id]', form).value) || null);
  async function actualizarResumen(id = estadoActual()) {
    try { resumen = await get(`/checkout/resumen${id ? `?estado_id=${id}` : ''}`); } catch (e) { errorToast(e); return; }
    if (!ctx.sigue()) return;
    $('#res').innerHTML = resumenHtml(resumen, { boton: 'Continuar al pago' });
    $('#btn-sig').addEventListener('click', continuar);
  }
  function pintarModo() {
    const g = $('#guardadas');
    g.innerHTML = dirs.length ? `<div role="radiogroup" aria-label="Direcciones guardadas">${dirs.map((d) => `<label class="dir-opcion ${modo === 'guardada' && seleccion === d.id ? 'on' : ''}"><input type="radio" name="dir" value="${d.id}" ${modo === 'guardada' && seleccion === d.id ? 'checked' : ''}><span><b>${esc(d.alias)}</b><br>${textoDireccion(d)}${d.referencias ? `<br><span class="muted">${esc(d.referencias)}</span>` : ''}</span></label>`).join('')}
      <label class="dir-opcion ${modo === 'nueva' ? 'on' : ''}"><input type="radio" name="dir" value="nueva" ${modo === 'nueva' ? 'checked' : ''}><span><b>Usar otra dirección</b></span></label></div>` : '';
    form.classList.toggle('oculto', modo === 'guardada');
    $$('[name=dir]', g).forEach((r) => r.addEventListener('change', () => { if (r.value === 'nueva') modo = 'nueva'; else { modo = 'guardada'; seleccion = Number(r.value); } pintarModo(); actualizarResumen(); }));
  }
  async function continuar() {
    if (modo === 'guardada') { guardar({ direccion_id: seleccion, estado_id: estadoActual() }); return ctx.navegar('/checkout/pago'); }
    if (validarFormDireccion(form)) { toast('Revisa los campos marcados para continuar.', 'error'); return; }
    guardar({ direccion: leerDireccion(form), guardar: $('#guardar-dir').checked, estado_id: estadoActual() });
    ctx.navegar('/checkout/pago');
  }
  pintarModo();
  await actualizarResumen();
}

// ====================================================================== Paso 3: Pago
async function pago(ctx, dirs, base) {
  ctx.titulo('Pago');
  const sel = guardado();
  if (!sel || (!sel.direccion_id && !sel.direccion)) { toast('Primero indica tu dirección de entrega.'); return ctx.navegar('/checkout/entrega', { reemplazar: true }); }
  const guardadaDir = sel.direccion_id ? dirs.find((d) => d.id === sel.direccion_id) : null;
  if (sel.direccion_id && !guardadaDir) { sessionStorage.removeItem('checkout'); return ctx.navegar('/checkout/entrega', { reemplazar: true }); }
  const r = await get(`/checkout/resumen?estado_id=${sel.estado_id || guardadaDir?.estado_id}`);
  let textoDir = guardadaDir ? textoDireccion(guardadaDir) : '';
  if (!guardadaDir) { // dirección nueva aún no guardada: se muestran los nombres de estado y municipio
    const [eds, muns] = await Promise.all([get('/geografia/estados'), get(`/geografia/estados/${sel.direccion.estado_id}/municipios`)]);
    textoDir = textoDireccion({ ...sel.direccion, estado: eds.find((e) => String(e.id) === String(sel.direccion.estado_id))?.nombre, municipio: muns.find((m) => String(m.id) === String(sel.direccion.municipio_id))?.nombre });
  }

  ctx.contenedor.innerHTML = `<div class="contenedor seccion">${pasosHtml(3)}<h1 class="centrado">Pago</h1>
    <div class="dos-col"><div class="tarjeta"><h2 style="font-size:1.5rem">Pago con tarjeta de crédito o débito</h2>
      <div id="alertas"></div>
      <form id="f-pago" novalidate autocomplete="on">
        <div class="campo"><label for="numero">Número de tarjeta</label><input id="numero" name="numero" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="19"></div>
        <div class="fila-campos mantener"><div class="campo"><label for="vencimiento">Fecha de vencimiento (MM/AA)</label><input id="vencimiento" name="vencimiento" inputmode="numeric" autocomplete="cc-exp" placeholder="12/28" maxlength="5"></div>
          <div class="campo"><label for="cvv">CVV</label><input id="cvv" name="cvv" inputmode="numeric" autocomplete="cc-csc" placeholder="3 o 4 dígitos" maxlength="4" type="password"></div></div>
        <div class="tarjeta" style="background:var(--crema);box-shadow:none;margin-bottom:1rem"><div style="display:flex;justify-content:space-between;gap:1rem"><b>Dirección de entrega</b><a href="/checkout/entrega" data-link class="enlace-btn" style="text-decoration:none">Editar</a></div><p style="margin:.4rem 0 0">${textoDir}</p></div>
        <div class="campo" id="campo-pol"><label class="chk-linea" style="margin:0"><input type="checkbox" name="politicas" id="politicas"><span>Acepto las <a href="/politicas/terminos" target="_blank" rel="noopener">políticas de la tienda</a> (devoluciones, envíos, privacidad y términos)</span></label></div>
        <p class="muted" style="font-size:.85rem;display:flex;gap:.4rem;align-items:center">${ico('candado')} Pago simulado: no se conecta con ninguna pasarela real. Tarjeta de prueba: 4111 1111 1111 1111, vencimiento futuro y CVV de 3 dígitos.</p>
      </form></div>
      <div id="res"></div></div></div>`;
  $('#res').innerHTML = resumenHtml(r, { boton: `Pagar ${precio(r.total)}`, desactivado: true });
  const form = $('#f-pago'), btn = () => $('#btn-sig');

  const datos = () => ({ numero: soloDigitos($('#numero').value), vencimiento: $('#vencimiento').value.trim(), cvv: $('#cvv').value.trim() });
  const valido = () => !Object.keys(validarDatosTarjeta(datos())).length && $('#politicas').checked;
  const refrescarBtn = () => { btn().classList.toggle('desactivado', !valido()); btn().setAttribute('aria-disabled', !valido()); };
  const validadores = { numero: () => validarTarjeta($('#numero').value), vencimiento: () => validarVencimiento($('#vencimiento').value), cvv: () => validarCVV($('#cvv').value) };

  $('#numero').addEventListener('input', (e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 16); e.target.value = d.replace(/(.{4})/g, '$1 ').trim(); refrescarBtn(); });
  $('#vencimiento').addEventListener('input', (e) => { let d = e.target.value.replace(/\D/g, '').slice(0, 4); if (d.length >= 3) d = d.slice(0, 2) + '/' + d.slice(2); e.target.value = d; refrescarBtn(); });
  $('#cvv').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); refrescarBtn(); });
  for (const k of Object.keys(validadores)) validarEnVivo($('#' + k), validadores[k]);
  $('#politicas').addEventListener('change', () => { errorCampo($('#campo-pol'), $('#politicas').checked ? '' : 'Debes aceptar las políticas de la tienda para pagar.'); refrescarBtn(); });

  let enviando = false;
  btn().addEventListener('click', async () => {
    if (enviando) return;
    const errores = validarDatosTarjeta(datos());
    if (Object.keys(errores).length || !$('#politicas').checked) { // RF-6 CA5: marca cada campo, sin procesar nada
      marcarErrores(form, errores);
      if (!$('#politicas').checked) errorCampo($('#campo-pol'), 'Debes aceptar las políticas de la tienda para pagar.');
      toast('Revisa los campos marcados antes de pagar.', 'error'); return;
    }
    enviando = true; btn().textContent = 'Procesando pago…'; btn().classList.add('desactivado');
    try {
      const cuerpo = { tarjeta: datos(), acepta_politicas: true };
      if (sel.direccion_id) cuerpo.direccion_id = sel.direccion_id; else { cuerpo.direccion = sel.direccion; cuerpo.guardar_direccion = sel.guardar !== false; }
      const res = await post('/checkout/pagar', cuerpo);
      sessionStorage.removeItem('checkout');
      await ctx.refrescarCarrito();
      ctx.navegar(`/checkout/confirmacion/${res.pedido_id}`, { reemplazar: true });
    } catch (e) {
      enviando = false; btn().textContent = `Pagar ${precio(r.total)}`; refrescarBtn();
      if (e.datos.carrito_ajustado) { toast(e.message, 'error'); return ctx.navegar('/carrito'); } // RF-8 CA4
      if (e.datos.errores?.direccion) { toast('Falta o es incorrecto algún dato de la dirección de entrega.', 'error'); return ctx.navegar('/checkout/entrega'); }
      if (e.datos.errores) { marcarErrores(form, e.datos.errores.tarjeta || {}); if (e.datos.errores.politicas) errorCampo($('#campo-pol'), e.datos.errores.politicas); }
      $('#alertas').innerHTML = `<div class="alerta error" role="alert">${ico('info')}<span>${esc(e.message)}</span></div>`;
    }
  });
}
