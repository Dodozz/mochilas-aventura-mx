import { esc, $, $$, ico, get, errorCampo, marcarErrores } from './util.js';
import { validarDireccion } from './validators.js';

let cacheEstados = null;
export const estados = async () => (cacheEstados ||= await get('/geografia/estados'));

/** Formulario de dirección de entrega (RF-7 CA1). El estado y el municipio salen de listas guardadas en la BD. */
export function formDireccion(v = {}, { conAlias = false, p = '' } = {}) {
  return `
    ${conAlias ? `<div class="campo"><label for="${p}alias">Nombre de la dirección</label><input id="${p}alias" name="alias" maxlength="30" placeholder="Casa, Oficina…" value="${esc(v.alias || '')}"></div>` : ''}
    <div class="campo"><label for="${p}pais">País</label><div class="input-ojo"><input id="${p}pais" value="México" readonly aria-readonly="true"><span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--muted)">${ico('candado')}</span></div></div>
    <div class="campo"><label for="${p}estado_id">Estado *</label><select id="${p}estado_id" name="estado_id" required><option value="">Selecciona un estado</option></select></div>
    <div class="campo"><label for="${p}municipio_id">Municipio / Alcaldía *</label><select id="${p}municipio_id" name="municipio_id" required disabled><option value="">Primero elige un estado</option></select></div>
    <div class="campo"><label for="${p}calle">Calle *</label><input id="${p}calle" name="calle" maxlength="120" autocomplete="address-line1" value="${esc(v.calle || '')}"></div>
    <div class="campo"><label for="${p}colonia">Colonia *</label><input id="${p}colonia" name="colonia" maxlength="120" autocomplete="address-line2" value="${esc(v.colonia || '')}"></div>
    <div class="campo"><label for="${p}cp">Código postal *</label><input id="${p}cp" name="cp" inputmode="numeric" maxlength="5" autocomplete="postal-code" value="${esc(v.cp || '')}"><span class="nota">5 dígitos</span></div>
    <div class="fila-campos mantener"><div class="campo"><label for="${p}num_ext">Número exterior</label><input id="${p}num_ext" name="num_ext" maxlength="20" value="${esc(v.num_ext || '')}"></div>
      <div class="campo"><label for="${p}num_int">Número interior (opcional)</label><input id="${p}num_int" name="num_int" maxlength="20" value="${esc(v.num_int || '')}"></div></div>
    <div class="campo"><label for="${p}referencias">Referencias de entrega (opcional)</label><textarea id="${p}referencias" name="referencias" maxlength="200" placeholder="Ej. casa de portón negro, entre dos calles">${esc(v.referencias || '')}</textarea><span class="contador">${(v.referencias || '').length}/200</span></div>
    <p class="muted" style="font-size:.85rem;margin:0 0 .6rem">* Campos obligatorios</p>`;
}

/** Carga estados/municipios y deja la validación por campo. `valores` = {estado_id, municipio_id} iniciales. */
export async function activarDireccion(form, valores = {}, { alCambiarEstado } = {}) {
  const sEdo = $('[name=estado_id]', form), sMun = $('[name=municipio_id]', form);
  const lista = await estados();
  sEdo.innerHTML = '<option value="">Selecciona un estado</option>' + lista.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('');
  const cargarMunicipios = async (idEdo, sel) => {
    if (!idEdo) { sMun.innerHTML = '<option value="">Primero elige un estado</option>'; sMun.disabled = true; return; }
    sMun.disabled = true; sMun.innerHTML = '<option value="">Cargando…</option>';
    const muns = await get(`/geografia/estados/${idEdo}/municipios`);
    sMun.innerHTML = '<option value="">Selecciona un municipio</option>' + muns.map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('');
    sMun.disabled = false; if (sel) sMun.value = sel;
  };
  sEdo.addEventListener('change', async () => { await cargarMunicipios(sEdo.value); errorCampo(sEdo.closest('.campo'), ''); alCambiarEstado?.(sEdo.value); });
  if (valores.estado_id) { sEdo.value = valores.estado_id; await cargarMunicipios(valores.estado_id, valores.municipio_id); }
  const ref = $('[name=referencias]', form);
  ref.addEventListener('input', () => { ref.parentElement.querySelector('.contador').textContent = `${ref.value.length}/200`; });
  $('[name=cp]', form).addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); });
  // Validación por campo al salir de él
  for (const n of ['estado_id', 'municipio_id', 'calle', 'colonia', 'cp']) {
    const el = $(`[name=${n}]`, form);
    el.addEventListener('blur', () => { const e = validarDireccion(leerDireccion(form)); errorCampo(el.closest('.campo'), e[n] || ''); });
  }
}

export const leerDireccion = (form) => {
  const d = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
  return { alias: d.alias, estado_id: d.estado_id, municipio_id: d.municipio_id, calle: d.calle, colonia: d.colonia, cp: d.cp, num_ext: d.num_ext, num_int: d.num_int, referencias: d.referencias };
};
/** Marca los errores junto a cada campo; regresa true si hay errores. */
export const validarFormDireccion = (form) => marcarErrores(form, validarDireccion(leerDireccion(form)));

export const textoDireccion = (d) =>
  `${esc(d.calle)}${d.num_ext ? ' ' + esc(d.num_ext) : ''}${d.num_int ? ', Int. ' + esc(d.num_int) : ''}, Col. ${esc(d.colonia)}, ${esc(d.municipio)}, ${esc(d.estado)}, CP ${esc(d.cp)}`;
