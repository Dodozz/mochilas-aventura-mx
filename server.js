import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './src/config.js';
import { ErrorApi } from './src/db.js';
import { sembrarSiVacio } from './src/seed.js';
import { identificar } from './src/auth.js';
import { api } from './src/rutas/api.js';

sembrarSiVacio(); // primera ejecución: carga catálogo, zonas, estados/municipios y usuarios de prueba

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
app.use('/subidas', express.static(config.carpetaSubidas, { maxAge: '7d' }));
app.use(express.static(publico, { maxAge: config.produccion ? '1h' : 0, index: false }));

app.use('/api', express.json({ limit: '4mb' }));
app.use('/api', identificar);
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

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.puerto, () => {
    console.log(`\n  Mochilas Aventura MX listo →  http://localhost:${config.puerto}`);
    console.log('  Administrador:  admin@mochilasaventuramx.com / Admin2026');
    console.log('  Cliente:        elizabeth.navarro@example.com / Cliente2026\n');
  });
}
