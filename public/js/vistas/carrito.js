import { estado, esc, $, $$, ico, get, put, del, moneda, precio, comboCantidad, activarCombos, toast, errorToast } from '../util.js';

export async function render(ctx) {
  ctx.titulo('Tu carrito');
  let c = await get('/carrito');
  if (!ctx.sigue()) return;
  let avisos = c.avisos;

  const pintar = () => {
    estado.piezas = c.piezas; ctx.refrescarCarrito();
    const vacio = c.lineas.length === 0;
    const falta = c.falta_envio_gratis;
    const pct = vacio ? 0 : Math.min(100, Math.round((c.subtotal / c.envio_gratis_desde) * 100));
    ctx.contenedor.innerHTML = `<div class="contenedor seccion"><h1>Tu carrito</h1>
      ${avisos.map((a) => `<div class="alerta info" role="status">${ico('info')}<span>${esc(a)}</span></div>`).join('')}
      <div class="envio-barra" role="status"><div class="relleno" style="width:${vacio ? 0 : Math.max(pct, 12)}%"></div>
        <div class="texto">${ico('camion')}<span>${falta > 0 ? `Compra <b>${moneda(falta)}</b> más para disfrutar <b>envío gratis</b>` : '¡Genial! Tu compra ya tiene <b>envío gratis</b>'}</span></div></div>
      ${vacio ? `<div class="tarjeta vacio"><h3>Tu carrito está vacío</h3><p>Agrega una mochila para comenzar tu aventura.</p><a class="btn" href="/catalogo" data-link>Ver el catálogo</a><p style="margin-top:1rem" class="muted">Total: ${moneda(0)}</p></div>` : `
      <div class="carrito-grid"><div id="lineas">${c.lineas.map((l) => `
        <article class="tarjeta linea" data-id="${l.id}">
          <a class="foto" href="/producto/${l.producto_id}" data-link><img src="${esc(l.imagen)}" alt="${esc(l.nombre)}">${l.pocas_piezas ? `<span class="etq">¡Solo quedan ${l.existencias} ${l.existencias === 1 ? 'pieza' : 'piezas'}!</span>` : ''}</a>
          <div><h3><a href="/producto/${l.producto_id}" data-link style="text-decoration:none">${esc(l.nombre)}</a></h3>
            <p class="muted" style="margin:0">Color: ${esc(l.color)} · ${precio(l.precio)} c/u · <span>${esc(l.codigo)}</span></p>
            <div class="fila-inf"><div><label class="muted" for="c-${l.id}" style="font-size:.85rem;display:block">Cantidad</label>${comboCantidad({ id: `c-${l.id}`, valor: l.cantidad, max: l.max, motivoMax: l.max < c.limite_modelo ? `Solo hay ${l.existencias} ${l.existencias === 1 ? 'pieza disponible' : 'piezas disponibles'} de este modelo.` : `Puedes comprar máximo ${c.limite_modelo} piezas por modelo.` })}</div>
              <div><span class="muted" style="font-size:.85rem;display:block">Subtotal</span><b style="font-size:1.6rem">${precio(l.subtotal)}</b></div>
              <button class="enlace-btn" style="color:var(--navy);text-decoration:none;display:inline-flex;gap:.4rem;align-items:center;margin-left:auto" data-eliminar="${l.id}">${ico('basura')} Eliminar</button></div></div></article>`).join('')}</div>
        <aside class="tarjeta resumen" aria-label="Resumen del pedido"><h3>Resumen del pedido</h3>
          <div class="fila"><span>Subtotal (IVA incluido)</span><b>${moneda(c.subtotal)}</b></div>
          <div class="fila"><span>Envío</span><span class="muted">Se calcula al pagar</span></div>
          <div class="fila total"><span>Total <small>(sin envío)</small></span><span>${moneda(c.total)}</span></div>
          <p class="muted" style="font-size:.9rem">Incluye ${moneda(c.iva_incluido)} de IVA</p>
          <button class="btn block" id="btn-comprar">Proceder a la compra</button>
          <p class="centrado muted" style="font-size:.9rem;margin:.8rem 0 0;display:flex;gap:.4rem;justify-content:center;align-items:center">${ico('tarjeta')} Pago solo con tarjeta de crédito o débito</p></aside></div>`}</div>`;

    activarCombos(ctx.contenedor, async (n, combo) => {
      const id = combo.closest('.linea').dataset.id;
      try {
        const r = await put(`/carrito/${id}`, { cantidad: n });
        c = r.carrito; avisos = r.mensaje ? [r.mensaje] : []; pintar();
      } catch (e) { errorToast(e); }
    });
    $$('[data-eliminar]').forEach((b) => b.addEventListener('click', async () => {
      try { await del(`/carrito/${b.dataset.eliminar}`); c = await get('/carrito'); avisos = c.avisos; toast('Quitaste el producto de tu carrito.'); pintar(); } catch (e) { errorToast(e); }
    }));
    $('#btn-comprar')?.addEventListener('click', () => {
      if (!estado.usuario) { toast('Para pagar necesitas una cuenta. Tu carrito se conserva.'); return ctx.navegar('/registro?volver=' + encodeURIComponent('/carrito')); }
      ctx.navegar('/checkout/entrega');
    });
  };
  pintar();
}
