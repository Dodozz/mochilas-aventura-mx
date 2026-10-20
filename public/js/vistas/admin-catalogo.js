import { esc, $, $$, ico, get, post, put, del, moneda, fechaHora, toast, errorToast, modal, confirmar, marcarErrores, errorCampo } from '../util.js';
import { validarPrecio, validarMedida, validarEnteroNoNegativo, validarTexto } from '../validators.js';

const pill = (clase, texto) => `<span class="pill p-${clase}">${esc(texto)}</span>`;

// ====================================================================== Catálogo (alta, edición, ocultar, destacar)
export async function catalogo(aux) {
  const { main } = aux;
  const d = await get('/admin/productos');
  const cats = d.categorias;
  let enEdicion = null, fotos = [], colores = [];

  main.innerHTML = `<h1>Catálogo</h1><div class="cat-admin"><section class="tarjeta"><div class="tabla-wrap"><table class="tabla"><thead><tr><th>Foto</th><th>Código</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Existencias</th><th>Estatus</th><th>Destacada</th><th></th></tr></thead><tbody>
    ${d.productos.map((p) => `<tr><td><img class="mini" src="${esc(p.imagen)}" alt=""></td><td>${esc(p.codigo)}</td><td><b>${esc(p.nombre)}</b></td><td>${esc(p.categoria)}</td><td>${moneda(p.precio)}</td>
      <td style="${p.existencias <= p.umbral ? 'color:var(--rojo);font-weight:800' : ''}">${p.existencias}</td>
      <td><button class="pill p-${p.estatus}" style="border:0;cursor:pointer" data-estatus="${p.id}" title="Cambiar estatus">${p.estatus === 'activo' ? 'Activo' : 'Oculto'}</button></td>
      <td><button class="estrella-btn ${p.destacada ? 'on' : ''}" data-dest="${p.id}" aria-label="${p.destacada ? 'Quitar de destacadas' : 'Marcar como destacada'}" aria-pressed="${p.destacada}">${ico('estrella')}</button></td>
      <td style="white-space:nowrap"><button class="btn crema chico" data-edit="${p.id}">${ico('editar')} Editar</button> <button class="btn crema chico" data-borrar="${p.id}" aria-label="Eliminar ${esc(p.nombre)}">${ico('basura')}</button></td></tr>`).join('')}</tbody></table></div></section>
    <aside class="panel-form" aria-label="Formulario de mochila"><h3 id="t-form">Agregar mochila</h3><form id="f-prod" novalidate>
      <div class="campo"><label for="codigo">Código</label><input id="codigo" name="codigo" maxlength="20"></div>
      <div class="campo"><label for="nombre">Nombre</label><input id="nombre" name="nombre" maxlength="80"></div>
      <div class="campo"><label for="categoria_id">Categoría</label><select id="categoria_id" name="categoria_id"><option value="">Categoría</option>${cats.map((c) => `<option value="${c.id}">${esc(c.nombre)}${c.estatus === 'oculta' ? ' (oculta)' : ''}</option>`).join('')}</select></div>
      <div class="campo"><label for="coleccion">Colección</label><input id="coleccion" name="coleccion" maxlength="60"></div>
      <div class="campo"><label for="descripcion">Descripción</label><textarea id="descripcion" name="descripcion" maxlength="1000"></textarea></div>
      <div class="campo"><label for="material">Material</label><input id="material" name="material" maxlength="60"></div>
      <div class="campo"><span style="font-weight:600;font-size:.95rem">Dimensiones (cm)</span><div class="fila-campos tres mantener" style="gap:.4rem"><div class="campo" style="margin:0"><input name="largo" inputmode="decimal" placeholder="Largo" aria-label="Largo en cm"></div><div class="campo" style="margin:0"><input name="alto" inputmode="decimal" placeholder="Alto" aria-label="Alto en cm"></div><div class="campo" style="margin:0"><input name="ancho" inputmode="decimal" placeholder="Ancho" aria-label="Ancho en cm"></div></div></div>
      <div class="campo"><span style="font-weight:600;font-size:.95rem">Colores</span><input type="hidden" name="colores"><div class="color-fila" id="lista-col"></div>
        <div style="display:flex;gap:.4rem;margin-top:.3rem"><input id="col-nom" placeholder="Nombre del color" maxlength="30" aria-label="Nombre del color"><input type="color" id="col-hex" value="#2f6fd0" aria-label="Tono del color" style="width:48px;padding:2px"><button type="button" class="btn chico navy" id="col-add">Agregar</button></div></div>
      <div class="fila-campos mantener" style="gap:.5rem"><div class="campo"><label for="precio">Precio (MXN)</label><input id="precio" name="precio" inputmode="decimal" placeholder="$"></div><div class="campo"><label for="existencias">Existencias</label><input id="existencias" name="existencias" inputmode="numeric" value="0"></div></div>
      <div class="campo"><label for="umbral">Umbral de alerta</label><input id="umbral" name="umbral" inputmode="numeric" value="5"></div>
      <div class="campo"><label for="subir">Subir foto (PNG, JPG o WEBP, máx. 2 MB)</label><input id="subir" type="file" accept="image/png,image/jpeg,image/webp" multiple><div class="fotos-prev" id="prev"></div></div>
      <div class="campo"><label for="estatus">Estatus</label><select id="estatus" name="estatus"><option value="activo">Activo</option><option value="oculto">Oculto</option></select></div>
      <label class="chk-linea" style="margin:.2rem 0 .8rem"><input type="checkbox" name="destacada"><span>Destacada</span></label>
      <button class="btn block" type="submit">Guardar</button><button class="btn crema block oculto" type="button" id="cancelar-ed" style="margin-top:.5rem">Cancelar edición</button></form></aside></div>`;

  const form = $('#f-prod');
  const pintarColores = () => {
    $('#lista-col').innerHTML = colores.map((c, i) => `<span class="color-chip"><i style="background:${esc(c.hex)}"></i>${esc(c.nombre)}<button type="button" data-qc="${i}" aria-label="Quitar ${esc(c.nombre)}">×</button></span>`).join('') || '<span class="muted" style="font-size:.85rem">Agrega al menos un color</span>';
    $$('[data-qc]', form).forEach((b) => b.addEventListener('click', () => { colores.splice(Number(b.dataset.qc), 1); pintarColores(); }));
  };
  const pintarFotos = () => {
    $('#prev').innerHTML = fotos.map((u, i) => `<div><img src="${esc(u)}" alt="Foto ${i + 1}"><button type="button" data-qf="${i}" aria-label="Quitar foto ${i + 1}">×</button></div>`).join('');
    $$('[data-qf]', form).forEach((b) => b.addEventListener('click', () => { fotos.splice(Number(b.dataset.qf), 1); pintarFotos(); }));
  };
  const limpiarForm = () => {
    enEdicion = null; form.reset(); fotos = []; colores = []; pintarColores(); pintarFotos(); marcarErrores(form, {});
    $('#t-form').textContent = 'Agregar mochila'; $('#cancelar-ed').classList.add('oculto'); form.elements.existencias.value = 0; form.elements.umbral.value = 5;
  };
  pintarColores();
  $('#col-add').addEventListener('click', () => {
    const n = $('#col-nom').value.trim();
    if (!n) return toast('Escribe el nombre del color.', 'error');
    if (colores.some((c) => c.nombre.toLowerCase() === n.toLowerCase())) return toast('Ese color ya está en la lista.', 'error');
    colores.push({ nombre: n, hex: $('#col-hex').value }); $('#col-nom').value = ''; pintarColores(); errorCampo(form.elements.colores.closest('.campo'), '');
  });
  $('#subir').addEventListener('change', async (e) => {
    for (const f of e.target.files) {
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast(`"${f.name}" no es PNG, JPG ni WEBP.`, 'error'); continue; }
      if (f.size > 2 * 1024 * 1024) { toast(`"${f.name}" pesa más de 2 MB.`, 'error'); continue; }
      const datos = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      try { fotos.push((await post('/admin/fotos', { datos })).url); pintarFotos(); } catch (er) { errorToast(er); }
    }
    e.target.value = '';
  });
  $('#cancelar-ed').addEventListener('click', limpiarForm);

  $$('[data-edit]', main).forEach((b) => b.addEventListener('click', () => {
    const p = d.productos.find((x) => x.id === Number(b.dataset.edit));
    enEdicion = p; limpiarForm(); enEdicion = p;
    for (const k of ['codigo', 'nombre', 'categoria_id', 'coleccion', 'descripcion', 'material', 'largo', 'alto', 'ancho', 'precio', 'existencias', 'umbral', 'estatus']) form.elements[k].value = p[k] ?? '';
    form.elements.destacada.checked = p.destacada; colores = p.colores.map((c) => ({ nombre: c.nombre, hex: c.hex, foto: c.foto })); fotos = [...p.fotos];
    pintarColores(); pintarFotos(); $('#t-form').textContent = `Editar: ${p.nombre}`; $('#cancelar-ed').classList.remove('oculto');
    $('.panel-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); form.elements.codigo.focus();
  }));
  $$('[data-estatus]', main).forEach((b) => b.addEventListener('click', async () => { try { await post(`/admin/productos/${b.dataset.estatus}/estatus`); catalogo(aux); } catch (e) { errorToast(e); } }));
  $$('[data-dest]', main).forEach((b) => b.addEventListener('click', async () => { try { const r = await post(`/admin/productos/${b.dataset.dest}/destacada`); toast(r.destacada ? 'Marcada como destacada.' : 'Quitada de destacadas.'); catalogo(aux); } catch (e) { errorToast(e); } }));
  $$('[data-borrar]', main).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar('Eliminar mochila', 'Si tiene pedidos o movimientos asociados solo se ocultará. ¿Continuar?', 'Eliminar', true))) return;
    try { const r = await del(`/admin/productos/${b.dataset.borrar}`); toast(r.mensaje, 'ok'); catalogo(aux); } catch (e) { errorToast(e); }
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form).entries());
    const err = {};
    if (!v.codigo.trim()) err.codigo = 'El código es obligatorio.';
    const n = validarTexto(v.nombre, 'El nombre', { max: 80 }); if (n) err.nombre = n;
    if (!v.categoria_id) err.categoria_id = 'Elige una categoría.';
    const de = validarTexto(v.descripcion, 'La descripción', { max: 1000 }); if (de) err.descripcion = de;
    const m = validarTexto(v.material, 'El material'); if (m) err.material = m;
    for (const k of ['largo', 'alto', 'ancho']) { const r = validarMedida(v[k], `El ${k}`); if (r) err[k] = r; }
    if (!colores.length) err.colores = 'Agrega al menos un color.';
    const pr = validarPrecio(v.precio); if (pr) err.precio = pr;
    const ex = validarEnteroNoNegativo(v.existencias, 'Las existencias'); if (ex) err.existencias = ex;
    const um = validarEnteroNoNegativo(v.umbral, 'El umbral de alerta'); if (um) err.umbral = um;
    if (marcarErrores(form, err)) return;
    const cuerpo = { ...v, destacada: form.elements.destacada.checked, colores, fotos, forma: enEdicion?.forma };
    try {
      await (enEdicion ? put(`/admin/productos/${enEdicion.id}`, cuerpo) : post('/admin/productos', cuerpo));
      toast(enEdicion ? 'Mochila actualizada.' : 'Mochila agregada al catálogo.', 'ok'); catalogo(aux);
    } catch (er) { if (er.datos.errores) marcarErrores(form, er.datos.errores); errorToast(er); }
  });
}

// ====================================================================== Categorías (RF-18 CA2)
export async function panelCategorias(cont) {
  const lista = await get('/admin/categorias');
  cont.innerHTML = `<section class="tarjeta" aria-labelledby="h-cats"><h2 id="h-cats">Categorías</h2><div class="tabla-wrap"><table class="tabla"><thead><tr><th>Categoría</th><th>Mochilas</th><th>Estatus</th><th></th></tr></thead><tbody>
    ${lista.map((c) => `<tr><td><b>${esc(c.nombre)}</b></td><td>${c.productos}</td><td>${pill(c.estatus, c.estatus === 'activa' ? 'Activa' : 'Oculta')}</td>
      <td style="white-space:nowrap"><button class="btn crema chico" data-ed="${c.id}">${ico('editar')} Editar</button> <button class="btn crema chico" data-del="${c.id}" aria-label="Eliminar ${esc(c.nombre)}">${ico('basura')}</button></td></tr>`).join('')}</tbody></table></div>
    <button class="btn sec block" id="cat-nueva" style="margin-top:1rem">+ Agregar categoría</button></section>`;
  const abrir = (c) => {
    const m = modal(`<h2>${c ? 'Editar' : 'Agregar'} categoría</h2><form id="f-cat" novalidate><div class="campo"><label for="cn">Nombre</label><input id="cn" name="nombre" maxlength="40" value="${esc(c?.nombre || '')}"></div>
      <div class="campo"><label for="ce">Estatus</label><select id="ce" name="estatus"><option value="activa" ${c?.estatus !== 'oculta' ? 'selected' : ''}>Activa</option><option value="oculta" ${c?.estatus === 'oculta' ? 'selected' : ''}>Oculta</option></select></div>
      <div class="acc-modal"><button type="button" class="btn crema" data-cerrar>Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`);
    const f = $('#f-cat', m.raiz);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = validarTexto(f.elements.nombre.value, 'El nombre de la categoría', { max: 40 }); if (err) return marcarErrores(f, { nombre: err });
      try { await (c ? put(`/admin/categorias/${c.id}`, { nombre: f.elements.nombre.value, estatus: f.elements.estatus.value }) : post('/admin/categorias', { nombre: f.elements.nombre.value, estatus: f.elements.estatus.value })); m.cerrar(); toast('Categoría guardada.', 'ok'); panelCategorias(cont); }
      catch (er) { if (er.datos.errores) marcarErrores(f, er.datos.errores); errorToast(er); }
    });
  };
  $('#cat-nueva', cont).addEventListener('click', () => abrir(null));
  $$('[data-ed]', cont).forEach((b) => b.addEventListener('click', () => abrir(lista.find((x) => x.id === Number(b.dataset.ed)))));
  $$('[data-del]', cont).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar('Eliminar categoría', 'Si tiene mochilas asociadas solo se ocultará. ¿Continuar?', 'Eliminar', true))) return;
    try { const r = await del(`/admin/categorias/${b.dataset.del}`); toast(r.mensaje, 'ok'); panelCategorias(cont); } catch (e) { errorToast(e); }
  }));
}
export async function categorias({ main }) { main.innerHTML = '<h1>Categorías</h1><div id="cat-panel"></div>'; await panelCategorias($('#cat-panel')); }

// ====================================================================== Inventario (RF-18 CA4/CA7, RNF-4 CA4)
export async function inventario(aux) {
  const { main, redibujarBadges } = aux;
  const d = await get('/admin/inventario');
  const TIPO = { venta: 'Venta', entrada: 'Entrada', ajuste: 'Ajuste', devolucion: 'Devolución', cancelacion: 'Cancelación' };
  main.innerHTML = `<h1>Inventario</h1><div class="dos-adm">
    <section class="tarjeta" aria-labelledby="h-al"><h2 id="h-al">Alertas de inventario</h2>${d.alertas.map((a) => `<div class="alerta-inv"><div><b style="font-size:1.15rem">${esc(a.nombre)}</b><br>${a.existencias} ${a.existencias === 1 ? 'pieza' : 'piezas'} · umbral ${a.umbral}</div>${a.agotado ? pill('cancelado', 'agotado') : pill('preparando', 'pocas piezas')}</div>`).join('') || '<p class="muted">Todo en orden: ningún modelo está por debajo de su umbral.</p>'}</section>
    <section class="tarjeta" aria-labelledby="h-en"><h2 id="h-en">Registrar entrada de inventario</h2><form id="f-ent" novalidate>
      <div class="campo"><label for="mod">Modelo</label><select id="mod" name="producto_id">${d.productos.map((p) => `<option value="${p.id}">${esc(p.nombre)} (${esc(p.codigo)}) — ${p.existencias} pzas</option>`).join('')}</select></div>
      <div class="campo"><label for="cant">Cantidad</label><input id="cant" name="cantidad" inputmode="numeric" placeholder="0"></div><button class="btn block" type="submit">Registrar entrada</button></form></section></div>
    <section class="tarjeta" aria-labelledby="h-mv"><h2 id="h-mv">Movimientos recientes</h2><div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Usuario</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Existencias</th><th>Referencia</th></tr></thead><tbody>
    ${d.movimientos.map((m) => `<tr><td>${fechaHora(m.fecha)}</td><td>${esc(m.usuario)}</td><td>${esc(m.producto)}</td><td>${TIPO[m.tipo]}</td><td style="font-weight:800;color:${m.cantidad < 0 ? 'var(--rojo)' : 'var(--verde)'}">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</td><td>${m.existencias_resultantes}</td><td class="muted">${esc(m.referencia || '')}</td></tr>`).join('')}</tbody></table></div></section>`;
  $('#f-ent').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    const err = validarEnteroNoNegativo(f.elements.cantidad.value, 'La cantidad');
    if (err || Number(f.elements.cantidad.value) < 1) return marcarErrores(f, { cantidad: 'Escribe un número entero de 1 en adelante.' });
    try { const r = await post('/admin/inventario/entradas', { producto_id: Number(f.elements.producto_id.value), cantidad: Number(f.elements.cantidad.value) }); toast(`Entrada registrada: ${r.nombre} ahora tiene ${r.existencias} piezas.`, 'ok'); redibujarBadges(); inventario(aux); }
    catch (er) { if (er.datos.errores) marcarErrores(f, er.datos.errores); errorToast(er); }
  });
}
