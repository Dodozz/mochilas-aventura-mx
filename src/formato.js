import { aPesos } from './db.js';

/** 12345 centavos → "$123.45" (RN-19: MXN) */
export const moneda = (centavos) =>
  '$' + aPesos(centavos).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fechaLarga = (iso) =>
  new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });

export const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' });

export const nombreCompleto = (u) => `${u.nombres} ${u.apellido_paterno} ${u.apellido_materno}`.trim();
