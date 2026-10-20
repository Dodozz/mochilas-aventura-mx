// =====================================================================
// RF-20 — Validación de los datos capturados.
// Este MISMO archivo se usa en la pantalla (navegador) y en el servidor
// (src/validadores.js lo importa), así ambas validaciones coinciden.
// Cada función regresa `null` si el dato es válido, o un mensaje en
// español que indica el formato esperado (RNF-2 CA3 / RF-20 CA5).
// =====================================================================

const RE_NOMBRE = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;
const RE_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export const MSG = {
  password: 'La contraseña debe tener mínimo 8 caracteres, con letras y números',
};

/** Quita espacios extra de los extremos y colapsa espacios repetidos. */
export const limpiar = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

/** RF-20 CA6 — nombre(s) o apellido: 2 a 50, solo letras, espacio, apóstrofo o guion. */
export function validarNombre(valor, etiqueta = 'El nombre') {
  const s = limpiar(valor);
  if (!s) return `${etiqueta} es obligatorio.`;
  if (s.length < 2 || s.length > 50) return `${etiqueta} debe tener entre 2 y 50 caracteres.`;
  if (!RE_NOMBRE.test(s)) {
    return `${etiqueta} solo puede llevar letras, espacios, apóstrofo o guion (sin números ni símbolos).`;
  }
  return null;
}

/** RF-20 CA2 — usuario@dominio.extensión, sin espacios. */
export function validarCorreo(valor) {
  const s = String(valor ?? '');
  if (!s.trim()) return 'El correo es obligatorio.';
  if (/\s/.test(s) || s.length > 254 || !RE_CORREO.test(s)) {
    return 'Escribe un correo válido, por ejemplo usuario@dominio.com (sin espacios).';
  }
  return null;
}

/** RF-20 CA7 — mínimo 8, al menos una letra y un número, sin espacios. */
export function validarPassword(valor) {
  const s = String(valor ?? '');
  if (s.length < 8 || !/[A-Za-z\u00C0-\u024F]/.test(s) || !/\d/.test(s) || /\s/.test(s)) return MSG.password;
  return null;
}

/** Deja solo dígitos (acepta que el usuario escriba "55 1234 5678" o "55-1234-5678"). */
export const soloDigitos = (v) => String(v ?? '').replace(/[\s-]/g, '');

/** RF-20 CA3 — teléfono de 10 dígitos numéricos. */
export function validarTelefono(valor, { obligatorio = false } = {}) {
  const s = soloDigitos(valor);
  if (!s) return obligatorio ? 'El teléfono es obligatorio (10 dígitos).' : null;
  return /^\d{10}$/.test(s) ? null : 'El teléfono debe tener 10 dígitos numéricos.';
}

/** RF-20 CA3 — código postal de 5 dígitos numéricos (solo formato). */
export function validarCP(valor) {
  const s = String(valor ?? '').trim();
  if (!s) return 'El código postal es obligatorio (5 dígitos).';
  return /^\d{5}$/.test(s) ? null : 'El código postal debe tener 5 dígitos numéricos.';
}

const diasDelMes = (anio, mes) => new Date(anio, mes, 0).getDate(); // mes 1-12

/** RF-20 CA1 — RFC de 12 (moral) o 13 (física) caracteres, MAYÚSCULAS y fecha AAMMDD válida. */
export function validarRFC(valor) {
  const s = String(valor ?? '').trim();
  if (!s) return 'El RFC es obligatorio.';
  if (s !== s.toUpperCase()) return 'El RFC debe escribirse en MAYÚSCULAS.';
  const m = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z0-9]{3})$/.exec(s);
  if (!m || (s.length !== 12 && s.length !== 13)) {
    return 'RFC inválido: 12 caracteres (persona moral: 3 letras + fecha AAMMDD + 3 de homoclave) o 13 (persona física: 4 letras + fecha AAMMDD + 3 de homoclave).';
  }
  const aa = Number(m[2]), mm = Number(m[3]), dd = Number(m[4]);
  const anioActual = new Date().getFullYear() % 100;
  const anio = aa <= anioActual ? 2000 + aa : 1900 + aa;
  if (mm < 1 || mm > 12 || dd < 1 || dd > diasDelMes(anio, mm)) {
    return 'El RFC contiene una fecha inválida (AAMMDD).';
  }
  return null;
}

/** RF-20 CA4 — tarjeta de 15 o 16 dígitos. */
export function validarTarjeta(valor) {
  const s = soloDigitos(valor);
  if (!s) return 'El número de tarjeta es obligatorio.';
  return /^\d{15,16}$/.test(s) ? null : 'El número de tarjeta debe tener 15 o 16 dígitos.';
}

/** RF-20 CA4 — vencimiento MM/AA, no anterior al mes actual. */
export function validarVencimiento(valor, hoy = new Date()) {
  const s = String(valor ?? '').trim();
  if (!s) return 'La fecha de vencimiento es obligatoria (MM/AA).';
  const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(s);
  if (!m) return 'Escribe la fecha de vencimiento con el formato MM/AA, por ejemplo 12/28.';
  const anio = 2000 + Number(m[2]), mes = Number(m[1]);
  const a = hoy.getFullYear(), mAct = hoy.getMonth() + 1;
  if (anio < a || (anio === a && mes < mAct)) return 'La tarjeta está vencida: la fecha no puede ser anterior al mes actual.';
  return null;
}

/** RF-20 CA4 — CVV de 3 o 4 dígitos. */
export function validarCVV(valor) {
  const s = String(valor ?? '').trim();
  if (!s) return 'El CVV es obligatorio.';
  return /^\d{3,4}$/.test(s) ? null : 'El CVV debe tener 3 o 4 dígitos.';
}

/** RF-20 CA5 / RN-24 — cantidad: entero de 1 en adelante (sin decimales, 0 ni negativos). */
export function validarCantidad(valor) {
  const n = Number(valor);
  if (valor === '' || valor === null || valor === undefined || !Number.isInteger(n)) return 'La cantidad debe ser un número entero.';
  if (n < 1) return 'La cantidad mínima es 1.';
  return null;
}

/** RF-20 CA5 — entero desde 0 (existencias, umbral). */
export function validarEnteroNoNegativo(valor, etiqueta = 'El valor') {
  const s = String(valor ?? '').trim();
  if (!/^\d+$/.test(s)) return `${etiqueta} debe ser un número entero de 0 en adelante (sin decimales ni negativos).`;
  return null;
}

/** RF-18 CA3 — precio mayor a 0 con máximo 2 decimales. */
export function validarPrecio(valor) {
  const s = String(valor ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return 'El precio debe ser un número mayor a 0 con máximo 2 decimales.';
  return Number(s) > 0 ? null : 'El precio debe ser mayor a 0.';
}

/** RF-18 CA3 — medida (cm) mayor a 0. */
export function validarMedida(valor, etiqueta = 'La medida') {
  const s = String(valor ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s) || Number(s) <= 0) return `${etiqueta} debe ser un número mayor a 0 (en cm).`;
  return null;
}

/** RF-10 CA2 — comentario no vacío y de máximo 500 caracteres. */
export function validarComentario(valor, max = 500) {
  const s = String(valor ?? '').trim();
  if (!s) return 'Escribe tu comentario.';
  if (s.length > max) return `El comentario no puede superar ${max} caracteres.`;
  return null;
}

/** Obligatorio genérico con longitud máxima. */
export function validarTexto(valor, etiqueta, { min = 1, max = 120 } = {}) {
  const s = limpiar(valor);
  if (s.length < min) return `${etiqueta} es obligatorio.`;
  if (s.length > max) return `${etiqueta} no puede superar ${max} caracteres.`;
  return null;
}

/** Dirección de entrega (RF-7 CA1). `datos` = {estado_id, municipio_id, calle, colonia, cp, referencias,...} */
export function validarDireccion(d) {
  const e = {};
  if (!d.estado_id) e.estado_id = 'Selecciona un estado.';
  if (!d.municipio_id) e.municipio_id = 'Selecciona un municipio.';
  const calle = validarTexto(d.calle, 'La calle', { max: 120 }); if (calle) e.calle = calle;
  const col = validarTexto(d.colonia, 'La colonia', { max: 120 }); if (col) e.colonia = col;
  const cp = validarCP(d.cp); if (cp) e.cp = cp;
  if (String(d.num_ext ?? '').length > 20) e.num_ext = 'El número exterior no puede superar 20 caracteres.';
  if (String(d.num_int ?? '').length > 20) e.num_int = 'El número interior no puede superar 20 caracteres.';
  if (String(d.referencias ?? '').length > 200) e.referencias = 'Las referencias no pueden superar 200 caracteres.';
  return e;
}

/** Datos de la cuenta nueva (RF-1 CA3/CA5, RF-20 CA6/CA7). */
export function validarRegistro(d) {
  const e = {};
  const n = validarNombre(d.nombres, 'El nombre'); if (n) e.nombres = n;
  const ap = validarNombre(d.apellido_paterno, 'El apellido paterno'); if (ap) e.apellido_paterno = ap;
  const am = validarNombre(d.apellido_materno, 'El apellido materno'); if (am) e.apellido_materno = am;
  const c = validarCorreo(d.correo); if (c) e.correo = c;
  const p = validarPassword(d.password); if (p) e.password = p;
  if (!d.acepta_privacidad) e.acepta_privacidad = 'Debes aceptar el aviso de privacidad.';
  return e;
}

/** Datos fiscales para la factura (RF-9 CA3). */
export function validarDatosFiscales(d) {
  const e = {};
  const r = validarRFC(d.rfc); if (r) e.rfc = r;
  const rs = validarTexto(d.razon_social, 'La razón social', { max: 150 }); if (rs) e.razon_social = rs;
  const cp = validarCP(d.cp_fiscal); if (cp) e.cp_fiscal = cp.replace('El código postal', 'El código postal fiscal');
  if (!d.regimen) e.regimen = 'Selecciona el régimen fiscal.';
  if (!d.uso_cfdi) e.uso_cfdi = 'Selecciona el uso de CFDI.';
  return e;
}

/** Datos de la tarjeta (RF-6 CA1 / RF-20 CA4). */
export function validarDatosTarjeta(t, hoy) {
  const e = {};
  const n = validarTarjeta(t.numero); if (n) e.numero = n;
  const v = validarVencimiento(t.vencimiento, hoy); if (v) e.vencimiento = v;
  const c = validarCVV(t.cvv); if (c) e.cvv = c;
  return e;
}

/** Perfil (RF-19 CA1/CA5). */
export function validarPerfil(d) {
  const e = {};
  const n = validarNombre(d.nombres, 'El nombre'); if (n) e.nombres = n;
  const ap = validarNombre(d.apellido_paterno, 'El apellido paterno'); if (ap) e.apellido_paterno = ap;
  const am = validarNombre(d.apellido_materno, 'El apellido materno'); if (am) e.apellido_materno = am;
  const t = validarTelefono(d.telefono); if (t) e.telefono = t;
  return e;
}
