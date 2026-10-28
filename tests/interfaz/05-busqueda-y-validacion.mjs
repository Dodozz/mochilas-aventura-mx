import fs from 'node:fs';
import { abrir, ir, q, qa, txt, chk, resumen, wait, esperar, escribir, clic } from './ayuda.mjs';

const blur = (w, el) => el.dispatchEvent(new w.Event('blur'));
const errorDe = (w, nombre) => q(w, `[name=${nombre}]`).closest('.campo').querySelector('.error');
const nombres = (w) => qa(w, '#resultado .prod .nombre').map((a) => a.textContent.trim());

console.log('UN SOLO BUSCADOR');
let w = await abrir('/');
chk(!w.document.body.classList.contains('en-catalogo') && !!q(w, '#buscar-form'), 'fuera del catálogo se muestra el buscador del encabezado');
const css = fs.readFileSync(new URL('../../public/css/styles.css', import.meta.url), 'utf8');
chk(/body\.en-catalogo \.encabezado \.buscador \{ display: none !important; \}/.test(css), 'regla CSS que oculta el buscador del encabezado en el catálogo');

// buscar desde el encabezado (con error de tecleo) lleva al catálogo
const fq = q(w, '#buscar-form');
fq.querySelector('input').value = 'mochla azul';
fq.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await esperar(w); await wait(300);
chk(w.location.pathname === '/catalogo' && w.document.body.classList.contains('en-catalogo'), 'en el catálogo se oculta el del encabezado');
chk(q(w, '#f-q').value === 'mochla azul', 'la búsqueda pasa al buscador del catálogo');
chk(nombres(w).length === 3 && nombres(w).every((n) => n.startsWith('Mochila')), `"mochla azul" → 3 mochilas (${nombres(w).join(', ')})`);
chk(txt(w, '#nota-busqueda').includes('mochila'), `explica la corrección: ${txt(w, '#nota-busqueda')}`);
chk(qa(w, '#resultado .prod .resumen').length === 3, 'cada tarjeta muestra su descripción breve');

console.log('BÚSQUEDA EN EL CATÁLOGO');
const fqc = q(w, '#f-q');
escribir(w, fqc, 'dinosuario'); fqc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(500);
chk(nombres(w).join() === 'Mochila verde de dinosaurios', `"dinosuario" → ${nombres(w).join()}`);
chk(txt(w, '#cat-titulo') === 'Resultados para "dinosuario"', 'título con la búsqueda');
escribir(w, fqc, 'para la compu'); await wait(600);
chk(nombres(w).length === 2 && nombres(w).every((n) => /laptop|antirrobo/.test(n)), `"para la compu" usa sinónimos y descripción (${nombres(w).join(', ')})`);
escribir(w, fqc, 'mochila sin ruedas'); await wait(600);
chk(nombres(w).length === 4 && !nombres(w).some((n) => n.includes('ruedas')), '"sin ruedas" excluye las de ruedas');
escribir(w, fqc, 'xyzzy'); await wait(600);
chk(txt(w, '#resultado h3').includes('No encontramos productos para "xyzzy"'), 'mensaje sin resultados');
const chip = q(w, '[data-sugerencia="lonchera"]');
chk(!!chip, 'sugerencias de búsqueda');
clic(w, chip); await wait(500);
chk(nombres(w).join() === 'Lonchera térmica escolar' && q(w, '#f-q').value === 'lonchera', 'la sugerencia busca al hacer clic');
await ir(w, '/');
chk(!w.document.body.classList.contains('en-catalogo') && q(w, '#buscar-form input').value === '', 'al salir del catálogo vuelve el buscador del encabezado (vacío)');

console.log('REGISTRO: EL ERROR SE QUITA AL MOMENTO');
await ir(w, '/registro');
const correo = q(w, '[name=correo]');
escribir(w, correo, 'juan.perezgmail.com'); blur(w, correo);
chk(!!errorDe(w, 'correo'), 'sin @ → mensaje en rojo al salir del campo');
escribir(w, correo, 'juan.perez@');
chk(!!errorDe(w, 'correo'), 'aún incompleto → sigue el mensaje');
escribir(w, correo, 'juan.perez@gmail.com');
chk(!errorDe(w, 'correo') && !correo.closest('.campo').classList.contains('con-error'), 'con la @ y el dominio el mensaje se quita al momento (sin salir del campo)');
const pass = q(w, '[name=password]');
escribir(w, pass, '123'); blur(w, pass);
chk(!!errorDe(w, 'password'), 'contraseña corta → error');
escribir(w, pass, 'Clave1234');
chk(!errorDe(w, 'password'), 'contraseña válida → el error se quita al momento');
// errores que marca el botón "Crear cuenta" también se quitan al corregir
const f = q(w, '#contenido form');
escribir(w, correo, 'malo'); f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(200);
chk(!!errorDe(w, 'correo') && !!q(w, '#f-priv').closest('.campo').querySelector('.error'), 'al enviar se marcan correo y aviso de privacidad');
escribir(w, correo, 'malo@correo.com');
const priv = q(w, '#f-priv'); priv.checked = true; priv.dispatchEvent(new w.Event('change', { bubbles: true }));
chk(!errorDe(w, 'correo') && !priv.closest('.campo').querySelector('.error'), 'ambos errores se quitan al corregirlos');

console.log('ENCABEZADO FIJO');
chk(/#encabezado \{ display: contents; \}/.test(css) && /\.encabezado \{[^}]*position: sticky; top: 0;/.test(css), 'el encabezado se queda pegado arriba al bajar (sticky sin contenedor que lo limite)');
await ir(w, '/');
clic(w, q(w, '#btn-menu'));
chk(q(w, '#nav-principal').classList.contains('abierto'), 'menú del celular abierto');
await ir(w, '/catalogo?categoria=2');
chk(!q(w, '#nav-principal').classList.contains('abierto') && q(w, '#btn-menu').getAttribute('aria-expanded') === 'false', 'al cambiar de pantalla el menú se cierra solo');

console.log('INICIO DE SESIÓN');
await ir(w, '/login');
const fl = q(w, '#contenido form');
fl.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(200);
chk(!!errorDe(w, 'correo'), 'correo vacío → error');
escribir(w, q(w, '[name=correo]'), 'elizabeth.navarro@example.com');
chk(!errorDe(w, 'correo'), 'al escribir un correo válido el error se quita');

console.log('SESIÓN VENCIDA');
await ir(w, '/login');
const fs2 = q(w, '#contenido form');
escribir(w, fs2.querySelector('[name=correo]'), 'elizabeth.navarro@example.com');
escribir(w, fs2.querySelector('[name=password]'), 'Cliente2026');
fs2.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(800); await esperar(w);
chk(txt(w, '#btn-cuenta').includes('Hola, Elizabeth'), 'sesión iniciada');
const { db: bd } = await import('../../src/db.js');
await bd.prepare('DELETE FROM sesiones').run(); // la sesión termina en el servidor
await ir(w, '/cuenta/pedidos'); await wait(900); await esperar(w);
chk(w.location.pathname === '/login' && w.location.search.includes('volver=%2Fcuenta%2Fpedidos'), `pide iniciar sesión y recuerda a dónde volver (${w.location.pathname}${w.location.search})`);
chk(!txt(w, '#encabezado').includes('Hola, Elizabeth') && !!q(w, 'a.btn-cuenta[href="/login"]'), 'el encabezado ya no dice "Hola, Elizabeth"');

resumen();
