import { estado, esc, $, ico, icoRed, get, precio, tarjetaProducto, activarTarjetas, errorToast } from '../util.js';
import { faqHtml, activarFaq } from './info.js';

const IMG_CAT = { infantil: '/img/home/cat-infantil.jpg', juvenil: '/img/home/cat-juvenil.jpg', accesorios: '/img/home/cat-accesorios.jpg' };
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** RF-16 CA2: video real de la tienda. Admite YouTube, archivo .mp4/.webm o enlace a la red social. */
function bloqueVideo(url) {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/.exec(url);
  const poster = '/img/home/video-poster.jpg';
  if (/\.(mp4|webm)(\?|$)/i.test(url)) return `<div class="video-main"><video controls preload="metadata" poster="${poster}" aria-label="Mochilas Aventura MX en acción"><source src="${esc(url)}"></video></div>`;
  if (yt) {
    return `<div class="video-main" id="video-yt" data-id="${yt[1]}"><img src="${poster}" alt="Miniatura del video Míralas en acción"><span class="play"><span>${'<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'}</span></span><span class="tit">Míralas en acción</span><button class="solo-lector" id="play-yt">Reproducir video</button></div>`;
  }
  return `<a class="video-main" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Ver el video de Mochilas Aventura MX en su red social"><img src="${poster}" alt="Personas usando mochilas en la ciudad y la montaña" loading="lazy"><span class="play"><span><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></span><span class="tit">Míralas en acción</span></a>`;
}

export async function render(ctx) {
  ctx.titulo('');
  const t = estado.tienda, r = t.redes;
  const destacadas = await get('/productos/destacadas').catch(() => []);
  if (!ctx.sigue()) return;
  const infantil = t.categorias.find((c) => norm(c.nombre) === 'infantil');
  const estrella = destacadas.find((p) => p.nombre === 'Dinos') || destacadas[0];

  const catHtml = t.categorias.map((c, i) => {
    const k = norm(c.nombre), img = IMG_CAT[k];
    const cuerpo = (cls, sub) => `<a class="cat ${cls}" href="/catalogo?categoria=${c.id}" data-link>`;
    if (i === 0 && img) {
      return `${cuerpo('grande')}<img src="${img}" alt="Mochilas ${esc(c.nombre)}" loading="lazy"><div class="cat-pie"><div><h3>${esc(c.nombre)}</h3><span>${esc(c.descripcion || '')}</span></div><span class="flecha"><span class="circ">${ico('flecha_der')}</span>Ver colección</span></div></a>`;
    }
    const color = k === 'juvenil' ? 'azul' : k === 'accesorios' ? 'amarilla' : 'otra';
    return `${cuerpo('chica ' + color)}${img ? `<img src="${img}" alt="${esc(c.nombre)}" loading="lazy">` : '<span></span>'}<div><h3>${esc(c.nombre)}</h3><p>${esc(c.descripcion || '')}</p><span class="flecha"><span class="circ">${ico('flecha_der')}</span>Ver colección</span></div></a>`;
  }).join('');

  ctx.contenedor.innerHTML = `
  <div class="contenedor">
    <section class="hero" aria-labelledby="h-hero">
      <div><h1 id="h-hero">Mochilas para cada aventura</h1>
        <p class="sub">Infantiles y juveniles, resistentes y listas para el regreso a clases</p>
        <div class="btns"><a class="btn" href="/catalogo" data-link>Ver catálogo</a>${infantil ? `<a class="btn sec" href="/catalogo?categoria=${infantil.id}" data-link>Ver Infantil</a>` : ''}</div></div>
      <div class="hero-foto"><img class="principal" src="/img/home/banner.jpg" alt="Niña y niño sonriendo con sus mochilas en un parque" fetchpriority="high">
        <div class="etiqueta-amarilla">Envío gratis desde ${precio(t.envio_gratis_desde)}</div>
        ${estrella ? `<a class="mini-precio" href="/producto/${estrella.id}" data-link><img src="${esc(estrella.colores[0]?.foto || estrella.imagen)}" alt="${esc(estrella.nombre)}">${precio(estrella.precio)}</a>` : ''}</div>
    </section>

    <section class="seccion" aria-labelledby="h-cats"><h2 class="centrado" id="h-cats">Explora por categoría</h2><div class="cats">${catHtml}</div></section>

    <section class="seccion" aria-labelledby="h-fav"><div class="seccion-cab"><h2 id="h-fav">Las favoritas del momento</h2><a href="/catalogo" data-link>Ver todo</a></div>
      ${destacadas.length ? `<div class="grid-prod" id="destacadas">${destacadas.map(tarjetaProducto).join('')}</div>` : '<p class="muted">Pronto tendremos nuevas favoritas.</p>'}</section>

    <section class="seccion" aria-labelledby="h-video"><h2 class="solo-lector" id="h-video">Videos de las mochilas</h2>
      <div class="video-grid">${bloqueVideo(t.video_url)}
        <div class="video-lado"><h3>Síguenos para ver más videos</h3>
          <div class="redes">${['instagram', 'facebook', 'tiktok', 'x', 'whatsapp'].map((k) => `<a href="${esc(r[k])}" target="_blank" rel="noopener noreferrer" aria-label="${k} de ${esc(t.nombre)}">${icoRed(k)}</a>`).join('')}</div>
          ${[['vid-viaje', 'Mochila de Viaje Compacta'], ['vid-urbano', 'Estilo Urbano'], ['vid-montana', 'Aventura en la Montaña']].map(([f, n]) => `<a class="mini-video" href="${esc(r.tiktok)}" target="_blank" rel="noopener noreferrer"><img src="/img/home/${f}.jpg" alt="" loading="lazy"><b>${n}</b><i>${ico('flecha_der')}</i></a>`).join('')}</div></div></section>

    <section class="seccion">${faqHtml()}</section>
  </div>`;

  activarFaq(ctx.contenedor);
  const grid = $('#destacadas', ctx.contenedor);
  if (grid) activarTarjetas(grid, { navegar: ctx.navegar, refrescarCarrito: ctx.refrescarCarrito });
  const yt = $('#video-yt', ctx.contenedor);
  if (yt) yt.addEventListener('click', () => { yt.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${yt.dataset.id}?autoplay=1" title="Mochilas Aventura MX en acción" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`; });
}
