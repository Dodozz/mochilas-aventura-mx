import { estado, esc, $, $$, ico, icoRed, logo, logoIcono, get, post, toast, errorToast, precio } from './util.js';

// ------------------------------------------------------------------ Rutas (cada pantalla es un módulo)
const RUTAS = [
  [/^\/$/, 'inicio'],
  [/^\/catalogo$/, 'catalogo'],
  [/^\/producto\/(\d+)$/, 'producto'],
  [/^\/carrito$/, 'carrito'],
  [/^\/checkout\/(entrega|pago)$/, 'checkout'],
  [/^\/checkout\/confirmacion\/(\d+)$/, 'confirmacion'],
  [/^\/(login|registro)$/, 'auth'],
  [/^\/cuenta\/pedidos\/(\d+)\/factura$/, 'factura'],
  [/^\/cuenta(?:\/(datos|direcciones|pedidos|favoritos))?$/, 'cuenta'],
  [/^\/politicas\/(devoluciones|envios|privacidad|terminos)$/, 'info', 'politica'],
  [/^\/contacto$/, 'info', 'contacto'],
  [/^\/preguntas-frecuentes$/, 'info', 'faq'],
  [/^\/admin(?:\/(.*))?$/, 'admin'],
];

const app = $('#app');
let numRender = 0;

export function navegar(url, { reemplazar = false } = {}) {
  if (reemplazar) history.replaceState({}, '', url); else history.pushState({}, '', url);
  return pintarRuta();
}

/** Si no hay sesión, manda a registrarse/iniciar sesión y regresa a la misma pantalla al terminar (RF-1 CA2). */
export function requiereSesion(destino = 'registro') {
  if (estado.usuario) return true;
  navegar(`/${destino}?volver=${encodeURIComponent(location.pathname + location.search)}`, { reemplazar: true });
  return false;
}

export async function refrescarSesion() {
  const s = await get('/sesion');
  estado.usuario = s.usuario; estado.piezas = s.piezas;
  pintarEncabezado();
}
export async function refrescarCarrito() {
  try { estado.piezas = (await get('/sesion')).piezas; } catch { /* sin cambios */ }
  const b = $('#contador-carrito'); if (b) { b.textContent = estado.piezas; b.classList.toggle('oculto', !estado.piezas); }
}

// ------------------------------------------------------------------ Encabezado y pie (RF-2, RNF-1)
function pintarEncabezado() {
  const cont = $('#encabezado'); if (!cont) return;
  const t = estado.tienda, u = estado.usuario;
  const cats = t.categorias;
  cont.innerHTML = `
    <div class="anuncio">Envío gratis en compras desde ${precio(t.envio_gratis_desde)}</div>
    <header class="encabezado"><div class="contenedor fila">
      <button class="icon-btn hamburguesa" id="btn-menu" aria-label="Abrir menú" aria-expanded="false">${ico('menu')}</button>
      ${logo()}
      <nav class="nav-principal" id="nav-principal" aria-label="Categorías">
        ${cats.map((c) => `<a href="/catalogo?categoria=${c.id}" data-link>${esc(c.nombre)}</a>`).join('')}
        <a href="/catalogo" data-link>Todo</a>
      </nav>
      <form class="buscador" id="buscar-form" role="search">${ico('buscar')}<input type="search" name="q" placeholder="Busca tu mochila" aria-label="Buscar mochilas" autocomplete="off"></form>
      <div class="acciones">
        <button class="icon-btn" id="btn-buscar-m" aria-label="Buscar" style="display:none">${ico('buscar')}</button>
        <a class="icon-btn" href="/cuenta/favoritos" data-link aria-label="Favoritos">${ico('corazon')}</a>
        <a class="icon-btn" href="/carrito" data-link aria-label="Carrito, ${estado.piezas} artículos">${ico('carrito')}<span class="badge-num ${estado.piezas ? '' : 'oculto'}" id="contador-carrito">${estado.piezas}</span></a>
        ${u ? `<div class="menu-cuenta"><button class="btn-cuenta" id="btn-cuenta" aria-haspopup="menu" aria-expanded="false"><span class="nombre-corto">Hola, ${esc(u.nombres.split(' ')[0])}</span><span class="inicial" aria-hidden="true">${esc(u.nombres.charAt(0).toUpperCase())}</span>${ico('flecha_abajo')}</button>
          <div class="desplegable oculto" id="menu-cuenta" role="menu">
            <a href="/cuenta/datos" data-link role="menuitem">Mi perfil</a><a href="/cuenta/pedidos" data-link role="menuitem">Mis pedidos</a><a href="/cuenta/favoritos" data-link role="menuitem">Favoritos</a>
            ${u.rol === 'administrador' ? '<a href="/admin/pedidos" data-link role="menuitem">Panel de administración</a>' : ''}
            <button id="btn-salir" role="menuitem">Cerrar sesión</button></div></div>`
          : `<a class="btn-cuenta" href="/login" data-link>${ico('usuario')}<span class="nombre-corto">Iniciar sesión</span></a>`}
      </div></div></header>`;
  const menu = $('#nav-principal'), buscador = $('#buscar-form'), mbtn = $('#btn-menu');
  mbtn.addEventListener('click', () => { const ab = menu.classList.toggle('abierto'); mbtn.setAttribute('aria-expanded', ab); buscador.classList.toggle('abierto', ab); });
  $('#buscar-form').addEventListener('submit', (e) => { e.preventDefault(); const q = new FormData(e.target).get('q').trim(); navegar(q ? `/catalogo?q=${encodeURIComponent(q)}` : '/catalogo'); });
  const cta = $('#btn-cuenta');
  if (cta) {
    cta.addEventListener('click', (e) => { e.stopPropagation(); const m = $('#menu-cuenta'); m.classList.toggle('oculto'); cta.setAttribute('aria-expanded', !m.classList.contains('oculto')); });
    $('#btn-salir').addEventListener('click', async () => {
      await post('/auth/logout'); estado.usuario = null; await refrescarSesion(); toast('Cerraste sesión. Tu carrito se conserva en tu cuenta.'); navegar('/');
    });
  }
  activarEncabezadoFijo();
}

// ------------------------------------------------------------------ Encabezado fijo al bajar
// El encabezado se queda pegado arriba (CSS: position sticky). Cuando la franja de "Envío gratis" sale de la
// pantalla se vuelve compacto; además se publica su alto en --alto-enc para que los saltos a una sección
// y los paneles laterales fijos no queden debajo de él.
let vigiaAnuncio, vigiaAlto, alScroll;
function activarEncabezadoFijo() {
  const enc = $('.encabezado'), anuncio = $('.anuncio');
  if (!enc) return;
  vigiaAnuncio?.disconnect(); vigiaAlto?.disconnect();
  if (alScroll) window.removeEventListener('scroll', alScroll);
  if ('IntersectionObserver' in window && anuncio) {
    vigiaAnuncio = new IntersectionObserver(([e]) => enc.classList.toggle('compacto', !e.isIntersecting));
    vigiaAnuncio.observe(anuncio);
  } else {
    alScroll = () => enc.classList.toggle('compacto', window.scrollY > (anuncio?.offsetHeight || 40));
    window.addEventListener('scroll', alScroll, { passive: true }); alScroll();
  }
  const medir = () => document.documentElement.style.setProperty('--alto-enc', `${Math.round(enc.getBoundingClientRect().height)}px`);
  if ('ResizeObserver' in window) { vigiaAlto = new ResizeObserver(medir); vigiaAlto.observe(enc); }
  medir();
}

/** Al cambiar de pantalla se cierran el menú del celular y el menú de la cuenta. */
function cerrarMenus() {
  const menu = $('#nav-principal'), btn = $('#btn-menu');
  if (menu?.classList.contains('abierto')) { menu.classList.remove('abierto'); $('#buscar-form')?.classList.remove('abierto'); btn?.setAttribute('aria-expanded', 'false'); }
  $('#menu-cuenta')?.classList.add('oculto'); $('#btn-cuenta')?.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', (e) => { const m = $('#menu-cuenta'); if (m && !e.target.closest('.menu-cuenta')) m.classList.add('oculto'); });

function pintarPie() {
  const t = estado.tienda, r = t.redes;
  const redes = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['x', 'X'], ['whatsapp', 'WhatsApp']]
    .map(([k, n]) => `<a href="${esc(r[k])}" target="_blank" rel="noopener noreferrer" aria-label="${n} de ${esc(t.nombre)}">${icoRed(k)}</a>`).join('');
  $('#pie').innerHTML = `<footer class="pie"><div class="pie-grid">
    <div>${logo({ blanco: true }).replace('class="logo"', 'class="logo" style="color:#fff"')}<p style="margin-top:1rem">${esc(t.eslogan)}</p></div>
    <div><h4>Tienda</h4><ul>${t.categorias.map((c) => `<li><a href="/catalogo?categoria=${c.id}" data-link>${esc(c.nombre)}</a></li>`).join('')}</ul></div>
    <div><h4>Políticas</h4><ul><li><a href="/politicas/devoluciones" data-link>Devoluciones</a></li><li><a href="/politicas/envios" data-link>Envíos</a></li><li><a href="/politicas/privacidad" data-link>Aviso de privacidad</a></li><li><a href="/politicas/terminos" data-link>Términos y condiciones</a></li></ul></div>
    <div><h4>Contacto</h4><ul><li><a href="mailto:${esc(t.correo)}">${esc(t.correo)}</a></li><li><a href="${esc(r.whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp: ${esc(t.telefono)}</a></li><li>Horario: ${esc(t.horario)}</li><li><a href="/contacto" data-link>Más formas de contacto</a></li></ul></div>
  </div>
  <div class="pie-medio"><div class="redes">${redes}</div>
    <div class="tarjetas"><span class="marca-tarjeta">VISA</span><span class="marca-tarjeta mc">MasterCard</span><span class="marca-tarjeta am">AMEX</span><span>Pagos con tarjeta de crédito o débito</span></div></div>
  <p class="copy">© ${new Date().getFullYear()} ${esc(t.nombre)}</p></footer>`;
}

// ------------------------------------------------------------------ Pintado de rutas
async function pintarRuta() {
  const yo = ++numRender;
  const ruta = location.pathname.replace(/\/+$/, '') || '/';
  const query = new URLSearchParams(location.search);
  let modulo = 'info', param = 'error404', grupos = [];
  for (const [re, mod, extra] of RUTAS) {
    const m = re.exec(ruta);
    if (m) { modulo = mod; grupos = m.slice(1); param = extra; break; }
  }
  const esAdmin = modulo === 'admin';
  document.body.classList.toggle('modo-admin', esAdmin);
  // El catálogo tiene su propio buscador (con filtros y resultados al teclear): se oculta el del encabezado para no duplicarlo.
  document.body.classList.toggle('en-catalogo', modulo === 'catalogo');
  if (esAdmin) {
    if (!$('#admin-raiz')) app.innerHTML = '<div id="admin-raiz"></div>';
  } else if (!$('#contenido')) {
    app.innerHTML = '<div id="encabezado"></div><main id="contenido" tabindex="-1"></main><div id="pie"></div>';
    pintarEncabezado(); pintarPie();
  } else { // al salir del catálogo el buscador del encabezado vuelve vacío
    const inp = $('#buscar-form input'); if (inp) inp.value = '';
    cerrarMenus();
  }
  const contenedor = esAdmin ? $('#admin-raiz') : $('#contenido');
  contenedor.innerHTML = '<div class="cargando"><div class="spinner"></div>Cargando…</div>';
  try {
    const vista = await import(`./vistas/${modulo}.js`);
    if (yo !== numRender) return;
    const ctx = {
      contenedor, params: grupos, query, tipo: param, ruta, navegar, requiereSesion, refrescarSesion, refrescarCarrito,
      titulo: (t) => { document.title = t ? `${t} — ${estado.tienda.nombre}` : `${estado.tienda.nombre} — ${estado.tienda.eslogan}`; },
      sigue: () => yo === numRender, // false si el usuario ya navegó a otra pantalla
    };
    await vista.render(ctx);
    try { sessionStorage.removeItem('recarga-version'); } catch { /* sin almacenamiento */ }
  } catch (e) {
    if (yo !== numRender) return;
    // Si se publicó una versión nueva mientras la página estaba abierta, el navegador puede mezclar archivos
    // viejos y nuevos. En ese caso se recarga UNA vez para traer la versión completa.
    if (/dynamically imported module|does not provide an export|Importing a module script failed|error loading dynamically/i.test(e?.message || '')) {
      let ya = true; try { ya = sessionStorage.getItem('recarga-version') === '1'; if (!ya) sessionStorage.setItem('recarga-version', '1'); } catch { /* sin almacenamiento */ }
      if (!ya) { location.reload(); return; }
    }
    console.error(e);
    contenedor.innerHTML = `<div class="contenedor vacio"><h2>No pudimos cargar esta pantalla</h2><p>${esc(e.message || 'Inténtalo de nuevo en unos momentos.')}</p><a class="btn" href="/" data-link>Ir al inicio</a></div>`;
  }
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView(); else window.scrollTo(0, 0);
}

// Enlaces internos sin recargar la página
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank' || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !a.hasAttribute('data-link')) return;
  e.preventDefault();
  navegar(url.pathname + url.search + url.hash);
});
window.addEventListener('popstate', pintarRuta);

// ------------------------------------------------------------------ Arranque
(async () => {
  try {
    const [tienda, sesion] = await Promise.all([get('/tienda'), get('/sesion')]);
    estado.tienda = tienda; estado.usuario = sesion.usuario; estado.piezas = sesion.piezas;
    await pintarRuta();
  } catch (e) {
    app.innerHTML = `<div class="contenedor vacio"><h2>La tienda no está disponible por el momento</h2><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Reintentar</button></div>`;
  }
})();
