// Utilidades compartidas del frontend
export const estado = { usuario: null, piezas: 0, tienda: null };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** RN-19: pesos mexicanos. $1,234.00 */
export const moneda = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Precio publicado sin decimales cuando es entero ($599) como en los bocetos */
export const precio = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });
export const fecha = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
export const fechaCorta = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' });
export const fechaHora = (iso) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' });

// ------------------------------------------------------------------ Iconos
const P = {
  corazon: '<path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.7 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.4 3.1 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/>',
  carrito: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  flecha_abajo: '<path d="M6 9l6 6 6-6"/>', flecha_der: '<path d="M5 12h14M13 6l6 6-6 6"/>', flecha_izq: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  mas: '<path d="M12 5v14M5 12h14"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  camion: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  basura: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  ojo: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ojo_no: '<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.6A17 17 0 0 0 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  caja: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>', deshacer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  engrane: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  carpeta: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  almacen: '<path d="M3 21V9l9-6 9 6v12M7 21v-7h10v7"/>', correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  telefono: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>', guardar: '<path d="M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7"/>',
  compartir: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  descargar: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', tarjeta: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  rejilla: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  edificio: '<path d="M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3"/>', estrella: '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z"/>',
  campana: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>', pulgar: '<path d="M7 11v9H4v-9zM7 11l4-8c2 0 3 1.5 2.5 3.5L13 10h6a2 2 0 0 1 2 2.4l-1.4 6.2a2 2 0 0 1-2 1.6H7"/>',
};
export const ico = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

const R = {
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.2"/>',
  facebook: '<path d="M14 8.5V7c0-.7.3-1 1-1h2V3h-3c-2.6 0-4 1.6-4 4v1.5H7V12h3v9h4v-9h2.7l.4-3.5z"/>',
  tiktok: '<path d="M16.6 3c.3 2.4 1.7 3.9 4 4.1v3.2c-1.5.1-2.9-.4-4-1.2v6.2c0 3.2-2.6 5.7-5.8 5.7S5 18.5 5 15.3s2.6-5.7 5.8-5.7c.3 0 .6 0 .9.1v3.3a2.5 2.5 0 1 0 1.6 2.3V3z"/>',
  x: '<path d="M17.8 3h3L14.2 10.6 22 21h-6.1l-4.8-6.3L5.6 21h-3l7-8.1L2.2 3h6.2l4.3 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z"/>',
  whatsapp: '<path d="M12 2.5a9.5 9.5 0 0 0-8.1 14.4L2.5 21.5l4.7-1.2A9.5 9.5 0 1 0 12 2.5zm5.3 13.6c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.8.9c.3.1.5.2.5.4.1.2.1.8-.1 1.4z"/>',
};
export const icoRed = (n) => `<svg class="ico rel" viewBox="0 0 24 24" aria-hidden="true">${R[n]}</svg>`;

export const logoIcono = (blanco = false) => `<img src="/img/logo-icono${blanco ? '-blanco' : ''}.png" alt="" width="188" height="220">`;
export const logo = ({ blanco = false } = {}) => `<a class="logo" href="/" data-link aria-label="${esc(estado.tienda?.nombre || 'Mochilas Aventura MX')} — inicio">${logoIcono(blanco)}<span class="txt">Mochilas<br>Aventura <b>MX</b></span></a>`;

export const estrellas = (prom) => {
  const lleno = Math.round(Number(prom) * 2) / 2;
  return `<span class="estrellas" role="img" aria-label="Calificación ${Number(prom).toFixed(1)} de 5">${[1, 2, 3, 4, 5].map((i) => `<svg class="ico ${i <= lleno ? '' : i - 0.5 === lleno ? '' : 'vacia'}" viewBox="0 0 24 24" ${i - 0.5 === lleno ? 'style="clip-path:inset(0 50% 0 0)"' : ''}>${P.estrella}</svg>`).join('')}</span>`;
};

// ------------------------------------------------------------------ API
export class ErrorHTTP extends Error { constructor(estado, datos) { super(datos?.mensaje || 'Error'); this.estado = estado; this.datos = datos || {}; } }

export async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  let res;
  try {
    res = await fetch('/api' + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ErrorHTTP(0, { mensaje: 'No pudimos conectar con la tienda. Revisa tu conexión e inténtalo de nuevo.' });
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErrorHTTP(res.status, datos);
  return datos;
}
export const get = (r) => api(r);
export const post = (r, c = {}) => api(r, { metodo: 'POST', cuerpo: c });
export const put = (r, c = {}) => api(r, { metodo: 'PUT', cuerpo: c });
export const del = (r) => api(r, { metodo: 'DELETE' });

/** Descarga un archivo del servidor (funciona igual en computadora y celular, RF-9 CA2). */
export async function descargar(ruta, nombre) {
  const res = await fetch('/api' + ruta, { credentials: 'same-origin' });
  if (!res.ok) throw new ErrorHTTP(res.status, await res.json().catch(() => ({})));
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ------------------------------------------------------------------ Avisos y modales
export function toast(texto, tipo = '') {
  const t = Object.assign(document.createElement('div'), { className: `toast ${tipo}`, textContent: texto });
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 6500 : 4200);
}
export const errorToast = (e) => toast(e?.message || 'Ocurrió un error inesperado.', 'error');

export function modal(html, { alCerrar } = {}) {
  const raiz = $('#modal-raiz');
  raiz.innerHTML = `<div class="modal-fondo" role="dialog" aria-modal="true"><div class="modal">${html}</div></div>`;
  const fondo = raiz.firstElementChild;
  const cerrar = () => { raiz.innerHTML = ''; document.removeEventListener('keydown', esc_); alCerrar?.(); };
  const esc_ = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', esc_);
  fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });
  $$('[data-cerrar]', raiz).forEach((b) => b.addEventListener('click', cerrar));
  const primero = $('input, select, textarea, button', fondo.firstElementChild); primero?.focus();
  return { raiz: fondo.firstElementChild, cerrar };
}
export const confirmar = (titulo, texto, textoBtn = 'Confirmar', peligro = false) =>
  new Promise((res) => {
    let hecho = false;
    const m = modal(`<h2>${esc(titulo)}</h2><p>${esc(texto)}</p><div class="acc-modal"><button class="btn crema" data-cerrar>Cancelar</button><button class="btn ${peligro ? 'peligro' : ''}" id="ok-conf">${esc(textoBtn)}</button></div>`, { alCerrar: () => { if (!hecho) res(false); } });
    $('#ok-conf', m.raiz).addEventListener('click', () => { hecho = true; m.cerrar(); res(true); });
  });

// ------------------------------------------------------------------ Formularios
export function marcarErrores(form, errores = {}, prefijo = '') {
  $$('.campo', form).forEach((c) => { c.classList.remove('con-error'); $('.error', c)?.remove(); });
  let primero = null;
  for (const [k, msg] of Object.entries(errores)) {
    const el = form.querySelector(`[name="${prefijo}${k}"]`);
    if (!el) continue;
    const campo = el.closest('.campo'); if (!campo) continue;
    campo.classList.add('con-error');
    campo.insertAdjacentHTML('beforeend', `<span class="error" role="alert">${esc(msg)}</span>`);
    primero ||= el;
  }
  primero?.focus();
  return !!primero;
}
export function errorCampo(campo, msg) {
  campo.classList.toggle('con-error', !!msg); $('.error', campo)?.remove();
  if (msg) campo.insertAdjacentHTML('beforeend', `<span class="error" role="alert">${esc(msg)}</span>`);
}
export const datosForm = (form) => Object.fromEntries(new FormData(form).entries());

export function ojoPassword(raiz) {
  $$('.input-ojo', raiz).forEach((w) => {
    const i = $('input', w), b = $('button', w);
    b.addEventListener('click', () => { const ver = i.type === 'password'; i.type = ver ? 'text' : 'password'; b.innerHTML = ico(ver ? 'ojo_no' : 'ojo'); b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña'); });
  });
}
export const campoPassword = (name = 'password', etiqueta = 'Contraseña', auto = 'current-password') =>
  `<div class="campo"><label for="f-${name}">${etiqueta}</label><div class="input-ojo"><input id="f-${name}" name="${name}" type="password" autocomplete="${auto}" required><button type="button" aria-label="Mostrar contraseña">${ico('ojo')}</button></div></div>`;

// ------------------------------------------------------------------ Selector de cantidad (RF-5 CA1/CA5)
/** Menú con opciones 1 a 4 que además permite escribir; solo enteros ≥ 1 y nunca más que `max`. */
export function comboCantidad({ id, valor = 1, max = 10, motivoMax = '' }) {
  const opciones = Array.from({ length: Math.min(4, Math.max(max, 1)) }, (_, i) => i + 1);
  return `<div class="combo" data-combo data-max="${max}" data-motivo="${esc(motivoMax)}">
    <input id="${id}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${valor}" aria-label="Cantidad" ${max < 1 ? 'disabled' : ''}>
    <button type="button" aria-label="Ver cantidades" aria-haspopup="listbox">${ico('flecha_abajo')}</button>
    <ul role="listbox" hidden>${opciones.map((n) => `<li role="option" data-v="${n}">${n}</li>`).join('')}</ul></div>`;
}
export function activarCombos(raiz, alCambiar) {
  $$('[data-combo]', raiz).forEach((c) => {
    const input = $('input', c), lista = $('ul', c), boton = $('button', c);
    const max = () => Number(c.dataset.max);
    const normalizar = () => {
      const crudo = input.value.trim();
      let n = Number(crudo.replace(/\D/g, ''));
      let aviso = '';
      if (crudo === '' || n < 1) { n = 1; aviso = 'La cantidad mínima es 1.'; }
      else if (n > max()) { n = max(); aviso = c.dataset.motivo || `El máximo disponible es ${max()}.`; }
      input.value = n;
      if (aviso) toast(aviso);
      return n;
    };
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 3); }); // sin negativos, decimales ni letras
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    input.addEventListener('change', () => { const n = normalizar(); alCambiar?.(n, c); });
    input.addEventListener('blur', () => { if (!/^[1-9]\d*$/.test(input.value) || Number(input.value) > max()) { const n = normalizar(); alCambiar?.(n, c); } });
    boton.addEventListener('click', (e) => { e.stopPropagation(); lista.hidden = !lista.hidden; });
    lista.addEventListener('click', (e) => { const li = e.target.closest('li'); if (!li) return; input.value = li.dataset.v; lista.hidden = true; alCambiar?.(Number(li.dataset.v), c); });
    document.addEventListener('click', (e) => { if (!c.contains(e.target)) lista.hidden = true; });
  });
}
export const valorCombo = (c) => Math.max(1, Math.min(Number($('input', c).value) || 1, Number(c.dataset.max)));

// ------------------------------------------------------------------ Tarjeta de producto (RF-4, RF-8 CA2, RF-12)
export function etiquetaStock(p) {
  if (p.agotado) return '<span class="etq agot">Agotado</span>';
  if (p.pocas_piezas) return `<span class="etq">¡Solo quedan ${p.existencias} ${p.existencias === 1 ? 'pieza' : 'piezas'}!</span>`;
  return '';
}
export function tarjetaProducto(p) {
  const color0 = p.colores[0];
  return `<article class="prod ${p.agotado ? 'agotado' : ''}" data-id="${p.id}">
    <a class="img" href="/producto/${p.id}" data-link aria-label="Ver ${esc(p.nombre)}">
      <img src="${esc(color0?.foto || p.imagen)}" alt="Mochila ${esc(p.nombre)}" loading="lazy" data-foto>
      ${etiquetaStock(p)}
    </a>
    <button class="corazon ${p.favorito ? 'on' : ''}" data-fav="${p.id}" aria-pressed="${p.favorito}" aria-label="${p.favorito ? 'Quitar de favoritos' : 'Guardar en favoritos'}">${ico('corazon')}</button>
    <div class="cuerpo">
      ${p.total_resenas ? `<span>${estrellas(p.promedio)}</span>` : '<span class="muted" style="font-size:.85rem">Sin reseñas aún</span>'}
      <a class="nombre" href="/producto/${p.id}" data-link>${esc(p.nombre)}</a>
      <span class="precio">${precio(p.precio)}</span>
      <div class="puntos" role="group" aria-label="Colores">${p.colores.map((c, i) => `<button type="button" class="punto ${i === 0 ? 'sel' : ''}" style="background:${esc(c.hex)}" data-color="${esc(c.nombre)}" data-foto="${esc(c.foto || '')}" title="${esc(c.nombre)}" aria-label="Color ${esc(c.nombre)}"></button>`).join('')}</div>
      <button class="btn block" data-agregar="${p.id}" ${p.agotado ? 'disabled' : ''}>${p.agotado ? 'Agotado' : `Agregar al carrito ${ico('carrito')}`}</button>
    </div></article>`;
}

/** Eventos de las tarjetas (favorito, color, agregar). `alCambiar` se llama cuando cambian los datos. */
export function activarTarjetas(raiz, { navegar, refrescarCarrito, alCambiarFavorito }) {
  raiz.addEventListener('click', async (e) => {
    const punto = e.target.closest('.punto');
    if (punto) {
      const card = punto.closest('.prod');
      $$('.punto', card).forEach((p) => p.classList.toggle('sel', p === punto));
      if (punto.dataset.foto) $('[data-foto]', card).src = punto.dataset.foto;
      return;
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      if (!estado.usuario) { toast('Inicia sesión para guardar tus favoritos.'); return navegar(`/login?volver=${encodeURIComponent(location.pathname + location.search)}`); }
      try {
        const r = await post(`/favoritos/${fav.dataset.fav}`);
        fav.classList.toggle('on', r.favorito); fav.setAttribute('aria-pressed', r.favorito);
        toast(r.favorito ? 'Guardada en tus favoritos.' : 'Quitada de tus favoritos.');
        alCambiarFavorito?.(Number(fav.dataset.fav), r.favorito);
      } catch (err) { errorToast(err); }
      return;
    }
    const add = e.target.closest('[data-agregar]');
    if (add && !add.disabled) {
      const card = add.closest('.prod');
      const color = $('.punto.sel', card)?.dataset.color;
      try {
        const r = await post('/carrito', { producto_id: Number(add.dataset.agregar), color, cantidad: 1 });
        estado.piezas = r.piezas; refrescarCarrito(); toast(r.mensaje, 'ok');
      } catch (err) { errorToast(err); }
    }
  });
}
