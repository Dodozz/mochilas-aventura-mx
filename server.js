import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './src/config.js';
import { ErrorApi, iniciarBD, db } from './src/db.js';
import { sembrarSiVacio } from './src/seed.js';
import { identificar } from './src/auth.js';
import { api } from './src/rutas/api.js';

// Base de datos lista (tablas + datos de ejemplo la primera vez). Se prepara una sola vez por proceso y todas las
// peticiones esperan a que termine; si falla (p. ej. sin conexión a Turso), la siguiente petición lo reintenta.
let preparada = null;
export function prepararBD() {
  if (!preparada) preparada = iniciarBD().then(sembrarSiVacio).catch((e) => { preparada = null; throw e; });
  return preparada;
}
prepararBD().catch((e) => console.error('[bd] no se pudo preparar la base de datos:', e.message));

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression()); // RNF-3: páginas ligeras (HTML, CSS, JS y JSON comprimidos)

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});

const publico = path.join(config.raiz, 'public');
const conBD = (fn) => (req, res, next) => prepararBD()
  .then(() => fn(req, res, next), (e) => {
    console.error('[bd] sin conexión con la base de datos:', e.message);
    throw new ErrorApi(503, 'La tienda no pudo conectarse con su base de datos. Inténtalo de nuevo en unos momentos.');
  })
  .catch(next);

// Fotos subidas desde el panel: se guardan en la base de datos (compartida entre todas las copias del servidor)
app.get('/subidas/:nombre', conBD(async (req, res, next) => {
  const f = await db.prepare('SELECT tipo, datos FROM archivos WHERE nombre = ?').get(req.params.nombre);
  if (!f) return next();
  res.set({ 'Content-Type': f.tipo, 'Cache-Control': 'public, max-age=604800, immutable' }).send(Buffer.from(f.datos));
}));
app.use('/subidas', express.static(config.carpetaSubidas, { maxAge: '7d' })); // fotos de versiones anteriores (disco local)
app.use(express.static(publico, { maxAge: config.produccion ? '1h' : 0, index: false }));

app.use('/api', express.json({ limit: '4mb' }));
app.use('/api', conBD(identificar));
// Protección CSRF básica: las peticiones que modifican datos deben llevar este encabezado (solo lo puede poner nuestro propio sitio).
app.use('/api', (req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'fetch') {
    return next(new ErrorApi(403, 'Petición no permitida.'));
  }
  next();
});
app.use('/api', api);
app.use('/api', (_req, _res, next) => next(new ErrorApi(404, 'Ruta no encontrada.')));

// Aplicación de una sola página: cualquier otra ruta devuelve index.html (el cliente decide la pantalla)
const indice = path.join(publico, 'index.html');
app.get('*', (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('No encontrado');
  res.sendFile(indice);
});

// Manejo central de errores: mensajes claros en español (RNF-2 CA3)
app.use((err, _req, res, _next) => {
  if (err instanceof ErrorApi) return res.status(err.estado).json({ mensaje: err.message, ...err.extra });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ mensaje: 'Los datos enviados no tienen un formato válido.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ mensaje: 'El archivo es demasiado grande.' });
  console.error(err);
  res.status(500).json({ mensaje: 'Ocurrió un error inesperado. Inténtalo de nuevo en unos minutos.' });
});

// En Vercel la plataforma recibe las peticiones con la app exportada; no hay que escuchar un puerto.
export default app;

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(config.puerto, () => {
    console.log(`\n  Mochilas Aventura MX listo →  http://localhost:${config.puerto}`);
    console.log('  Administrador:  admin@mochilasaventuramx.com / Admin2026');
    console.log('  Cliente:        elizabeth.navarro@example.com / Cliente2026\n');
  });
}
