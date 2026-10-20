import { estado, esc, $, $$, ico, get, precio, tarjetaProducto, activarTarjetas, errorToast } from '../util.js';

export async function render(ctx) {
  const t = estado.tienda;
  const q = Object.fromEntries(ctx.query.entries());
  const cats = new Set(String(q.categoria || '').split(',').filter(Boolean));
  let rango = null;                       // {min,max} del catálogo, se conoce con la primera respuesta
  let vista = q.vista === 'lista' ? 'lista' : 'cuadricula';
  let temporizador;

  const titulo = () => (cats.size === 1 ? t.categorias.find((c) => String(c.id) === [...cats][0])?.nombre || 'Mochilas' : q.q ? `Resultados para "${q.q}"` : 'Todas las mochilas');
  ctx.titulo(titulo());

  ctx.contenedor.innerHTML = `<div class="contenedor seccion">
    <h1 id="cat-titulo">${esc(titulo())}</h1>
    <div class="cat-layout">
      <aside class="filtros" aria-label="Filtros">
        <h3>Categoría</h3>
        ${t.categorias.map((c) => `<label class="chk"><input type="checkbox" name="cat" value="${c.id}" ${cats.has(String(c.id)) ? 'checked' : ''}> ${esc(c.nombre)}</label>`).join('')}
        <hr><h3>Rango de precio</h3>
        <div class="rango" id="rango"><div class="pista"></div><div class="tramo" id="tramo"></div>
          <input type="range" id="r-min" aria-label="Precio mínimo" min="0" max="1000" value="0"><input type="range" id="r-max" aria-label="Precio máximo" min="0" max="1000" value="1000"></div>
        <div class="rango-vals"><span id="v-min">$0</span><span id="v-max">$0</span></div>
        <hr><h3>Disponibilidad</h3>
        <label class="chk"><input type="checkbox" id="f-disp" ${q.disponibles === '1' ? 'checked' : ''}> Solo disponibles</label>
      </aside>
      <section aria-live="polite">
        <div class="barra-cat">
          <div class="buscar">${ico('buscar')}<input class="campo-ico" type="search" id="f-q" placeholder="Buscar mochilas..." aria-label="Buscar mochilas por nombre" value="${esc(q.q || '')}"></div>
          <div style="display:flex;gap:.7rem;align-items:center;flex-wrap:wrap"><label for="f-orden">Ordenar por:</label>
            <select id="f-orden" class="campo-ico" style="width:auto"><option value="">Relevancia</option><option value="precio_asc">Precio: Bajo a Alto</option><option value="precio_desc">Precio: Alto a Bajo</option><option value="nuevo">Más Nuevo</option></select>
            <div class="vista-btns" role="group" aria-label="Tipo de vista"><button data-vista="cuadricula" aria-label="Vista en cuadrícula">${ico('rejilla')}</button><button data-vista="lista" aria-label="Vista en lista">${ico('lista')}</button></div></div>
        </div>
        <div id="resultado"><div class="cargando"><div class="spinner"></div>Cargando mochilas…</div></div>
        <nav class="paginacion" id="paginacion" aria-label="Paginación"></nav>
      </section>
    </div></div>`;
  $('#f-orden').value = q.orden || '';
  const marcarVista = () => $$('[data-vista]').forEach((b) => b.classList.toggle('on', b.dataset.vista === vista));
  marcarVista();

  const sMin = $('#r-min'), sMax = $('#r-max');
  const pintarRango = () => {
    let a = Number(sMin.value), b = Number(sMax.value);
    if (a > b) [a, b] = [b, a];
    const span = Number(sMin.max) - Number(sMin.min) || 1;
    $('#tramo').style.left = `${((a - sMin.min) / span) * 100}%`; $('#tramo').style.right = `${100 - ((b - sMin.min) / span) * 100}%`;
    $('#v-min').textContent = precio(a); $('#v-max').textContent = precio(b);
    return [a, b];
  };

  const consulta = (pagina) => {
    const p = new URLSearchParams();
    if (q.q) p.set('q', q.q);
    if (cats.size) p.set('categoria', [...cats].join(','));
    if (rango && q.min !== undefined) p.set('min', q.min);
    if (rango && q.max !== undefined) p.set('max', q.max);
    if ($('#f-disp').checked) p.set('disponibles', '1');
    if (q.orden) p.set('orden', q.orden);
    if (vista === 'lista') p.set('vista', 'lista');
    if (pagina > 1) p.set('pagina', pagina);
    return p;
  };

  async function cargar(pagina = 1) {
    const p = consulta(pagina);
    history.replaceState({}, '', location.pathname + (p.toString() ? `?${p}` : ''));
    $('#cat-titulo').textContent = titulo(); ctx.titulo(titulo());
    const api = new URLSearchParams(p); api.delete('vista');
    let d;
    try { d = await get(`/productos?${api}`); } catch (e) { errorToast(e); return; }
    if (!ctx.sigue()) return;
    if (!rango) { // primera carga: se ajusta el control de precio al catálogo real
      rango = d.rango;
      for (const s of [sMin, sMax]) { s.min = rango.min; s.max = rango.max; }
      sMin.value = q.min ?? rango.min; sMax.value = q.max ?? rango.max; pintarRango();
    }
    const res = $('#resultado');
    res.innerHTML = d.productos.length
      ? `<div class="grid-prod ${vista === 'lista' ? 'lista' : ''}">${d.productos.map(tarjetaProducto).join('')}</div>`
      : `<div class="vacio"><h3>No encontramos mochilas con esos filtros</h3><p>Prueba con otro nombre, otra categoría o amplía el rango de precio.</p><button class="btn sec" id="limpiar">Limpiar filtros</button></div>`;
    $('#limpiar')?.addEventListener('click', () => ctx.navegar('/catalogo'));
    const pg = $('#paginacion');
    const nums = Array.from({ length: d.paginas }, (_, i) => i + 1);
    pg.innerHTML = d.paginas > 1
      ? nums.map((n) => `<button data-pag="${n}" class="${n === d.pagina ? 'on' : ''}" aria-label="Página ${n}" ${n === d.pagina ? 'aria-current="page"' : ''}>${n}</button>`).join('') + (d.pagina < d.paginas ? `<button data-pag="${d.pagina + 1}">Siguiente ›</button>` : '')
      : '';
  }

  const aplicar = (r = true) => { if (r) cargar(1); };
  $$('[name=cat]').forEach((c) => c.addEventListener('change', () => { cats[c.checked ? 'add' : 'delete'](c.value); aplicar(); }));
  $('#f-disp').addEventListener('change', () => aplicar());
  $('#f-orden').addEventListener('change', (e) => { q.orden = e.target.value; aplicar(); });
  $('#f-q').addEventListener('input', (e) => { clearTimeout(temporizador); temporizador = setTimeout(() => { q.q = e.target.value.trim(); aplicar(); }, 350); });
  for (const s of [sMin, sMax]) {
    s.addEventListener('input', pintarRango);
    s.addEventListener('change', () => { const [a, b] = pintarRango(); q.min = a; q.max = b; aplicar(); });
  }
  $$('[data-vista]').forEach((b) => b.addEventListener('click', () => { vista = b.dataset.vista; marcarVista(); $('#resultado .grid-prod')?.classList.toggle('lista', vista === 'lista'); history.replaceState({}, '', location.pathname + (consulta(1).toString() ? `?${consulta(1)}` : '')); }));
  $('#paginacion').addEventListener('click', (e) => { const b = e.target.closest('[data-pag]'); if (b) { cargar(Number(b.dataset.pag)); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  activarTarjetas($('#resultado'), { navegar: ctx.navegar, refrescarCarrito: ctx.refrescarCarrito });
  await cargar(Number(q.pagina) || 1);
}
