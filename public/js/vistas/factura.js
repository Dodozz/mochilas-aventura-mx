import { esc, $, ico, get, post, descargar, moneda, fecha, toast, errorToast, marcarErrores, errorCampo, datosForm } from '../util.js';
import { validarRFC, validarCP, validarTexto } from '../validators.js';
import { formDireccion, activarDireccion, leerDireccion, validarFormDireccion, textoDireccion } from '../direccion.js';

export async function render(ctx) {
  if (!ctx.requiereSesion('login')) return;
  const id = Number(ctx.params[0]);
  const [p, fiscal, dirs] = await Promise.all([get(`/pedidos/${id}`), get('/fiscal'), get('/cuenta/direcciones')]);
  if (!ctx.sigue()) return;
  ctx.titulo(`Factura del pedido ${p.folio}`);
  const volver = '<a class="btn sec" href="/cuenta/pedidos" data-link>Volver a mis pedidos</a>';

  if (p.factura) return exito(ctx, p, p.factura);
  if (!p.puede_facturar) {
    ctx.contenedor.innerHTML = `<div class="contenedor seccion"><div class="tarjeta vacio"><h2>No se puede facturar este pedido</h2><p>La factura solo se solicita sobre pedidos con pago aprobado y dentro del mismo mes de la compra.</p>${volver}</div></div>`;
    return;
  }

  ctx.contenedor.innerHTML = `<div class="contenedor seccion" style="max-width:820px"><h1>Solicitar factura</h1>
    <div class="tarjeta" style="margin-bottom:1.2rem"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap"><div><span class="muted">Pedido</span><br><b style="font-size:1.3rem">${esc(p.folio)}</b></div><div><span class="muted">Total</span><br><b style="font-size:1.3rem">${moneda(p.total)} MXN</b></div><div><span class="muted">Fecha de compra</span><br><b>${fecha(p.fecha)}</b></div><div><span class="muted">Estatus</span><br><span class="pill p-entregado">Pago aprobado</span></div></div></div>
    <form class="tarjeta" id="f-fac" novalidate><h2 style="font-size:1.4rem">Datos fiscales</h2>
      <div class="fila-campos"><div class="campo"><label for="rfc">RFC</label><input id="rfc" name="rfc" maxlength="13" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase" placeholder="XAXX010101000"><span class="nota">12 o 13 caracteres en mayúsculas</span></div>
        <div class="campo"><label for="cp_fiscal">Código postal fiscal</label><input id="cp_fiscal" name="cp_fiscal" inputmode="numeric" maxlength="5"><span class="nota">5 dígitos</span></div></div>
      <div class="campo"><label for="razon_social">Razón social</label><input id="razon_social" name="razon_social" maxlength="150"></div>
      <div class="fila-campos"><div class="campo"><label for="regimen">Régimen fiscal</label><select id="regimen" name="regimen"><option value="">Selecciona un régimen</option>${fiscal.regimenes.map((r) => `<option value="${r.clave}">${r.clave} — ${esc(r.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label for="uso_cfdi">Uso de CFDI</label><select id="uso_cfdi" name="uso_cfdi"><option value="">Selecciona un uso</option>${fiscal.usos_cfdi.map((r) => `<option value="${r.clave}">${r.clave} — ${esc(r.nombre)}</option>`).join('')}</select></div></div>
      <h2 style="font-size:1.4rem;margin-top:.6rem">Dirección de facturación</h2>
      <div class="campo"><label for="dir_sel">Dirección</label><select id="dir_sel" name="direccion_id">${dirs.map((d) => `<option value="${d.id}">${esc(d.alias)} — ${esc(d.calle)}, ${esc(d.colonia)}</option>`).join('')}<option value="nueva">Capturar una dirección nueva</option></select></div>
      <div id="dir-nueva" class="oculto">${formDireccion({}, { p: 'fd-' })}</div>
      <button class="btn block" type="submit">Generar factura</button>
      <p class="muted" style="font-size:.85rem;margin-top:.8rem">Documento fiscal simulado, sin código QR. La factura se enviará a tu correo y podrás descargarla en PDF.</p></form></div>`;

  const form = $('#f-fac'), cajaDir = $('#dir-nueva');
  await activarDireccion(cajaDir);
  const rfc = $('#rfc'); rfc.addEventListener('input', () => { rfc.value = rfc.value.toUpperCase().replace(/\s/g, ''); });
  rfc.addEventListener('blur', () => errorCampo(rfc.closest('.campo'), validarRFC(rfc.value)));
  $('#cp_fiscal').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); });
  $('#cp_fiscal').addEventListener('blur', (e) => errorCampo(e.target.closest('.campo'), validarCP(e.target.value)?.replace('El código postal', 'El código postal fiscal')));
  const sel = $('#dir_sel'); const alt = () => cajaDir.classList.toggle('oculto', sel.value !== 'nueva'); sel.addEventListener('change', alt); if (!dirs.length) { sel.value = 'nueva'; } alt();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = datosForm(form);
    const errores = {};
    const r = validarRFC(d.rfc); if (r) errores.rfc = r;
    const rs = validarTexto(d.razon_social, 'La razón social', { max: 150 }); if (rs) errores.razon_social = rs;
    const cp = validarCP(d.cp_fiscal); if (cp) errores.cp_fiscal = cp.replace('El código postal', 'El código postal fiscal');
    if (!d.regimen) errores.regimen = 'Selecciona el régimen fiscal.';
    if (!d.uso_cfdi) errores.uso_cfdi = 'Selecciona el uso de CFDI.';
    const nueva = sel.value === 'nueva';
    const hayErr = marcarErrores(form, errores);
    if (nueva && validarFormDireccion(cajaDir)) return; if (hayErr) return;
    const cuerpo = { rfc: d.rfc, razon_social: d.razon_social, cp_fiscal: d.cp_fiscal, regimen: d.regimen, uso_cfdi: d.uso_cfdi };
    if (nueva) cuerpo.direccion = { ...leerDireccion(cajaDir), alias: 'Facturación' }; else cuerpo.direccion_id = Number(sel.value);
    const b = $('button[type=submit]', form); b.disabled = true;
    try { const res = await post(`/pedidos/${id}/factura`, cuerpo); toast(res.mensaje, 'ok'); exito(ctx, p, res.folio); }
    catch (er) { b.disabled = false; if (er.datos.errores) marcarErrores(form, er.datos.errores); errorToast(er); }
  });
}

function exito(ctx, p, folio) {
  ctx.contenedor.innerHTML = `<div class="contenedor seccion" style="max-width:640px"><div class="tarjeta exito"><div class="check" aria-hidden="true">${ico('check')}</div><h1>¡Factura generada!</h1>
    <p>Folio de factura <b>${esc(folio)}</b> · Pedido ${esc(p.folio)}<br>La enviamos al correo con el que te registraste.</p>
    <div style="display:flex;gap:.8rem;flex-wrap:wrap;justify-content:center;margin-top:1rem"><button class="btn" id="b-pdf">${ico('descargar')} Descargar PDF</button><button class="btn crema" id="b-mail">${ico('correo')} Enviar de nuevo a mi correo</button><a class="btn sec" href="/cuenta/pedidos" data-link>Mis pedidos</a></div></div></div>`;
  $('#b-pdf').addEventListener('click', async () => { try { await descargar(`/pedidos/${p.id}/factura.pdf`, `${folio}.pdf`); toast('Descargando tu factura…', 'ok'); } catch (e) { errorToast(e); } });
  $('#b-mail').addEventListener('click', async (e) => { e.currentTarget.disabled = true; try { toast((await post(`/pedidos/${p.id}/factura/enviar`)).mensaje, 'ok'); } catch (er) { errorToast(er); } e.currentTarget.disabled = false; });
}
