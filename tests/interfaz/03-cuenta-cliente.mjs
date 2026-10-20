import { abrir, ir, q, qa, txt, chk, resumen, wait, esperar, escribir, clic } from './ayuda.mjs';
const llenar = (w, f, d) => { for (const [k, v] of Object.entries(d)) { const el = f.querySelector(`[name=${k}]`); if (el.type === 'checkbox') { el.checked = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); } else escribir(w, el, v); } };
const enviar = async (w, f, ms = 800) => { f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(ms); };

console.log('LOGIN CLIENTA'); let w = await abrir('/login');
let f = q(w, '#contenido form');
llenar(w, f, { correo: 'elizabeth.navarro@example.com', password: 'mala1234' }); await enviar(w, f);
chk(txt(w, '#alerta').includes('Correo o contraseña incorrectos'), 'mensaje genérico de error');
llenar(w, f, { password: 'Cliente2026' }); await enviar(w, f); await esperar(w);
chk(txt(w, '#btn-cuenta').includes('Hola, Elizabeth'), 'sesión iniciada: Hola, Elizabeth');
chk(w.location.pathname === '/', 'regresa al inicio');

console.log('PEDIDOS'); await ir(w, '/cuenta/pedidos');
chk(txt(w, 'h1') === 'Elizabeth Navarro Duarte', 'apellidos distintos a los del boceto (Navarro Duarte)');
chk(!txt(w, 'body').includes('Ramírez') && !txt(w, 'body').includes('Claudio'), 'no aparecen los apellidos del boceto');
chk(qa(w, '.pedido-card').length === 4, '4 pedidos de ejemplo');
const pillDe = (c) => c.querySelector('.top .pill').textContent;
const ent = qa(w, '.pedido-card').find((c) => pillDe(c) === 'Entregado');
chk(!!ent.querySelector('[data-dev]'), 'entregado: puede solicitar devolución');
chk(qa(w, '.pedido-card').filter((c) => c.querySelector('[data-cancel]')).length === 2, 'cancelar solo en pagado/preparando');
const env = qa(w, '.pedido-card').find((c) => pillDe(c) === 'Enviado');
chk(env.textContent.includes('Guía: MX'), 'enviado muestra guía');
chk(env.querySelector('[data-dev]') === null, 'enviado: devolución deshabilitada');
clic(w, ent.querySelector('[data-detalle]')); chk(!ent.querySelector('.detalle').classList.contains('oculto'), 'ver detalle');

console.log('FACTURA'); const fac = qa(w, 'a[href$="/factura"]')[0];
clic(w, fac); await esperar(w);
chk(/\/cuenta\/pedidos\/\d+\/factura/.test(w.location.pathname), 'formulario de factura');
chk(txt(w, '.tarjeta').includes('Pago aprobado') && /PED-0000\d\d/.test(txt(w, '.tarjeta')), 'folio, total y pago aprobado precargados');
f = q(w, '#f-fac');
await enviar(w, f, 400);
chk(qa(w, '.campo.con-error').length >= 4, 'RFC, razón social, CP, régimen y uso obligatorios');
llenar(w, f, { rfc: 'xaxx010101000', razon_social: 'Público en General', cp_fiscal: '06700', regimen: '616', uso_cfdi: 'S01' });
chk(q(w, '#rfc').value === 'XAXX010101000', 'RFC se convierte a mayúsculas');
llenar(w, f, { rfc: 'XAXX019901000' }); await enviar(w, f, 300);
chk(txt(w, '.campo.con-error .error').includes('fecha inválida'), 'RFC con fecha inválida rechazado');
llenar(w, f, { rfc: 'XAXX010101000' }); await enviar(w, f, 1500); await esperar(w);
chk(txt(w, 'h1') === '¡Factura generada!', 'factura generada');
chk(txt(w, '.exito').includes('FAC-000001'), 'folio FAC-000001');
await ir(w, '/cuenta/pedidos');
chk(!!q(w, '[data-fac-desc]') && !!q(w, '[data-fac-mail]'), 'Descargar y enviar a mi correo disponibles');

console.log('DEVOLUCIÓN'); clic(w, q(w, '[data-dev]')); await wait(200);
chk(txt(w, '.modal').includes('Solicitar devolución') && txt(w, '.modal').includes('15 días naturales'), 'modal de devolución con plazo');
f = q(w, '#f-dev'); await enviar(w, f, 300);
chk(txt(w, '.modal .error').includes('Selecciona un motivo'), 'motivo obligatorio');
llenar(w, f, { motivo: 'No es lo que pedí' }); await enviar(w, f, 1000);
chk(!q(w, '.modal') && qa(w, '.pedido-card').find((c) => pillDe(c) === 'Entregado').textContent.includes('pendiente'), 'solicitud enviada: pendiente');

console.log('RESEÑA'); await ir(w, '/producto/1');
chk(!q(w, '#f-res'), 'Rosa Floral: ya reseñada por la clienta? (no)'); 
await ir(w, '/producto/4');
chk(!!q(w, '#f-res') === false, 'Espacial: aún no entregada → sin formulario');
chk(txt(w, '#res-cont').includes('Solo los clientes que ya recibieron'), 'mensaje de compra completada');
// Dinos entregado pero con devolución: aún puede reseñar
await ir(w, '/producto/3');
chk(!!q(w, '#f-res'), 'Dinos (entregado): muestra formulario de reseña');
f = q(w, '#f-res'); await enviar(w, f, 300);
chk(qa(w, '#f-res .campo.con-error').length === 2, 'calificación y comentario obligatorios');
clic(w, q(w, '#e4')); q(w, '#e4').checked = true; escribir(w, q(w, '#comentario'), 'Muy buena mochila, cómoda y resistente.');
await enviar(w, f, 1000);
chk(qa(w, '.resena').length === 5 && !q(w, '#f-res'), 'reseña publicada (5) y formulario oculto');
clic(w, q(w, '[data-like]')); await wait(600);
chk(!!q(w, '.like-btn.on'), 'like registrado');

console.log('FAVORITOS'); await ir(w, '/catalogo');
clic(w, q(w, '[data-fav="5"]')); await wait(500); clic(w, q(w, '[data-fav="6"]')); await wait(500);
await ir(w, '/cuenta/favoritos');
chk(qa(w, '.fav-grid .prod').length === 2, '2 favoritos');
chk(q(w, '.fav-grid .prod.agotado [data-mover]').disabled, 'agotado: Mover al carrito deshabilitado + cinta');
clic(w, q(w, '.fav-grid .prod:not(.agotado) [data-mover]')); await wait(900);
chk(qa(w, '.fav-grid .prod').length === 1 && txt(w, '#contador-carrito') === '1', 'movida al carrito y quitada de favoritos');

console.log('CANCELAR'); await ir(w, '/cuenta/pedidos');
clic(w, q(w, '[data-cancel]')); await wait(200); clic(w, q(w, '#ok-conf')); await wait(1000);
chk(qa(w, '.pill.p-cancelado').length === 1, 'pedido cancelado');
resumen();
