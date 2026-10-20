import { estado, esc, $, $$, ico, icoRed, precio } from '../util.js';

// ------------------------------------------------------------------ Preguntas frecuentes (RF-13) — textos del anexo
const FAQ = (t) => [
  ['Pedidos', '¿Cómo hago un pedido?', 'Elige la mochila, el modelo, el color y la cantidad, presiona "Agregar al carrito" y luego "Proceder a la compra". Para pagar debes haber iniciado sesión con tu cuenta.'],
  ['Pagos', '¿Qué medios de pago aceptan?', 'Tarjetas de crédito y débito.'],
  ['Envíos', '¿Cuánto cuesta y cuánto tarda el envío?', t.zonas.map((z, i) => `${i === 0 ? 'Ciudad de México y Estado de México' : 'Resto del país'}: ${precio(z.costo)} y de ${z.dias_min} a ${z.dias_max} días`).join('. ') + `. Envío gratis en compras desde ${precio(t.envio_gratis_desde)}.`],
  ['Devoluciones', '¿Cuánto tiempo tengo para devolver un producto?', `${t.dias_devolucion} días naturales después de recibirlo, siempre que esté sin uso y con sus etiquetas.`],
  ['Facturación', '¿Cómo solicito mi factura?', 'Desde "Mis pedidos", capturando RFC, razón social, código postal fiscal, régimen fiscal y uso de CFDI (listas desplegables) y dirección de facturación. La factura se envía a tu correo y también puedes descargarla en PDF.'],
  ['Cuenta', '¿Necesito una cuenta para comprar?', 'Puedes navegar y ver el catálogo sin cuenta, pero para pagar debes registrarte.'],
];

export function faqHtml() {
  const items = FAQ(estado.tienda);
  const cats = [...new Set(items.map((i) => i[0]))];
  return `<div class="faq" id="faq"><h2 class="centrado">Preguntas frecuentes</h2>
    <div class="chips" role="group" aria-label="Filtrar preguntas por tema"><button class="chip on" data-tema="">Todas</button>${cats.map((c) => `<button class="chip" data-tema="${c}">${c}</button>`).join('')}</div>
    ${items.map(([cat, q, r], i) => `<div class="faq-item" data-cat="${cat}"><button aria-expanded="false" aria-controls="resp-${i}" id="preg-${i}"><span>${esc(q)}</span><span class="mas" aria-hidden="true">${ico('mas')}</span></button><div class="resp" id="resp-${i}" role="region" aria-labelledby="preg-${i}">${esc(r)}</div></div>`).join('')}</div>`;
}
export function activarFaq(raiz) {
  const faq = $('#faq', raiz); if (!faq) return;
  faq.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) {
      $$('.chip', faq).forEach((c) => c.classList.toggle('on', c === chip));
      $$('.faq-item', faq).forEach((i) => i.classList.toggle('oculto', !!chip.dataset.tema && i.dataset.cat !== chip.dataset.tema));
      return;
    }
    const b = e.target.closest('.faq-item > button');
    if (b) { const it = b.parentElement; const ab = it.classList.toggle('abierta'); b.setAttribute('aria-expanded', ab); }
  });
}

// ------------------------------------------------------------------ Políticas (Anexo) — se muestran con los valores configurados
function politica(tipo, t) {
  const z = t.zonas;
  const li = (k, v) => `<li><b>${k}:</b> ${v}</li>`;
  const P = {
    devoluciones: ['Política de devoluciones y cancelaciones', [
      li('Plazo', `${t.dias_devolucion} días naturales contados a partir de la entrega del pedido.`),
      li('Condiciones', 'el producto debe estar sin uso y con sus etiquetas. Solo se aceptan devoluciones de pedidos entregados.'),
      li('Solicitud', 'desde "Mis pedidos", indicando el motivo. La tienda aprueba o rechaza la solicitud y el cliente recibe la resolución por correo.'),
      li('Reembolso', 'por el mismo medio de pago, en un máximo de 10 días hábiles después de aprobada la devolución. La pieza regresa al inventario solo si llega en buen estado.'),
      li('Productos dañados o con defecto', 'se pueden devolver dentro del mismo plazo y la tienda cubre el costo de la devolución.'),
      li('Cancelaciones', 'un pedido solo se puede cancelar antes de ser enviado. Una vez enviado, aplica el proceso de devolución.')]],
    envios: ['Política de envíos', [
      li('Cobertura', 'solo se envía a direcciones dentro de México, eligiendo el estado de la lista de los estados de México.'),
      li('Costos y tiempos', `Ciudad de México y Estado de México: ${precio(z[0].costo)}, entrega estimada de ${z[0].dias_min} a ${z[0].dias_max} días. Resto del país: ${precio(z[1].costo)}, entrega estimada de ${z[1].dias_min} a ${z[1].dias_max} días. El costo se asigna automáticamente según el estado de la dirección.`),
      li('Envío gratis', `en compras desde ${precio(t.envio_gratis_desde)}.`),
      li('Preparación', 'el pedido se prepara una vez aprobado el pago.'),
      li('Seguimiento', 'el estatus del pedido (pagado, preparando, enviado o entregado) se consulta en "Mis pedidos" y se notifica por correo en cada cambio. Al enviarse, se registra un número de guía.')]],
    privacidad: ['Aviso de privacidad', [
      li('Datos que recabamos', 'nombre, correo, teléfono, direcciones de entrega y, si se solicita factura, datos fiscales.'),
      li('Uso de los datos', 'procesar pedidos y envíos, emitir la factura, dar seguimiento y atender dudas o solicitudes del cliente.'),
      li('Terceros', 'los datos no se venden ni se comparten, salvo lo indispensable para procesar el pago y realizar la entrega.'),
      li('Derechos ARCO', `el cliente puede solicitar acceso, rectificación, cancelación u oposición al uso de sus datos escribiendo a <a href="mailto:${esc(t.correo)}">${esc(t.correo)}</a>, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.`),
      li('Aceptación', 'el usuario debe aceptar este aviso al registrarse para poder crear su cuenta.')]],
    terminos: ['Términos y condiciones', [
      li('Precios y moneda', 'los precios están en pesos mexicanos (MXN) e incluyen IVA (16 %).'),
      li('Medios de pago', 'tarjeta de crédito o débito.'),
      li('Disponibilidad', 'los pedidos están sujetos a existencias. El pedido se genera solo con pago aprobado y el inventario se descuenta en ese momento.'),
      li('Límites de compra', `máximo ${t.limite_modelo} piezas por modelo y ${t.limite_pedido} piezas por pedido, sin superar las existencias.`),
      li('Cuenta', 'para pagar es obligatorio estar registrado. Cada correo permite una sola cuenta y el cliente es responsable del uso de su contraseña.'),
      li('Carrito', 'los productos del carrito se conservan durante 7 días.'),
      li('Reseñas', 'solo pueden opinar los clientes con compra completada del producto, con un máximo de 500 caracteres. La tienda puede ocultar reseñas con lenguaje ofensivo o ajenas al producto.'),
      li('Facturación', 'se solicita sobre pedidos con pago aprobado y dentro del mismo mes de la compra.'),
      li('Cambios', 'la tienda puede actualizar estos términos y las demás políticas, que se publican en el sitio.')]],
  };
  return P[tipo];
}

const TEMAS = [['devoluciones', 'Devoluciones'], ['envios', 'Envíos'], ['privacidad', 'Aviso de privacidad'], ['terminos', 'Términos y condiciones']];

export async function render(ctx) {
  const t = estado.tienda, c = ctx.contenedor;
  if (ctx.tipo === 'politica') {
    const [titulo, items] = politica(ctx.params[0], t);
    ctx.titulo(titulo);
    c.innerHTML = `<div class="contenedor seccion"><div class="tabs">${TEMAS.map(([k, n]) => `<a class="chip ${k === ctx.params[0] ? 'on' : ''}" href="/politicas/${k}" data-link style="text-decoration:none">${n}</a>`).join('')}</div>
      <article class="tarjeta politica" style="max-width:860px"><h1>${titulo}</h1><ul>${items.join('')}</ul></article></div>`;
  } else if (ctx.tipo === 'contacto') {
    ctx.titulo('Contacto');
    const r = t.redes;
    c.innerHTML = `<div class="contenedor seccion"><h1>Contacto</h1><div class="tarjeta" style="max-width:720px">
      <p>¿Tienes dudas sobre tu pedido o sobre alguna mochila? Escríbenos, con gusto te ayudamos.</p>
      <p>${ico('correo')} <b>Correo:</b> <a href="mailto:${esc(t.correo)}">${esc(t.correo)}</a></p>
      <p>${ico('telefono')} <b>Teléfono y WhatsApp:</b> <a href="${esc(r.whatsapp)}" target="_blank" rel="noopener noreferrer">${esc(t.telefono)}</a></p>
      <p><b>Horario de atención:</b> ${esc(t.horario)}</p>
      <div class="redes" style="margin-top:1rem">${['instagram', 'facebook', 'tiktok', 'x', 'whatsapp'].map((k) => `<a href="${esc(r[k])}" target="_blank" rel="noopener noreferrer" aria-label="${k}">${icoRed(k)}</a>`).join('')}</div></div></div>`;
  } else if (ctx.tipo === 'faq') {
    ctx.titulo('Preguntas frecuentes');
    c.innerHTML = `<div class="contenedor seccion">${faqHtml()}</div>`;
    activarFaq(c);
  } else {
    ctx.titulo('Página no encontrada');
    c.innerHTML = `<div class="contenedor vacio"><h2>No encontramos esa página</h2><p>Puede que el enlace haya cambiado o que la mochila ya no esté disponible.</p><a class="btn" href="/catalogo" data-link>Ver el catálogo</a></div>`;
  }
}
