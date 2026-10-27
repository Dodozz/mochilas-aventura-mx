import nodemailer from 'nodemailer';
import { config } from './config.js';
import { db, ahora, fueraDeTransaccion } from './db.js';

let transporte = null;
if (config.smtp) transporte = nodemailer.createTransport(config.smtp);

/**
 * Envía (o simula) un correo. SIEMPRE queda registrado en la tabla `correos`,
 * así se puede comprobar en el panel (Administración → Correos) aunque no haya SMTP.
 */
export async function enviarCorreo({ para, asunto, html, adjunto = null, adjuntoBuffer = null }) {
  const info = await db
    .prepare('INSERT INTO correos(fecha, para, asunto, cuerpo_html, adjunto, estado_envio) VALUES(?,?,?,?,?,?)')
    .run(ahora(), para, asunto, html, adjunto, transporte ? 'enviando' : 'simulado');
  const id = Number(info.lastInsertRowid);
  if (transporte) {
    // El envío real sigue en segundo plano, FUERA de la transacción (que ya habrá terminado cuando responda el SMTP).
    fueraDeTransaccion(() => {
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
          return db.prepare("UPDATE correos SET estado_envio = 'error' WHERE id = ?").run(id);
        })
        .catch((e) => console.error('[correo] no se pudo actualizar el estado:', e.message));
    });
  } else if (process.env.NODE_ENV !== 'test') {
    console.log(`[correo simulado] → ${para} · ${asunto}`);
  }
  return id;
}
