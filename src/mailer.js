import nodemailer from 'nodemailer';
import { config } from './config.js';
import { db, ahora } from './db.js';

let transporte = null;
if (config.smtp) transporte = nodemailer.createTransport(config.smtp);

/**
 * Envía (o simula) un correo. SIEMPRE queda registrado en la tabla `correos`,
 * así se puede comprobar en el panel (Administración → Correos) aunque no haya SMTP.
 */
export function enviarCorreo({ para, asunto, html, adjunto = null, adjuntoBuffer = null }) {
  const info = db
    .prepare('INSERT INTO correos(fecha, para, asunto, cuerpo_html, adjunto, estado_envio) VALUES(?,?,?,?,?,?)')
    .run(ahora(), para, asunto, html, adjunto, transporte ? 'enviando' : 'simulado');
  const id = Number(info.lastInsertRowid);
  if (transporte) {
    transporte
      .sendMail({
        from: config.remitente,
        to: para,
        subject: asunto,
        html,
        attachments: adjuntoBuffer ? [{ filename: adjunto, content: adjuntoBuffer }] : undefined,
      })
      .then(() => db.prepare("UPDATE correos SET estado_envio = 'enviado' WHERE id = ?").run(id))
      .catch((e) => {
        console.error('[correo] error de SMTP:', e.message);
        db.prepare("UPDATE correos SET estado_envio = 'error' WHERE id = ?").run(id);
      });
  } else if (process.env.NODE_ENV !== 'test') {
    console.log(`[correo simulado] → ${para} · ${asunto}`);
  }
  return id;
}
