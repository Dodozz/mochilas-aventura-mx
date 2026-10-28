import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, ahora, ErrorApi } from './db.js';
import { config } from './config.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DIA_MS = 86_400_000;

export const hashPassword = (p) => bcrypt.hashSync(p, 10);
export const verificarPassword = (p, hash) => bcrypt.compareSync(p, hash);

function leerCookies(req) {
  const salida = {};
  for (const par of (req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) salida[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return salida;
}

function ponerCookie(res, nombre, valor, { dias = 30, borrar = false } = {}) {
  const partes = [`${nombre}=${borrar ? '' : encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  partes.push(borrar ? 'Max-Age=0' : `Max-Age=${dias * 86400}`);
  if (config.produccion) partes.push('Secure');
  const previas = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...(Array.isArray(previas) ? previas : [previas]), partes.join('; ')]);
}

/** Crea una sesión para el usuario y la deja en la cookie `sid`. */
export async function iniciarSesion(res, usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.prepare('INSERT INTO sesiones(token_hash, usuario_id, expira_en) VALUES(?,?,?)').run(
    sha256(token),
    usuarioId,
    new Date(Date.now() + config.duracionSesionDias * DIA_MS).toISOString()
  );
  ponerCookie(res, 'sid', token, { dias: config.duracionSesionDias });
}

export async function cerrarSesion(req, res) {
  const token = leerCookies(req).sid;
  if (token) await db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(sha256(token));
  ponerCookie(res, 'sid', '', { borrar: true });
}

/**
 * Identifica al visitante (cookie `vid`, para su carrito) y al usuario con sesión (cookie `sid`).
 * El ROL se lee de la base de datos en CADA petición (RNF-4 CA3): nunca se confía en el navegador.
 */
export async function identificar(req, res, next) {
  const cookies = leerCookies(req);
  let vid = cookies.vid;
  if (!vid || !/^[a-f0-9]{32}$/.test(vid)) {
    vid = crypto.randomBytes(16).toString('hex');
    ponerCookie(res, 'vid', vid, { dias: 60 });
  }
  req.visitante = vid;
  req.usuario = null;
  if (cookies.sid) {
    const fila = await db
      .prepare(
        `SELECT u.id, u.nombres, u.apellido_paterno, u.apellido_materno, u.correo, u.telefono, u.rol
           FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token_hash = ? AND s.expira_en > ?`
      )
      .get(sha256(cookies.sid), ahora());
    if (fila) req.usuario = fila;
  }
  next();
}

export function requiereSesion(req, _res, next) {
  if (!req.usuario) return next(new ErrorApi(401, 'Inicia sesión para continuar.'));
  next();
}

/** RF-18 CA9 / RN-13: solo el rol administrador entra al panel. */
export function requiereAdmin(req, _res, next) {
  if (!req.usuario) return next(new ErrorApi(401, 'Inicia sesión para continuar.'));
  if (req.usuario.rol !== 'administrador') {
    return next(new ErrorApi(403, 'Acceso denegado: esta sección es solo para administradores.'));
  }
  next();
}

/** Dueño del carrito: el usuario con sesión o, si no hay, el visitante. */
export const duenoCarrito = (req) => (req.usuario ? { usuarioId: req.usuario.id } : { visitante: req.visitante });

// Límite sencillo de intentos de inicio de sesión (por IP + correo)
const intentos = new Map();
export function limitarIntentos(req, _res, next) {
  const clave = `${req.ip}|${String(req.body?.correo || '').toLowerCase()}`;
  const ahoraMs = Date.now();
  const reg = (intentos.get(clave) || []).filter((t) => ahoraMs - t < 10 * 60_000);
  if (reg.length >= 10) return next(new ErrorApi(429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'));
  reg.push(ahoraMs);
  intentos.set(clave, reg);
  next();
}
export const olvidarIntentos = (req) => intentos.delete(`${req.ip}|${String(req.body?.correo || '').toLowerCase()}`);
