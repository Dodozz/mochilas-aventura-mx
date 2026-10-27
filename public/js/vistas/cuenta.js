import { estado, esc, $, $$, ico, logoIcono, get, post, put, del, descargar, moneda, precio, fecha, toast, errorToast, modal, confirmar, marcarErrores, errorCampo, datosForm, validarEnVivo } from '../util.js';
import { validarPerfil, validarNombre, validarTelefono } from '../validators.js';
import { formDireccion, activarDireccion, leerDireccion, validarFormDireccion, textoDireccion } from '../direccion.js';

const ETQ = { pagado: 'Pagado', preparando: 'Preparando', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado', devuelto: 'Devuelto' };
const NAV = [['datos', 'Datos personales', 'usuario'], ['direcciones', 'Direcciones', 'pin'], ['pedidos', 'Mis pedidos', 'caja'], ['favoritos', 'Favoritos', 'corazon']];

export async function render(ctx) {
  if (!ctx.requiereSesion('login')) return;
  const seccion = ctx.params[0] || 'datos';
  const u = estado.usuario;
  ctx.titulo(NAV.find((n) => n[0] === seccion)[1]);
  ctx.contenedor.innerHTML = `<div class="contenedor seccion">
    <div class="tarjeta cuenta-cab"><div class="av">${logoIcono()}</div><div><h1>${esc(u.nombres)} ${esc(u.apellido_paterno)} ${esc(u.apellido_materno)}</h1>
      <span class="dato">${ico('correo')} ${esc(u.correo)}</span>${u.telefono ? `<span class="dato">${ico('telefono')} ${esc(u.telefono.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3'))}</span>` : ''}</div></div>
    <div class="cuenta-grid"><nav class="lateral" aria-label="Mi cuenta">${NAV.map(([k, n, i]) => `<a href="/cuenta/${k}" data-link class="${(k === seccion || (seccion === 'direcciones' && k === 'datos' && false)) ? 'on' : ''}" ${k === seccion ? 'aria-current="page"' : ''}>${ico(i)} ${n}</a>`).join('')}</nav>
      <div id="sec"><div class="cargando"><div class="spinner"></div></div></div></div></div>`;
  const sec = $('#sec');
  if (seccion === 'datos' || seccion === 'direcciones') { await datos(ctx, sec); await direcciones(ctx, sec); if (seccion === 'direcciones') $('#dir-sec')?.scrollIntoView(); }
  else if (seccion === 'pedidos') await pedidos(ctx, sec);
  else await favoritos(ctx, sec);
}

// ====================================================================== Datos personales (RF-19 CA1)
async function datos(ctx, sec) {
  const u = estado.usuario;
  sec.innerHTML = `<section class="tarjeta" aria-labelledby="h-dat"><h2 id="h-dat">Datos personales</h2><form id="f-datos" novalidate>
    <div class="fila-campos tres"><div class="campo"><label for="nombres">Nombre(s)</label><input id="nombres" name="nombres" maxlength="50" value="${esc(u.nombres)}"></div>
      <div class="campo"><label for="ap">Apellido paterno</label><input id="ap" name="apellido_paterno" maxlength="50" value="${esc(u.apellido_paterno)}"></div>
      <div class="campo"><label for="am">Apellido materno</label><input id="am" name="apellido_materno" maxlength="50" value="${esc(u.apellido_materno)}"></div></div>
    <div class="fila-campos"><div class="campo"><label for="correo">Correo</label><input id="correo" value="${esc(u.correo)}" readonly><span class="nota">El correo identifica tu cuenta y no se puede cambiar.</span></div>
      <div class="campo"><label for="tel">Teléfono</label><input id="tel" name="telefono" inputmode="numeric" autocomplete="tel-national" placeholder="10 dígitos" value="${esc(u.telefono || '')}"></div></div>
    <button class="btn block" type="submit">${ico('guardar')} Guardar cambios</button></form></section>
    <section class="tarjeta" id="dir-sec" style="margin-top:1.2rem" aria-labelledby="h-dir"><h2 id="h-dir">Direcciones guardadas</h2><div id="dirs"></div></section>`;
  const form = $('#f-datos');
  const reglas = { nombres: (v) => validarNombre(v, 'El nombre'), apellido_paterno: (v) => validarNombre(v, 'El apellido paterno'), apellido_materno: (v) => validarNombre(v, 'El apellido materno'), telefono: (v) => validarTelefono(v) };
  for (const [n, f] of Object.entries(reglas)) validarEnVivo($(`[name=${n}]`, form), f);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = datosForm(form);
    if (marcarErrores(form, validarPerfil(d))) return;
    try { const r = await put('/cuenta/perfil', d); estado.usuario = r.usuario; await ctx.refrescarSesion(); toast(r.mensaje, 'ok'); ctx.navegar(location.pathname, { reemplazar: true }); }
    catch (er) { if (er.datos.errores) marcarErrores(form, er.datos.errores); errorToast(er); }
  });
}

// ====================================================================== Direcciones (RF-19 CA2)
async function direcciones(ctx, sec) {
  const cont = $('#dirs', sec);
  const lista = await get('/cuenta/direcciones');
  cont.innerHTML = `<div class="dir-cards">${lista.map((d) => `<article class="dir-card"><h4>${ico(/ofic|trabajo/i.test(d.alias) ? 'edificio' : 'pin')} ${esc(d.alias)}</h4><p style="margin:0;font-size:.92rem">${textoDireccion(d)}</p>${d.referencias ? `<p class="muted" style="margin:0;font-size:.85rem">${esc(d.referencias)}</p>` : ''}
    <div class="acc"><button class="btn crema chico" data-edit="${d.id}">${ico('editar')} Editar</button><button class="btn crema chico" data-borrar="${d.id}">${ico('basura')} Eliminar</button></div></article>`).join('')}
    <button class="dir-nueva" id="nueva-dir">${ico('mas')}&nbsp;Agregar dirección</button></div>`;
  const abrir = async (d) => {
    const m = modal(`<h2>${d ? 'Editar' : 'Agregar'} dirección</h2><form id="f-dir-m" novalidate>${formDireccion(d || {}, { conAlias: true, p: 'm-' })}<div class="acc-modal"><button type="button" class="btn crema" data-cerrar>Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`);
    const f = $('#f-dir-m', m.raiz);
    await activarDireccion(f, d || {});
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (validarFormDireccion(f)) return;
      try { await (d ? put(`/cuenta/direcciones/${d.id}`, leerDireccion(f)) : post('/cuenta/direcciones', leerDireccion(f))); m.cerrar(); toast('Dirección guardada.', 'ok'); await direcciones(ctx, sec); }
      catch (er) { if (er.datos.errores) marcarErrores(f, er.datos.errores); errorToast(er); }
    });
  };
  $('#nueva-dir', cont).addEventListener('click', () => abrir(null));
  $$('[data-edit]', cont).forEach((b) => b.addEventListener('click', () => abrir(lista.find((d) => d.id === Number(b.dataset.edit)))));
  $$('[data-borrar]', cont).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar('Eliminar dirección', '¿Seguro que quieres eliminar esta dirección? Tus pedidos anteriores no se modifican.', 'Eliminar', true))) return;
    try { await del(`/cuenta/direcciones/${b.dataset.borrar}`); toast('Dirección eliminada.'); await direcciones(ctx, sec); } catch (e) { errorToast(e); }
  }));
}

// ====================================================================== Mis pedidos (RF-7 CA3, RF-9, RF-15, RF-19 CA3)
async function pedidos(ctx, sec) {
  const lista = await get('/pedidos');
  if (!ctx.sigue()) return;
  if (!lista.length) { sec.innerHTML = '<div class="tarjeta vacio"><h3>Aún no tienes pedidos</h3><p>Cuando compres, aquí verás el estatus de cada pedido.</p><a class="btn" href="/catalogo" data-link>Ver el catálogo</a></div>'; return; }
  const recargar = () => pedidos(ctx, sec);
  sec.innerHTML = `<div class="pedidos-grid">${lista.map((p) => {
    const dev = p.devolucion;
    const razonDev = dev ? `Devolución ${dev.estatus}` : p.estatus === 'entregado' ? 'El plazo de devolución ya venció' : 'Disponible cuando el pedido esté entregado';
    return `<article class="pedido-card" data-id="${p.id}"><div class="top"><h3>${esc(p.folio)}</h3><span class="pill p-${p.estatus}">${ETQ[p.estatus]}</span></div>
      <div class="mini-items">${p.items.slice(0, 4).map((i) => `<img src="${esc(i.imagen)}" alt="${esc(i.nombre)}" title="${esc(i.nombre)} (${esc(i.color)}) × ${i.cantidad}">`).join('')}</div>
      <div>Fecha: ${fecha(p.fecha)}<br>Total: <b>${moneda(p.total)} MXN</b>${p.numero_guia ? `<br>Guía: <b>${esc(p.numero_guia)}</b>` : ''}${dev ? `<br>Devolución: <span class="pill p-${dev.estatus}">${dev.estatus}</span>` : ''}</div>
      <div class="acciones-p">
        ${p.factura ? `<button class="btn crema chico" data-fac-desc="${p.id}" data-folio="${esc(p.factura)}">${ico('descargar')} Descargar factura</button><button class="btn crema chico" data-fac-mail="${p.id}">${ico('correo')} Enviar a mi correo</button>`
          : p.puede_facturar ? `<a class="btn crema chico" href="/cuenta/pedidos/${p.id}/factura" data-link>Solicitar factura</a>`
          : `<button class="btn crema chico desactivado" disabled title="${['cancelado', 'devuelto'].includes(p.estatus) ? 'No se factura un pedido cancelado o devuelto' : 'La factura solo se solicita dentro del mes de la compra'}">Solicitar factura</button>`}
        ${p.puede_devolver ? `<button class="btn sec chico" data-dev="${p.id}">${ico('deshacer')} Solicitar devolución</button>` : `<button class="btn sec chico" disabled title="${razonDev}">${ico('deshacer')} Solicitar devolución</button>`}
        ${p.puede_cancelar ? `<button class="btn peligro chico" data-cancel="${p.id}">Cancelar pedido</button>` : ''}
        <button class="btn navy chico" data-detalle="${p.id}">Ver detalle</button></div>
      <div class="detalle oculto" id="det-${p.id}"><hr style="border:0;border-top:1px solid var(--borde)">
        ${p.items.map((i) => `<div class="linea-ped"><span>${esc(i.nombre)} <span class="muted">(${esc(i.color)}) × ${i.cantidad}</span></span><b>${moneda(i.subtotal)}</b></div>`).join('')}
        <div class="linea-ped"><span>Envío (${esc(p.zona)})</span><b>${p.envio ? moneda(p.envio) : 'Gratis'}</b></div>
        <p style="margin:.6rem 0 0"><b>Enviado a:</b> ${textoDireccion({ ...p.direccion })}</p><p class="muted" style="margin:.2rem 0">Entrega estimada: ${esc(p.tiempo_estimado)} · Pago con tarjeta •••• ${esc(p.tarjeta_ultimos4)}</p>
        ${dev?.respuesta ? `<p style="margin:.3rem 0"><b>Respuesta de la tienda:</b> ${esc(dev.respuesta)}</p>` : ''}
        <ul class="hist">${p.historial.map((h) => `<li>${fecha(h.fecha)} — ${ETQ[h.estatus] || h.estatus}${h.nota ? ` (${esc(h.nota)})` : ''}</li>`).join('')}</ul>
        ${p.estatus === 'entregado' ? '<p style="margin:.5rem 0 0"><a href="/catalogo" data-link>Cuéntanos qué te pareció: deja tu reseña en la página de cada mochila.</a></p>' : ''}</div></article>`;
  }).join('')}</div>`;

  $$('[data-detalle]', sec).forEach((b) => b.addEventListener('click', () => { const d = $(`#det-${b.dataset.detalle}`); d.classList.toggle('oculto'); b.textContent = d.classList.contains('oculto') ? 'Ver detalle' : 'Ocultar detalle'; }));
  $$('[data-fac-desc]', sec).forEach((b) => b.addEventListener('click', async () => { try { await descargar(`/pedidos/${b.dataset.facDesc}/factura.pdf`, `${b.dataset.folio}.pdf`); toast('Descargando tu factura…', 'ok'); } catch (e) { errorToast(e); } }));
  $$('[data-fac-mail]', sec).forEach((b) => b.addEventListener('click', async () => { b.disabled = true; try { const r = await post(`/pedidos/${b.dataset.facMail}/factura/enviar`); toast(r.mensaje, 'ok'); } catch (e) { errorToast(e); } b.disabled = false; }));
  $$('[data-cancel]', sec).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar('Cancelar pedido', 'Cancelaremos tu pedido y te reembolsaremos por el mismo medio de pago. Esta acción no se puede deshacer.', 'Sí, cancelar', true))) return;
    try { const r = await post(`/pedidos/${b.dataset.cancel}/cancelar`); toast(r.mensaje, 'ok'); recargar(); } catch (e) { errorToast(e); }
  }));
  $$('[data-dev]', sec).forEach((b) => b.addEventListener('click', () => {
    const p = lista.find((x) => x.id === Number(b.dataset.dev));
    const m = modal(`<h2>Solicitar devolución</h2><p>Para el pedido ${esc(p.folio)}</p><form id="f-dev" novalidate>
      <div class="campo"><label for="motivo">Motivo</label><select id="motivo" name="motivo"><option value="">Selecciona un motivo</option>${estado.tienda.motivos_devolucion.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div>
      <div class="campo"><label for="coment">Comentarios adicionales (opcional)</label><textarea id="coment" name="comentarios" maxlength="300" placeholder="Comentarios adicionales (opcional)"></textarea></div>
      <p>Tienes ${estado.tienda.dias_devolucion} días naturales después de la entrega, con el producto sin uso y con etiquetas.</p>
      <div class="acc-modal"><button type="button" class="btn crema" data-cerrar>Cancelar</button><button class="btn" type="submit">Enviar solicitud</button></div></form>`);
    const f = $('#f-dev', m.raiz);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const d = datosForm(f);
      if (marcarErrores(f, d.motivo ? {} : { motivo: 'Selecciona un motivo.' })) return;
      try { const r = await post(`/pedidos/${p.id}/devolucion`, d); m.cerrar(); toast(r.mensaje, 'ok'); recargar(); } catch (er) { if (er.datos.errores) marcarErrores(f, er.datos.errores); errorToast(er); }
    });
  }));
}

// ====================================================================== Favoritos (RF-12)
async function favoritos(ctx, sec) {
  const lista = await get('/cuenta/favoritos');
  if (!ctx.sigue()) return;
  if (!lista.length) { sec.innerHTML = '<div class="tarjeta vacio"><h3>Todavía no tienes favoritos</h3><p>Toca el corazón de una mochila para guardarla aquí.</p><a class="btn" href="/catalogo" data-link>Explorar mochilas</a></div>'; return; }
  sec.innerHTML = `<div class="fav-grid">${lista.map((p) => `<article class="prod ${p.agotado || p.oculto ? 'agotado' : ''}" data-id="${p.id}">
    <a class="img" href="/producto/${p.id}" data-link>${p.agotado || p.oculto ? '<span class="cinta">Agotado</span>' : ''}<img src="${esc(p.colores[0]?.foto || p.imagen)}" alt="${esc(p.nombre)}" loading="lazy"></a>
    <button class="corazon on" data-quitar="${p.id}" aria-label="Quitar de favoritos">${ico('corazon')}</button>
    <div class="cuerpo"><a class="nombre" href="/producto/${p.id}" data-link>${esc(p.nombre)}</a><span class="muted">${esc(p.categoria)}</span><span class="precio">${moneda(p.precio)} MXN</span>
      <button class="btn navy block" data-mover="${p.id}" data-color="${esc(p.colores[0]?.nombre || '')}" ${p.agotado || p.oculto ? 'disabled' : ''}>Mover al carrito</button></div></article>`).join('')}</div>`;
  $$('[data-quitar]', sec).forEach((b) => b.addEventListener('click', async () => { try { await post(`/favoritos/${b.dataset.quitar}`); toast('Quitada de tus favoritos.'); favoritos(ctx, sec); } catch (e) { errorToast(e); } }));
  $$('[data-mover]', sec).forEach((b) => b.addEventListener('click', async () => {
    try { // se verifica la existencia en el servidor antes de pasarla al carrito (RF-12 CA3)
      await post('/carrito', { producto_id: Number(b.dataset.mover), color: b.dataset.color, cantidad: 1 });
      await post(`/favoritos/${b.dataset.mover}`); toast('La pasamos a tu carrito.', 'ok'); await ctx.refrescarCarrito(); favoritos(ctx, sec);
    } catch (e) { errorToast(e); }
  }));
}
