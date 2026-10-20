import { estado, esc, $, $$, ico, get, post, precio, fecha, estrellas, comboCantidad, activarCombos, valorCombo, etiquetaStock, toast, errorToast, marcarErrores } from '../util.js';
import { validarComentario } from '../validators.js';

export async function render(ctx) {
  const id = Number(ctx.params[0]);
  const p = await get(`/productos/${id}`);
  if (!ctx.sigue()) return;
  ctx.titulo(p.nombre);
  let color = p.colores[0]?.nombre;
  const tope = p.max_compra;
  const motivo = p.existencias < estado.tienda.limite_modelo
    ? `Solo hay ${p.existencias} ${p.existencias === 1 ? 'pieza disponible' : 'piezas disponibles'} de este modelo.`
    : `Puedes comprar máximo ${estado.tienda.limite_modelo} piezas por modelo.`;
  const fotos = p.fotos.length ? p.fotos : [p.imagen];

  ctx.contenedor.innerHTML = `<div class="contenedor seccion">
    <p class="muted" style="margin-bottom:1rem"><a href="/catalogo" data-link>Catálogo</a> › <a href="/catalogo?categoria=${p.categoria_id}" data-link>${esc(p.categoria)}</a> › ${esc(p.nombre)}</p>
    <div class="det-grid">
      <div class="tarjeta galeria"><div class="principal" style="position:relative"><img id="foto-p" src="${esc(p.colores[0]?.foto || fotos[0])}" alt="Mochila ${esc(p.nombre)}" ${p.agotado ? 'style="filter:grayscale(1);opacity:.6"' : ''}>${etiquetaStock(p)}</div>
        <div class="miniaturas" role="group" aria-label="Fotografías">${fotos.map((f, i) => `<button class="${i === 0 ? 'on' : ''}" data-foto="${esc(f)}" aria-label="Ver foto ${i + 1}"><img src="${esc(f)}" alt="" loading="lazy"></button>`).join('')}</div></div>
      <div class="tarjeta"><div class="det-info">
        <div>
          <h1>${esc(p.nombre)}<span class="codigo">${esc(p.codigo)}</span></h1>
          <p style="display:flex;align-items:center;gap:.5rem">${p.resumen.total ? `<b>${Number(p.resumen.promedio).toFixed(1)}</b> ${estrellas(p.resumen.promedio)} <a href="#resenas">(${p.resumen.total} reseñas)</a>` : '<span class="muted">Aún sin reseñas</span>'}</p>
          <div class="precio-g">${precio(p.precio)} <small>IVA incluido</small></div>
          <p style="margin:.6rem 0 .1rem">Color: <b id="color-nom">${esc(color)}</b></p>
          <div class="swatches" role="radiogroup" aria-label="Color">${p.colores.map((c, i) => `<button class="swatch ${i === 0 ? 'on' : ''}" role="radio" aria-checked="${i === 0}" data-color="${esc(c.nombre)}" data-foto="${esc(c.foto || '')}"><span style="background:${esc(c.hex)}"></span>${esc(c.nombre)}</button>`).join('')}</div>
          <p id="stock-txt">${p.agotado ? '<b style="color:var(--rojo)">Agotado</b>' : p.pocas_piezas ? `<b style="color:#c0392b">¡Solo quedan ${p.existencias} ${p.existencias === 1 ? 'pieza' : 'piezas'}!</b>` : `Quedan ${p.existencias} piezas`}</p>
          <label for="cant" style="font-weight:600">Cantidad</label>
          <div class="cantidad-fila">${comboCantidad({ id: 'cant', valor: 1, max: tope, motivoMax: motivo })}<button class="btn" id="btn-agregar" ${p.agotado ? 'disabled' : ''}>${p.agotado ? 'Agotado' : 'Agregar al carrito'}</button></div>
          <div class="acc-sec"><button id="btn-fav" aria-pressed="${p.favorito}">${ico('corazon')} <span>${p.favorito ? 'Guardada' : 'Guardar'}</span></button><button id="btn-compartir">${ico('compartir')} Compartir</button></div>
        </div>
        <div>
          <div class="acordeon abierta"><button aria-expanded="true">Descripción <span class="mas">${ico('mas')}</span></button><div class="cont">${esc(p.descripcion)}</div></div>
          <div class="acordeon"><button aria-expanded="false"><span>Material<br><small class="muted" style="font-weight:500">(${esc(p.material)})</small></span><span class="mas">${ico('mas')}</span></button><div class="cont">${esc(p.material)}</div></div>
          <div class="acordeon"><button aria-expanded="false"><span>Medidas<br><small class="muted" style="font-weight:500">(${p.medidas.largo}×${p.medidas.alto}×${p.medidas.ancho} cm)</small></span><span class="mas">${ico('mas')}</span></button><div class="cont">Largo: ${p.medidas.largo} cm<br>Alto: ${p.medidas.alto} cm<br>Ancho: ${p.medidas.ancho} cm</div></div>
        </div></div></div></div>
    <section class="tarjeta resenas" id="resenas" aria-labelledby="h-res"><h2 id="h-res">Reseñas y calificaciones</h2><div id="res-cont"><div class="cargando"><div class="spinner"></div></div></div></section></div>`;

  const foto = $('#foto-p');
  const cambiarFoto = (src) => { if (src) { foto.src = src; $$('.miniaturas button').forEach((b) => b.classList.toggle('on', b.dataset.foto === src)); } };
  $$('.miniaturas button').forEach((b) => b.addEventListener('click', () => cambiarFoto(b.dataset.foto)));
  $$('.swatch').forEach((b) => b.addEventListener('click', () => {
    color = b.dataset.color; $('#color-nom').textContent = color;
    $$('.swatch').forEach((s) => { s.classList.toggle('on', s === b); s.setAttribute('aria-checked', s === b); });
    cambiarFoto(b.dataset.foto);
  }));
  $$('.acordeon > button').forEach((b) => b.addEventListener('click', () => { const a = b.parentElement.classList.toggle('abierta'); b.setAttribute('aria-expanded', a); }));
  activarCombos(ctx.contenedor);

  $('#btn-agregar').addEventListener('click', async () => {
    try {
      const r = await post('/carrito', { producto_id: p.id, color, cantidad: valorCombo($('[data-combo]')) });
      estado.piezas = r.piezas; ctx.refrescarCarrito(); toast(r.mensaje, 'ok');
    } catch (e) { errorToast(e); }
  });
  $('#btn-fav').addEventListener('click', async (e) => {
    if (!estado.usuario) { toast('Inicia sesión para guardar tus favoritos.'); return ctx.navegar(`/login?volver=${encodeURIComponent(location.pathname)}`); }
    try { const r = await post(`/favoritos/${p.id}`); e.currentTarget.setAttribute('aria-pressed', r.favorito); $('span', e.currentTarget).textContent = r.favorito ? 'Guardada' : 'Guardar'; $('.ico', e.currentTarget).style.fill = r.favorito ? 'var(--naranja)' : 'none'; toast(r.favorito ? 'Guardada en tus favoritos.' : 'Quitada de tus favoritos.'); } catch (err) { errorToast(err); }
  });
  if (p.favorito) $('#btn-fav .ico').style.fill = 'var(--naranja)';
  $('#btn-compartir').addEventListener('click', async () => {
    const datos = { title: `${p.nombre} — ${estado.tienda.nombre}`, url: location.href };
    try { if (navigator.share) await navigator.share(datos); else { await navigator.clipboard.writeText(location.href); toast('Enlace copiado al portapapeles.', 'ok'); } } catch { /* cancelado */ }
  });

  // ------------------------------------------------------------ Reseñas (RF-10)
  let orden = 'recientes';
  async function cargarResenas() {
    const d = await get(`/productos/${p.id}/resenas?orden=${orden}`);
    const r = d.resumen;
    const formulario = !estado.usuario
      ? '<p class="muted">Inicia sesión para opinar sobre las mochilas que ya recibiste.</p>'
      : p.ya_reseno ? '<p class="muted">Gracias, ya escribiste tu reseña de esta mochila.</p>'
      : p.puede_resenar ? `<form id="f-res" novalidate class="tarjeta" style="background:var(--crema);box-shadow:none;margin-top:1rem"><h3>Cuéntanos tu experiencia</h3>
          <div class="campo"><span id="et-est">Tu calificación</span><div class="estrellas-input" role="radiogroup" aria-labelledby="et-est">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="calificacion" id="e${n}" value="${n}"><label for="e${n}" title="${n} estrellas"><svg class="ico" viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z"/></svg><span class="solo-lector">${n} estrellas</span></label>`).join('')}</div></div>
          <div class="campo"><label for="comentario">Tu comentario</label><textarea id="comentario" name="comentario" maxlength="500" placeholder="¿Qué te pareció la mochila?"></textarea><span class="contador" id="contador">0/500</span></div>
          <button class="btn" type="submit">Publicar reseña</button></form>`
      : '<p class="muted">Solo los clientes que ya recibieron esta mochila pueden dejar una reseña.</p>';
    $('#res-cont').innerHTML = `
      <div class="res-resumen"><div class="res-prom"><b>${r.total ? Number(r.promedio).toFixed(1) : '—'}</b>${estrellas(r.promedio)}<div class="muted">${r.total} reseñas</div></div>
        <div class="barras">${[5, 4, 3, 2, 1].map((n) => { const pc = r.total ? Math.round((r.por_estrella[n] / r.total) * 100) : 0; return `<div class="barra-f"><span>${n} ★</span><div class="bar"><i style="width:${pc}%"></i></div><span>${pc}%</span></div>`; }).join('')}</div></div>
      ${r.total ? `<div style="display:flex;justify-content:flex-end"><select id="orden-res" class="campo-ico" style="width:auto" aria-label="Ordenar reseñas"><option value="recientes">Más recientes</option><option value="mejores">Mejor calificación</option><option value="utiles">Más útiles</option></select></div>` : ''}
      ${d.resenas.map((x) => `<article class="resena"><div class="cab"><span class="avatar" aria-hidden="true">${esc(x.autor.charAt(0))}</span><b>${esc(x.autor)}</b>${x.verificado ? '<span class="verificado">Verificado</span>' : ''}<span style="margin-left:auto">${estrellas(x.calificacion)}</span></div>
        <p style="margin:.3rem 0">${esc(x.comentario)}</p><div style="display:flex;align-items:center;gap:1rem"><span class="muted" style="font-size:.85rem">${fecha(x.fecha)}</span>
        <button class="like-btn ${x.di_like ? 'on' : ''}" data-like="${x.id}" ${p.compro ? '' : 'disabled title="Solo si compraste y recibiste esta mochila"'}>${ico('pulgar')} ${x.likes}</button></div></article>`).join('') || '<p class="muted">Sé la primera persona en opinar.</p>'}
      ${formulario}`;
    if (r.total) { const s = $('#orden-res'); s.value = orden; s.addEventListener('change', () => { orden = s.value; cargarResenas(); }); }
    $$('[data-like]').forEach((b) => b.addEventListener('click', async () => { try { await post(`/resenas/${b.dataset.like}/like`); cargarResenas(); } catch (e) { errorToast(e); } }));
    const f = $('#f-res');
    if (f) {
      $('#comentario').addEventListener('input', (e) => { $('#contador').textContent = `${e.target.value.length}/500`; });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cal = f.querySelector('[name=calificacion]:checked')?.value;
        const com = $('#comentario').value;
        const errores = {};
        if (!cal) errores.calificacion = 'Elige de 1 a 5 estrellas.';
        const ec = validarComentario(com); if (ec) errores.comentario = ec;
        if (marcarErrores(f, errores)) return;
        try { await post(`/productos/${p.id}/resenas`, { calificacion: Number(cal), comentario: com }); toast('¡Gracias por tu reseña!', 'ok'); p.ya_reseno = true; p.puede_resenar = false; cargarResenas(); } catch (er) { if (er.datos.errores) marcarErrores(f, er.datos.errores); errorToast(er); }
      });
    }
  }
  await cargarResenas();
}
