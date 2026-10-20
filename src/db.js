import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.rutaBD), { recursive: true });
fs.mkdirSync(config.carpetaSubidas, { recursive: true });

export const db = new Database(config.rutaBD);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// ---------------------------------------------------------------------
// Esquema relacional (RNF-4 CA1). Una sola fuente de verdad para tienda y panel.
// Dinero en CENTAVOS (enteros) para evitar errores de redondeo (RN-19, MXN).
// ---------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombres TEXT NOT NULL,
  apellido_paterno TEXT NOT NULL,
  apellido_materno TEXT NOT NULL,
  correo TEXT NOT NULL UNIQUE COLLATE NOCASE,          -- RN-23: una cuenta por correo, sin distinguir mayúsculas
  password_hash TEXT NOT NULL,
  telefono TEXT,
  rol TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente','administrador')),  -- RF-1 CA4 / RNF-4 CA3
  acepto_privacidad INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zonas_envio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tarifa TEXT NOT NULL,
  costo INTEGER NOT NULL CHECK (costo >= 0),
  dias_min INTEGER NOT NULL,
  dias_max INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS estados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL UNIQUE,
  zona_id INTEGER NOT NULL REFERENCES zonas_envio(id)   -- RN-17: la zona sale del estado, no se escribe a mano
);

CREATE TABLE IF NOT EXISTS municipios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estado_id INTEGER NOT NULL REFERENCES estados(id),
  nombre TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_municipios_estado ON municipios(estado_id);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
  descripcion TEXT,
  estatus TEXT NOT NULL DEFAULT 'activa' CHECK (estatus IN ('activa','oculta')),
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT NOT NULL,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  coleccion TEXT,
  descripcion TEXT NOT NULL,
  material TEXT NOT NULL,
  largo REAL NOT NULL CHECK (largo > 0),
  alto REAL NOT NULL CHECK (alto > 0),
  ancho REAL NOT NULL CHECK (ancho > 0),
  precio INTEGER NOT NULL CHECK (precio > 0),             -- centavos, IVA incluido (RN-5)
  existencias INTEGER NOT NULL DEFAULT 0 CHECK (existencias >= 0),
  umbral INTEGER NOT NULL DEFAULT 5 CHECK (umbral >= 0),
  estatus TEXT NOT NULL DEFAULT 'activo' CHECK (estatus IN ('activo','oculto')),
  destacada INTEGER NOT NULL DEFAULT 0 CHECK (destacada IN (0,1)),
  forma TEXT NOT NULL DEFAULT 'mochila',                  -- forma de la ilustración de respaldo
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);

CREATE TABLE IF NOT EXISTS producto_colores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  hex TEXT NOT NULL,
  foto TEXT,
  UNIQUE (producto_id, nombre)
);

CREATE TABLE IF NOT EXISTS producto_fotos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS carrito_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  visitante TEXT,                                         -- carrito del visitante sin sesión
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  color TEXT NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad >= 1),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((usuario_id IS NOT NULL) <> (visitante IS NOT NULL))
);
-- RN-26: una sola línea por producto+color
CREATE UNIQUE INDEX IF NOT EXISTS ux_carrito_usuario ON carrito_items(usuario_id, producto_id, color) WHERE usuario_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_carrito_visitante ON carrito_items(visitante, producto_id, color) WHERE visitante IS NOT NULL;

CREATE TABLE IF NOT EXISTS favoritos (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (usuario_id, producto_id)
);

CREATE TABLE IF NOT EXISTS direcciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  alias TEXT NOT NULL DEFAULT 'Casa',
  estado_id INTEGER NOT NULL REFERENCES estados(id),
  municipio_id INTEGER NOT NULL REFERENCES municipios(id),
  calle TEXT NOT NULL,
  colonia TEXT NOT NULL,
  cp TEXT NOT NULL,
  num_ext TEXT,
  num_int TEXT,
  referencias TEXT
);

CREATE TABLE IF NOT EXISTS folios (
  tipo TEXT PRIMARY KEY,
  ultimo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT NOT NULL UNIQUE,                             -- RN-20: único y consecutivo
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  estatus TEXT NOT NULL DEFAULT 'pagado' CHECK (estatus IN ('pagado','preparando','enviado','entregado','cancelado','devuelto')),
  subtotal INTEGER NOT NULL,                              -- IVA incluido
  envio INTEGER NOT NULL,
  total INTEGER NOT NULL,
  iva_incluido INTEGER NOT NULL,                          -- solo informativo (RN-5)
  tarjeta_ultimos4 TEXT NOT NULL,
  numero_guia TEXT,
  zona_nombre TEXT NOT NULL,
  tiempo_estimado TEXT NOT NULL,
  dir_destinatario TEXT NOT NULL,
  dir_estado TEXT NOT NULL,
  dir_municipio TEXT NOT NULL,
  dir_calle TEXT NOT NULL,
  dir_colonia TEXT NOT NULL,
  dir_cp TEXT NOT NULL,
  dir_num_ext TEXT,
  dir_num_int TEXT,
  dir_referencias TEXT,
  visto_admin INTEGER NOT NULL DEFAULT 0,                 -- RF-18 CA6: "Pedido nuevo" hasta que el admin lo abre
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  entregado_en TEXT
);
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario ON pedidos(usuario_id);

CREATE TABLE IF NOT EXISTS pedido_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  color TEXT NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad >= 1),
  precio_unitario INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pedido_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  estatus TEXT NOT NULL,
  nota TEXT,
  autor TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS facturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT NOT NULL UNIQUE,
  pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id),
  rfc TEXT NOT NULL,
  razon_social TEXT NOT NULL,
  cp_fiscal TEXT NOT NULL,
  regimen_clave TEXT NOT NULL,
  uso_cfdi_clave TEXT NOT NULL,
  dir_facturacion TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS regimenes_fiscales (clave TEXT PRIMARY KEY, nombre TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usos_cfdi (clave TEXT PRIMARY KEY, nombre TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS resenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  calificacion INTEGER NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  comentario TEXT NOT NULL CHECK (length(comentario) BETWEEN 1 AND 500),
  verificado INTEGER NOT NULL DEFAULT 0,
  oculta INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (producto_id, usuario_id)                        -- RN-8: una reseña por producto por cliente
);

CREATE TABLE IF NOT EXISTS resena_likes (
  resena_id INTEGER NOT NULL REFERENCES resenas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (resena_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS devoluciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  motivo TEXT NOT NULL,
  comentarios TEXT,
  estatus TEXT NOT NULL DEFAULT 'pendiente' CHECK (estatus IN ('pendiente','aprobada','rechazada')),
  respuesta TEXT,
  reingreso_inventario INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resuelto_en TEXT
);

-- RNF-4 CA4: bitácora de cada cambio de existencias
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  usuario_id INTEGER REFERENCES usuarios(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('venta','entrada','ajuste','devolucion','cancelacion')),
  cantidad INTEGER NOT NULL,                               -- con signo: negativo = salida
  existencias_resultantes INTEGER NOT NULL,
  referencia TEXT
);

-- Correos "enviados" (simulados o reales): comprobantes, avisos al administrador, cambios de estatus...
CREATE TABLE IF NOT EXISTS correos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  para TEXT NOT NULL,
  asunto TEXT NOT NULL,
  cuerpo_html TEXT NOT NULL,
  adjunto TEXT,
  estado_envio TEXT NOT NULL DEFAULT 'simulado'
);
`);

// ---------------------------------------------------------------------
// Utilidades de dinero, fechas y folios
// ---------------------------------------------------------------------
export const ahora = () => new Date().toISOString();

/** Pesos (número o texto con ≤2 decimales) → centavos enteros. */
export const aCentavos = (pesos) => Math.round(Number(pesos) * 100);
/** Centavos → pesos (número con 2 decimales). */
export const aPesos = (centavos) => Math.round(centavos) / 100;
/** RN-5: parte de IVA contenida en un monto que ya lo incluye (16 %). */
export const ivaIncluido = (centavos, pct = 16) => Math.round((centavos * pct) / (100 + pct));

export function config_(clave, porDefecto = null) {
  const f = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
  return f ? f.valor : porDefecto;
}
export const configNum = (clave, porDefecto = 0) => Number(config_(clave, porDefecto));
export function guardarConfig(clave, valor) {
  db.prepare('INSERT INTO configuracion(clave, valor) VALUES(?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run(clave, String(valor));
}

/** RN-20: folio único y consecutivo. Debe llamarse dentro de una transacción. */
export function siguienteFolio(tipo) {
  const prefijo = tipo === 'pedido' ? 'PED' : 'FAC';
  db.prepare('INSERT INTO folios(tipo, ultimo) VALUES(?, 0) ON CONFLICT(tipo) DO NOTHING').run(tipo);
  db.prepare('UPDATE folios SET ultimo = ultimo + 1 WHERE tipo = ?').run(tipo);
  const { ultimo } = db.prepare('SELECT ultimo FROM folios WHERE tipo = ?').get(tipo);
  return `${prefijo}-${String(ultimo).padStart(6, '0')}`;
}

/** Ejecuta `fn` en una transacción con bloqueo de escritura inmediato (evita vender de más, RNF-3 CA2). */
export function transaccion(fn) {
  return db.transaction(fn).immediate();
}

export function registrarMovimiento({ usuarioId = null, productoId, tipo, cantidad, resultante, referencia = null }) {
  db.prepare(
    `INSERT INTO movimientos_inventario(fecha, usuario_id, producto_id, tipo, cantidad, existencias_resultantes, referencia)
     VALUES(?,?,?,?,?,?,?)`
  ).run(ahora(), usuarioId, productoId, tipo, cantidad, resultante, referencia);
}

export class ErrorApi extends Error {
  constructor(estado, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra;
  }
}
