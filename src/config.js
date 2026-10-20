import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// En Vercel el código es de solo lectura: solo /tmp se puede escribir (y se borra entre arranques en frío).
const carpetaDatos = process.env.VERCEL ? '/tmp' : path.join(raiz, 'data');

export const config = {
  raiz,
  puerto: Number(process.env.PORT || 3000),
  rutaBD: process.env.DB_PATH || path.join(carpetaDatos, 'mochilas.db'),
  carpetaSubidas: path.join(carpetaDatos, 'subidas'),
  produccion: process.env.NODE_ENV === 'production',
  // Correo real (opcional). Sin SMTP_HOST los correos se simulan: se guardan en la tabla `correos`
  // y se pueden ver en el panel de administración → "Correos".
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      }
    : null,
  remitente: process.env.MAIL_FROM || 'Mochilas Aventura MX <contacto@mochilasaventuramx.com>',
  duracionSesionDias: 30,
};
