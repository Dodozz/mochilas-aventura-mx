import { estado, esc, $, $$, ico, logoIcono, get, post, put, moneda, fecha, fechaCorta, fechaHora, toast, errorToast, modal, confirmar, marcarErrores, datosForm } from '../util.js';

const ETQ = { pagado: 'Pagado', preparando: 'Preparando', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado', devuelto: 'Devuelto' };
const MENU = [['pedidos', 'Pedidos', 'carrito', 'pedidos_nuevos'], ['catalogo', 'Catálogo', 'caja'], ['categorias', 'Categorías', 'carpeta'], ['inventario', 'Inventario', 'almacen'], ['resenas', 'Reseñas', 'estrella'], ['devoluciones', 'Devoluciones', 'deshacer', 'devoluciones_pendientes'], ['configuracion', 'Configuración', 'engrane'], ['correos', 'Correos', 'correo']];

export async function render(ctx) {
  // RF-18 CA9 / RN-13: el panel solo es para administradores; el servidor lo vuelve a verificar en cada petición.
  if (!estado.usuario) return ctx.navegar(`/login?volver=${encodeURIComponent(location.pathname)}`, { reemplazar: true });
  if (estado.usuario.rol !== 'administrador') {
    document.body.classList.remove('modo-admin');
    ctx.contenedor.innerHTML = `<div class="contenedor denegado"><div class="candado">${ico('candado')}</div><h1>Acceso denegado</h1><p>Esta sección es solo para administradores de la tienda.</p><a class="btn" href="/" data-link>Volver a la tienda</a></div>`;
    return;
  }
  const ruta = (ctx.params[0] || 'pedidos').replace(/\/+$/, '');
  const [seccion, sub] = ruta.split('/');
  ctx.titulo('Administración');
  const cont = await get('/admin/contadores');
  if (!ctx.sigue()) return;
  ctx.contenedor.innerHTML = `<div class="admin"><nav class="admin-lat" aria-label="Administración"><a class="logo" href="/admin/pedidos" data-link>${logoIcono(true)}<span class="txt">Mochilas<br>Aventura MX</span></a>
    ${MENU.map(([k, n, i, c]) => `<a href="/admin/${k}" data-link class="${k === seccion ? 'on' : ''}" ${k === seccion ? 'aria-current="page"' : ''}>${ico(i)} ${n}${c && cont[c] ? `<span class="cont" aria-label="${cont[c]} pendientes">${cont[c]}</span>` : ''}</a>`).join('')}
    <span class="sep"></span><a href="/" data-link>${ico('flecha_izq')} Ver la tienda</a><button class="enlace" id="adm-salir">${ico('usuario')} Cerrar sesión</button></nav>
    <main class="admin-main" id="adm-main"><div class="cargando"><div class="spinner"></div></div></main></div>`;
  $('#adm-salir').addEventListener('click', async () => { await post('/auth/logout'); estado.usuario = null; await ctx.refrescarSesion(); ctx.navegar('/'); });
  const main = $('#adm-main');
  const redibujarBadges = async () => { const c = await get('/admin/contadores'); $$('.admin-lat a').forEach((a) => { const k = a.getAttribute('href').split('/').pop(); const m = MENU.find((x) => x[0] === k); if (!m?.[3]) return; $('.cont', a)?.remove(); if (c[m[3]]) a.insertAdjacentHTML('beforeend', `<span class="cont">${c[m[3]]}</span>`); }); };
  const aux = { ctx, main, redibujarBadges };
  try {
    if (seccion === 'pedidos' && sub) await detallePedido(aux, Number(sub));
    else if (seccion === 'pedidos') await listaPedidos(aux, cont);
    else if (seccion === 'devoluciones') await devoluciones(aux);
    else if (seccion === 'resenas') await resenas(aux);
    else if (seccion === 'configuracion') await configuracion(aux);
    else if (seccion === 'correos') await correos(aux);
    else if (['catalogo', 'categorias', 'inventario'].includes(seccion)) await (await import('./admin-catalogo.js'))[seccion](aux);
    else main.innerHTML = '<div class="tarjeta vacio"><h2>Sección no encontrada</h2></div>';
  } catch (e) {
    if (e.estado === 403 || e.estado === 401) { main.innerHTML = `<div class="denegado"><div class="candado">${ico('candado')}</div><h1>Acceso denegado</h1><p>${esc(e.message)}</p></div>`; return; }
    main.innerHTML = `<div class="tarjeta vacio"><h2>No pudimos cargar esta sección</h2><p>${esc(e.message)}</p></div>`;
  }
}

const pill = (clase, texto) => `<span class="pill p-${clase}">${esc(texto)}</span>`;

// ====================================================================== Pedidos (RF-18 CA5/CA6)
async function listaPedidos({ ctx, main }, cont) {
  const f = { estatus: ctx.query.get('estatus') || '', fecha: ctx.query.get('fecha') || '', q: ctx.query.get('q') || '', pagina: Number(ctx.query.get('pagina')) || 1 };
  main.innerHTML = `<div class="kpis">
      <a class="kpi" href="/admin/pedidos?estatus=nuevo" data-link><div class="t"><span>Pedidos<br>nuevos</span>${ico('caja')}</div><div class="n" id="k-nuevos">${cont.pedidos_nuevos}</div><div class="s">Sin atender</div></a>
      <a class="kpi" href="/admin/inventario" data-link><div class="t"><span>Stock bajo</span>${ico('info')}</div><div class="n">${cont.stock_bajo}</div><div class="s">Productos afectados</div></a>
      <a class="kpi" href="/admin/devoluciones" data-link><div class="t"><span>Devoluciones<br>pendientes</span>${ico('deshacer')}</div><div class="n">${cont.devoluciones_pendientes}</div><div class="s">Requiere acción</div></a></div>
    <section class="tarjeta" aria-labelledby="h-ped"><h2 id="h-ped">Pedidos recientes</h2>
      <div class="filtros-admin"><div class="campo"><label for="fe">Estatus</label><select id="fe"><option value="">Todos</option><option value="nuevo">Nuevos (sin atender)</option>${Object.entries(ETQ).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
        <div class="campo"><label for="ff">Fecha</label><select id="ff"><option value="">Todas</option><option value="hoy">Hoy</option><option value="ayer">Ayer</option><option value="7d">Últimos 7 días</option><option value="30d">Últimos 30 días</option></select></div>
        <div class="campo" style="flex:1"><label for="fq">Buscar</label><input id="fq" type="search" placeholder="Folio, cliente o correo" value="${esc(f.q)}"></div></div>
      <div class="tabla-wrap"><table class="tabla"><thead><tr><th>Folio</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estatus</th></tr></thead><tbody id="tb"></tbody></table></div>
      <nav class="paginacion" id="pg" aria-label="Paginación"></nav></section>`;
  $('#fe').value = f.estatus; $('#ff').value = f.fecha;
  let t;
  async function cargar() {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v && v !== 1)); history.replaceState({}, '', `/admin/pedidos${p.toString() ? '?' + p : ''}`);
    const d = await get(`/admin/pedidos?${p}`);
    $('#tb').innerHTML = d.pedidos.map((x) => `<tr class="click" data-id="${x.id}" tabindex="0"><td><b>${esc(x.folio)}</b></td><td>${esc(x.cliente)}</td><td>${fechaCorta(x.creado_en)}</td><td>${moneda(x.total)}</td><td>${x.nuevo ? pill('nuevo', 'Pedido nuevo') + ' ' : ''}${pill(x.estatus, ETQ[x.estatus])}</td></tr>`).join('') || '<tr><td colspan="5" class="muted centrado" style="padding:2rem">No hay pedidos con esos filtros.</td></tr>';
    $$('#tb tr[data-id]').forEach((r) => { const ir = () => ctx.navegar(`/admin/pedidos/${r.dataset.id}`); r.addEventListener('click', ir); r.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); }); });
    $('#pg').innerHTML = d.paginas > 1 ? Array.from({ length: d.paginas }, (_, i) => `<button data-p="${i + 1}" class="${i + 1 === d.pagina ? 'on' : ''}">${i + 1}</button>`).join('') : '';
  }
  $('#fe').addEventListener('change', (e) => { f.estatus = e.target.value; f.pagina = 1; cargar(); });
  $('#ff').addEventListener('change', (e) => { f.fecha = e.target.value; f.pagina = 1; cargar(); });
  $('#fq').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); f.pagina = 1; cargar(); }, 350); });
  $('#pg').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { f.pagina = Number(b.dataset.p); cargar(); } });
  await cargar();
}

async function detallePedido({ ctx, main, redibujarBadges }, id) {
  const p = await get(`/admin/pedidos/${id}`);
  redibujarBadges();
  const ORDEN = ['pagado', 'preparando', 'enviado', 'entregado'];
  const cerrado = ['cancelado', 'devuelto'].includes(p.estatus);
  const d = p.direccion;
  main.innerHTML = `<p><a href="/admin/pedidos" data-link>‹ Volver a pedidos</a></p><h1>Detalle del Pedido ${esc(p.folio)}</h1>
    <div class="detalle-adm"><section class="tarjeta"><div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap"><h2 style="margin:0">Detalles del Pedido</h2>${p.estatus === 'cancelado' ? pill('cancelado', 'Cancelado') : p.estatus === 'devuelto' ? pill('devuelto', 'Devuelto') : `<span class="pill p-entregado">${ico('check').replace('class="ico "', 'class="ico" style="width:16px;height:16px;vertical-align:-3px"')} Pago aprobado</span>`}</div>
      <p>Fecha del pedido: ${fecha(p.fecha)} · Cliente: <b>${esc(p.cliente.nombres)} ${esc(p.cliente.apellido_paterno)} ${esc(p.cliente.apellido_materno)}</b> (${esc(p.cliente.correo)})</p>
      <h3>Productos</h3>${p.items.map((i) => `<div class="linea-ped"><span style="display:flex;gap:.6rem;align-items:center"><img class="mini" src="${esc(i.imagen)}" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover"><span><b>${i.cantidad}x ${esc(i.nombre)}</b> <span class="muted">(${esc(i.color)}, ${esc(i.codigo)})</span>${i.cantidad > 1 ? `<br><small class="muted">${moneda(i.precio_unitario)} cada uno</small>` : ''}</span></span><b>${moneda(i.subtotal)}</b></div>`).join('')}
      <div class="linea-ped"><span>Subtotal (IVA incluido)</span><span>${moneda(p.subtotal)}</span></div><div class="linea-ped"><span>Envío</span><span>${p.envio ? moneda(p.envio) : 'Gratis'}</span></div>
      <div class="linea-ped" style="font-size:1.2rem"><b>Total a pagar:</b><b>${moneda(p.total)} MXN</b></div>
      <h3 style="margin-top:1rem">Dirección de Envío</h3><p style="margin:0">${esc(d.destinatario)}<br>${esc(d.calle)}${d.num_ext ? ' ' + esc(d.num_ext) : ''}${d.num_int ? ', Int. ' + esc(d.num_int) : ''}, Col. ${esc(d.colonia)}<br>${esc(d.municipio)}, CP ${esc(d.cp)}<br>${esc(d.estado)}, México</p>
      ${d.referencias ? `<h3 style="margin-top:1rem;font-size:1rem">Referencias de Entrega</h3><p style="margin:0">${esc(d.referencias)}</p>` : ''}
      <div class="zona-box">${ico('pin')}<span><b>Zona de Envío:</b> ${esc(p.zona)} · Entrega estimada ${esc(p.tiempo_estimado)}</span></div></section>
      <div><section class="tarjeta"><h2>Estado y Seguimiento</h2>${cerrado ? `<p class="muted">Este pedido está ${p.estatus} y ya no puede cambiar de estatus.</p>` : `<form id="f-est" novalidate><div class="campo"><label for="est">Estado actual:</label><select id="est" name="estatus">${ORDEN.map((k) => `<option value="${k}" ${k === p.estatus ? 'selected' : ''} ${ORDEN.indexOf(k) < ORDEN.indexOf(p.estatus) ? 'disabled' : ''}>${ETQ[k]}</option>`).join('')}</select></div>
        <div class="campo"><label for="guia">Número de guía:</label><input id="guia" name="numero_guia" maxlength="30" value="${esc(p.numero_guia || '')}" placeholder="Obligatorio al marcar como enviado"></div>
        <button class="btn block" type="submit">Guardar y notificar al cliente</button></form>`}</section>
        <section class="tarjeta" style="margin-top:1.2rem"><h3>Historial de Estados</h3><ul class="hist">${p.historial.map((h) => `<li>${fechaHora(h.fecha)} — <b>${ETQ[h.estatus] || h.estatus}</b>${h.nota ? ` (${esc(h.nota)})` : ''} · ${esc(h.autor)}</li>`).join('')}</ul></section></div></div>`;
  $('#f-est')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const r = await put(`/admin/pedidos/${id}/estatus`, datosForm(e.target)); toast(r.mensaje, 'ok'); await detallePedido({ ctx, main, redibujarBadges }, id); }
    catch (er) { if (er.datos.errores) marcarErrores(e.target, er.datos.errores); errorToast(er); }
  });
}

// ====================================================================== Devoluciones (RF-15 CA3)
async function devoluciones({ main, redibujarBadges }) {
  const lista = await get('/admin/devoluciones');
  main.innerHTML = `<h1>Devoluciones</h1><section class="tarjeta"><div class="tabla-wrap"><table class="tabla"><thead><tr><th>Pedido</th><th>Cliente</th><th>Motivo</th><th>Fecha</th><th>Estatus</th><th></th></tr></thead><tbody>
    ${lista.map((d) => `<tr><td><b>${esc(d.folio)}</b><br><small class="muted">${moneda(d.total)}</small></td><td>${esc(d.cliente)}</td><td>${esc(d.motivo)}${d.comentarios ? `<br><small class="muted">${esc(d.comentarios)}</small>` : ''}</td><td>${fechaCorta(d.creado_en)}</td><td>${pill(d.estatus, d.estatus)}${d.respuesta ? `<br><small class="muted">${esc(d.respuesta)}</small>` : ''}</td>
      <td>${d.estatus === 'pendiente' ? `<button class="btn chico" data-res="${d.id}" data-dec="aprobada">Aprobar</button> <button class="btn sec chico" data-res="${d.id}" data-dec="rechazada">Rechazar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted centrado" style="padding:2rem">No hay solicitudes de devolución.</td></tr>'}</tbody></table></div></section>`;
  $$('[data-res]', main).forEach((b) => b.addEventListener('click', () => {
    const aprobar = b.dataset.dec === 'aprobada';
    const m = modal(`<h2>${aprobar ? 'Aprobar' : 'Rechazar'} devolución</h2><form id="f-res" novalidate>
      ${aprobar ? '<label class="chk-linea"><input type="checkbox" name="reingresar" checked><span>La pieza llegó en buen estado: regresarla al inventario</span></label>' : ''}
      <div class="campo"><label for="rsp">${aprobar ? 'Comentarios para el cliente (opcional)' : 'Motivo del rechazo (obligatorio)'}</label><textarea id="rsp" name="respuesta" maxlength="300"></textarea></div>
      <div class="acc-modal"><button type="button" class="btn crema" data-cerrar>Cancelar</button><button class="btn ${aprobar ? '' : 'peligro'}" type="submit">${aprobar ? 'Aprobar y notificar' : 'Rechazar y notificar'}</button></div></form>`);
    const f = $('#f-res', m.raiz);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const r = await post(`/admin/devoluciones/${b.dataset.res}/resolver`, { decision: b.dataset.dec, respuesta: f.elements.respuesta.value, reingresar: !!f.elements.reingresar?.checked }); m.cerrar(); toast(r.mensaje, 'ok'); redibujarBadges(); devoluciones({ main, redibujarBadges }); }
      catch (er) { if (er.datos.errores) marcarErrores(f, er.datos.errores); errorToast(er); }
    });
  }));
}

// ====================================================================== Reseñas (RN-21)
async function resenas({ main }) {
  const lista = await get('/admin/resenas');
  main.innerHTML = `<h1>Reseñas</h1><section class="tarjeta"><p class="muted">Puedes ocultar reseñas con lenguaje ofensivo o ajenas al producto. Las reseñas ocultas dejan de verse en la tienda.</p><div class="tabla-wrap"><table class="tabla"><thead><tr><th>Mochila</th><th>Autor</th><th>Calificación</th><th>Comentario</th><th>Fecha</th><th></th></tr></thead><tbody>
    ${lista.map((r) => `<tr style="${r.oculta ? 'opacity:.55' : ''}"><td>${esc(r.producto)}</td><td>${esc(r.autor)}</td><td>${'★'.repeat(r.calificacion)}${'☆'.repeat(5 - r.calificacion)}</td><td style="max-width:340px">${esc(r.comentario)}</td><td>${fechaCorta(r.creado_en)}</td><td><button class="btn ${r.oculta ? '' : 'sec'} chico" data-alt="${r.id}">${r.oculta ? 'Mostrar' : 'Ocultar'}</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted centrado" style="padding:2rem">Aún no hay reseñas.</td></tr>'}</tbody></table></div></section>`;
  $$('[data-alt]', main).forEach((b) => b.addEventListener('click', async () => { try { const r = await post(`/admin/resenas/${b.dataset.alt}/alternar`); toast(r.oculta ? 'Reseña oculta.' : 'Reseña visible de nuevo.'); resenas({ main }); } catch (e) { errorToast(e); } }));
}

// ====================================================================== Configuración (RF-18 CA8)
async function configuracion(aux) {
  const { main } = aux;
  const c = await get('/admin/configuracion');
  main.innerHTML = `<h1>Configuración</h1><form id="f-conf" novalidate><div class="config-cards">
    <section class="tarjeta"><h2>Zonas de envío</h2>${c.zonas.map((z) => `<div class="campo"><label for="z${z.id}">${esc(z.nombre)} (${z.dias_min} a ${z.dias_max} días)</label><input id="z${z.id}" name="zona_${z.id}" inputmode="decimal" value="${z.costo}"></div>`).join('')}<span class="nota muted">Costo en MXN</span></section>
    <section class="tarjeta"><h2>Envío gratis desde</h2><div class="campo"><label for="eg">Monto mínimo (MXN)</label><input id="eg" name="envio_gratis_desde" inputmode="decimal" value="${c.envio_gratis_desde}" style="font-size:1.6rem;font-weight:800;color:var(--naranja)"></div></section>
    <section class="tarjeta"><h2>Límites de compra</h2><div class="campo"><label for="lm">Piezas por modelo</label><input id="lm" name="limite_modelo" inputmode="numeric" value="${c.limite_modelo}"></div><div class="campo"><label for="lp">Piezas por pedido</label><input id="lp" name="limite_pedido" inputmode="numeric" value="${c.limite_pedido}"></div></section></div>
    <section class="tarjeta" style="margin-bottom:1.4rem"><h2>Video de la tienda</h2><div class="campo"><label for="vu">Enlace del video real (YouTube, TikTok, Instagram o archivo .mp4)</label><input id="vu" name="video_url" type="url" value="${esc(c.video_url)}" placeholder="https://"></div><span class="nota muted">Se muestra en la sección "Míralas en acción" de la página de inicio.</span></section>
    <button class="btn" type="submit">Guardar configuración</button></form><div id="cat-panel" style="margin-top:1.6rem"></div>`;
  $('#f-conf').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    const cuerpo = { zonas: c.zonas.map((z) => ({ id: z.id, costo: f.elements[`zona_${z.id}`].value })), envio_gratis_desde: f.elements.envio_gratis_desde.value, limite_modelo: f.elements.limite_modelo.value, limite_pedido: f.elements.limite_pedido.value, video_url: f.elements.video_url.value };
    try { const r = await put('/admin/configuracion', cuerpo); toast(r.mensaje, 'ok'); marcarErrores(f, {}); }
    catch (er) { const errs = {}; for (const [k, v] of Object.entries(er.datos.errores || {})) errs[k] = v; marcarErrores(f, errs); errorToast(er); }
  });
  await (await import('./admin-catalogo.js')).panelCategorias($('#cat-panel'));
}

// ====================================================================== Correos enviados (simulados)
async function correos({ main }) {
  const lista = await get('/admin/correos');
  main.innerHTML = `<h1>Correos</h1><section class="tarjeta"><p class="muted">Comprobantes, avisos de pedidos nuevos, cambios de estatus y facturas. Sin servidor SMTP configurado se muestran como <b>simulados</b>, tal como los recibiría el cliente.</p><div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Para</th><th>Asunto</th><th>Adjunto</th><th>Estado</th></tr></thead><tbody>
    ${lista.map((m) => `<tr class="click" data-id="${m.id}" tabindex="0"><td>${fechaHora(m.fecha)}</td><td>${esc(m.para)}</td><td>${esc(m.asunto)}</td><td>${esc(m.adjunto || '—')}</td><td>${pill(m.estado_envio === 'error' ? 'cancelado' : 'pagado', m.estado_envio)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted centrado" style="padding:2rem">Todavía no se ha enviado ningún correo.</td></tr>'}</tbody></table></div></section>`;
  $$('tr[data-id]', main).forEach((r) => r.addEventListener('click', async () => {
    const c = await get(`/admin/correos/${r.dataset.id}`);
    const m = modal(`<h2 style="font-size:1.2rem">${esc(c.asunto)}</h2><p class="muted">Para: ${esc(c.para)} · ${fechaHora(c.fecha)}${c.adjunto ? ' · Adjunto: ' + esc(c.adjunto) : ''}</p><iframe title="Vista previa del correo" sandbox="" style="width:100%;height:55vh;border:1px solid var(--borde);border-radius:12px"></iframe><div class="acc-modal"><button class="btn crema" data-cerrar>Cerrar</button></div>`);
    $('iframe', m.raiz).srcdoc = c.cuerpo_html;
  }));
}
