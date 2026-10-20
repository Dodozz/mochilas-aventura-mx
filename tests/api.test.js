// Ejecutar con:  npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mochilas-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.NODE_ENV = 'test';

const { app } = await import('../server.js');
const { db } = await import('../src/db.js');

let servidor, base;
before(async () => {
  await new Promise((r) => { servidor = app.listen(0, r); });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});
after(() => { servidor.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

/** Cliente HTTP con "cookie jar" (cada instancia = un navegador distinto). */
function navegador() {
  const jar = {};
  const llamar = async (metodo, ruta, cuerpo) => {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [par] = c.split(';'); const i = par.indexOf('=');
      const v = par.slice(i + 1); if (v) jar[par.slice(0, i)] = v; else delete jar[par.slice(0, i)];
    }
    const tipo = res.headers.get('content-type') || '';
    return { estado: res.status, datos: tipo.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), tipo };
  };
  return { get: (r) => llamar('GET', r), post: (r, c) => llamar('POST', r, c), put: (r, c) => llamar('PUT', r, c), del: (r) => llamar('DELETE', r) };
}

const prod = (codigo) => db.prepare('SELECT * FROM productos WHERE codigo = ?').get(codigo);
const stock = (codigo) => prod(codigo).existencias;
const TARJETA = { numero: '4111 1111 1111 1111', vencimiento: '12/39', cvv: '123' };
const DIR = () => ({ estado_id: 1, municipio_id: db.prepare('SELECT id FROM municipios WHERE estado_id = 1 LIMIT 1').get().id, calle: 'Av. Reforma', colonia: 'Centro', cp: '06000', num_ext: '10', referencias: 'Portón negro' });

async function nuevoCliente(correo = `prueba${Date.now()}${Math.floor(Math.random() * 999)}@example.com`) {
  const n = navegador();
  const r = await n.post('/auth/registro', { nombres: 'Laura', apellido_paterno: 'Pérez', apellido_materno: 'Soto', correo, password: 'Clave1234', acepta_privacidad: true });
  assert.equal(r.estado, 201, JSON.stringify(r.datos));
  return { n, correo };
}
async function loginAdmin() {
  const n = navegador();
  const r = await n.post('/auth/login', { correo: 'admin@mochilasaventuramx.com', password: 'Admin2026' });
  assert.equal(r.estado, 200);
  return n;
}

test('RF-1: registro valida datos, da la bienvenida e inicia sesión', async () => {
  const n = navegador();
  let r = await n.post('/auth/registro', { nombres: 'L4', apellido_paterno: '', apellido_materno: 'S', correo: 'mal correo', password: '1234', acepta_privacidad: false });
  assert.equal(r.estado, 422);
  for (const campo of ['nombres', 'apellido_paterno', 'apellido_materno', 'correo', 'password', 'acepta_privacidad']) assert.ok(r.datos.errores[campo], `falta error de ${campo}`);
  assert.equal(r.datos.errores.password, 'La contraseña debe tener mínimo 8 caracteres, con letras y números');

  r = await n.post('/auth/registro', { nombres: 'Elizabeth', apellido_paterno: 'Navarro', apellido_materno: 'Duarte', correo: 'registro.nuevo@example.com', password: 'Clave1234', acepta_privacidad: true });
  assert.equal(r.estado, 201);
  assert.equal(r.datos.mensaje, '¡Bienvenido, Elizabeth!');
  assert.equal((await n.get('/sesion')).datos.usuario.apellido_materno, 'Duarte');
});

test('RF-1 CA9 / RN-23: correo duplicado sin distinguir mayúsculas', async () => {
  const r = await navegador().post('/auth/registro', { nombres: 'Otra', apellido_paterno: 'Persona', apellido_materno: 'Más', correo: 'ELIZABETH.NAVARRO@EXAMPLE.COM', password: 'Clave1234', acepta_privacidad: true });
  assert.equal(r.estado, 409);
  assert.equal(r.datos.errores.correo, 'Este correo ya está registrado. Inicia sesión o usa otro correo');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM usuarios WHERE correo = 'elizabeth.navarro@example.com'").get().n, 1);
});

test('RF-1 CA8: el error de acceso no revela qué dato falló', async () => {
  const a = await navegador().post('/auth/login', { correo: 'elizabeth.navarro@example.com', password: 'incorrecta1' });
  const b = await navegador().post('/auth/login', { correo: 'noexiste@example.com', password: 'incorrecta1' });
  assert.equal(a.estado, 401); assert.equal(b.estado, 401);
  assert.equal(a.datos.mensaje, b.datos.mensaje);
});

test('RF-5: carrito de visitante, suma de línea, límites y fusión al iniciar sesión', async () => {
  const n = navegador();
  const esp = prod('IN-004'); // 3 piezas
  const din = prod('IN-003'); // 25 piezas
  assert.equal((await n.post('/carrito', { producto_id: esp.id, color: 'Azul marino', cantidad: 0 })).estado, 422);
  assert.equal((await n.post('/carrito', { producto_id: esp.id, color: 'Azul marino', cantidad: 1.5 })).estado, 422);
  const agot = await n.post('/carrito', { producto_id: prod('JU-002').id, color: 'Negro', cantidad: 1 });
  assert.equal(agot.estado, 409); // agotado
  const sobre = await n.post('/carrito', { producto_id: esp.id, color: 'Azul marino', cantidad: 5 });
  assert.equal(sobre.estado, 409); assert.match(sobre.datos.mensaje, /Solo 3 piezas/);

  await n.post('/carrito', { producto_id: din.id, color: 'Azul', cantidad: 1 });
  await n.post('/carrito', { producto_id: din.id, color: 'Azul', cantidad: 1 });   // RN-26: se suma, no se duplica
  let c = (await n.get('/carrito')).datos;
  assert.equal(c.lineas.length, 1); assert.equal(c.lineas[0].cantidad, 2);
  assert.equal(c.subtotal, 1198); assert.equal(c.total, 1198); assert.equal(c.iva_incluido, 165.24);
  const r = await n.post('/carrito', { producto_id: din.id, color: 'Verde', cantidad: 10 });  // límite de 10 por modelo (suma de colores)
  assert.equal(r.datos.ajustado, true);
  c = (await n.get('/carrito')).datos;
  assert.equal(c.lineas.reduce((s, l) => s + l.cantidad, 0), 10);

  // Al iniciar sesión el carrito se conserva
  await n.post('/auth/login', { correo: 'elizabeth.navarro@example.com', password: 'Cliente2026' });
  c = (await n.get('/carrito')).datos;
  assert.equal(c.piezas, 10);
  const v = await n.put(`/carrito/${c.lineas[0].id}`, { cantidad: 0 });
  assert.equal(v.estado, 422);
  await n.del(`/carrito/${c.lineas[0].id}`);
  await n.del(`/carrito/${c.lineas[1].id}`);
  assert.equal((await n.get('/carrito')).datos.total, 0); // vacío = $0.00
});

test('RF-6 / RN-1: pagar exige sesión; valida dirección, tarjeta y políticas SIN crear pedido ni mover stock', async () => {
  const visitante = navegador();
  assert.equal((await visitante.post('/checkout/pagar', {})).estado, 401);

  const { n } = await nuevoCliente();
  await n.post('/carrito', { producto_id: prod('IN-001').id, color: 'Rosa', cantidad: 2 });
  const antes = stock('IN-001'), pedidosAntes = db.prepare('SELECT COUNT(*) n FROM pedidos').get().n;
  const r = await n.post('/checkout/pagar', { direccion: { calle: '' }, tarjeta: { numero: '123', vencimiento: '01/20', cvv: '1' }, acepta_politicas: false });
  assert.equal(r.estado, 422);
  assert.ok(r.datos.errores.direccion.calle && r.datos.errores.direccion.cp && r.datos.errores.direccion.estado_id);
  assert.ok(r.datos.errores.tarjeta.numero && r.datos.errores.tarjeta.vencimiento && r.datos.errores.tarjeta.cvv);
  assert.ok(r.datos.errores.politicas);
  assert.equal(stock('IN-001'), antes);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pedidos').get().n, pedidosAntes);
  assert.equal((await n.get('/carrito')).datos.piezas, 2); // el carrito sigue intacto
});

test('Pago aprobado: pedido con folio, stock descontado, bitácora, correos, carrito vacío, envío por zona y gratis desde $999', async () => {
  const { n, correo } = await nuevoCliente();
  const dino = prod('IN-003'), antes = stock('IN-003');
  await n.post('/carrito', { producto_id: dino.id, color: 'Azul', cantidad: 1 }); // $599 → CDMX paga $79
  const estados = (await n.get('/geografia/estados')).datos;
  const cdmx = estados.find((e) => e.nombre === 'Ciudad de México').id;
  const jal = estados.find((e) => e.nombre === 'Jalisco').id;
  let res = (await n.get(`/checkout/resumen?estado_id=${cdmx}`)).datos;
  assert.equal(res.envio.costo, 79); assert.equal(res.total, 678); assert.equal(res.iva_incluido, 82.62);
  res = (await n.get(`/checkout/resumen?estado_id=${jal}`)).datos;
  assert.equal(res.envio.costo, 149);

  const mun = (await n.get(`/geografia/estados/${cdmx}/municipios`)).datos[0].id;
  const ultimo = db.prepare("SELECT ultimo FROM folios WHERE tipo = 'pedido'").get().ultimo;
  const r = await n.post('/checkout/pagar', { direccion: { ...DIR(), estado_id: cdmx, municipio_id: mun }, tarjeta: TARJETA, acepta_politicas: true });
  assert.equal(r.estado, 201, JSON.stringify(r.datos));
  assert.equal(r.datos.folio, `PED-${String(ultimo + 1).padStart(6, '0')}`);
  assert.equal(stock('IN-003'), antes - 1);
  const ped = db.prepare('SELECT * FROM pedidos WHERE folio = ?').get(r.datos.folio);
  assert.equal(ped.estatus, 'pagado'); assert.equal(ped.total, 67800); assert.equal(ped.envio, 7900); assert.equal(ped.tarjeta_ultimos4, '1111');
  assert.ok(db.prepare("SELECT 1 FROM movimientos_inventario WHERE tipo = 'venta' AND referencia = ? AND cantidad = -1").get(r.datos.folio));
  assert.ok(db.prepare('SELECT 1 FROM correos WHERE para = ? AND asunto LIKE ?').get(correo, `%${r.datos.folio}%`), 'comprobante al cliente');
  assert.ok(db.prepare("SELECT 1 FROM correos WHERE para = 'admin@mochilasaventuramx.com' AND asunto LIKE ?").get(`%${r.datos.folio}%`), 'aviso al administrador');
  assert.equal((await n.get('/carrito')).datos.piezas, 0);

  // Envío gratis: 2 Rosa Floral = $1,298 ≥ $999
  await n.post('/carrito', { producto_id: prod('IN-001').id, color: 'Rosa', cantidad: 2 });
  assert.equal((await n.get(`/checkout/resumen?estado_id=${jal}`)).datos.envio.costo, 0);
});

test('RF-8 CA4 / RNF-3: dos compras simultáneas de las últimas piezas no venden de más', async () => {
  const a = await nuevoCliente(), b = await nuevoCliente();
  const esp = prod('IN-004'); // 3 piezas (mínimo de la prueba: dejarlas en 3)
  db.prepare('UPDATE productos SET existencias = 3 WHERE id = ?').run(esp.id);
  for (const { n } of [a, b]) await n.post('/carrito', { producto_id: esp.id, color: 'Gris', cantidad: 2 });
  const pago = ({ n }) => n.post('/checkout/pagar', { direccion: DIR(), tarjeta: TARJETA, acepta_politicas: true });
  const [ra, rb] = await Promise.all([pago(a), pago(b)]);
  const estados = [ra.estado, rb.estado].sort();
  assert.deepEqual(estados, [201, 409]);
  assert.equal(stock('IN-004'), 1);
  const perdedor = ra.estado === 409 ? ra : rb;
  assert.match(perdedor.datos.mensaje, /Solo queda 1 pieza/);
  assert.equal(perdedor.datos.carrito_ajustado, true);
});

test('RF-18 CA9 / RNF-4 CA3: el panel solo admite administradores (verificado en servidor)', async () => {
  const { n } = await nuevoCliente();
  for (const ruta of ['/admin/pedidos', '/admin/inventario', '/admin/productos', '/admin/configuracion']) {
    assert.equal((await n.get(ruta)).estado, 403, ruta);
  }
  assert.equal((await n.post('/admin/inventario/entradas', { producto_id: 1, cantidad: 5 })).estado, 403);
  assert.equal((await navegador().get('/admin/pedidos')).estado, 401);
  const adm = await loginAdmin();
  assert.equal((await adm.get('/admin/pedidos')).estado, 200);
});

test('RF-18: pedidos nuevos, cambio de estatus con guía, correo al cliente', async () => {
  const adm = await loginAdmin();
  const lista = (await adm.get('/admin/pedidos?estatus=nuevo')).datos;
  assert.ok(lista.contadores.pedidos_nuevos >= 1);
  const id = lista.pedidos[0].id;
  assert.equal((await adm.get(`/admin/pedidos/${id}`)).estado, 200);
  assert.equal((await adm.get('/admin/contadores')).datos.pedidos_nuevos, lista.contadores.pedidos_nuevos - 1);
  assert.equal((await adm.put(`/admin/pedidos/${id}/estatus`, { estatus: 'enviado', numero_guia: '' })).estado, 422); // enviado exige guía
  assert.equal((await adm.put(`/admin/pedidos/${id}/estatus`, { estatus: 'preparando' })).estado, 200);
  assert.equal((await adm.put(`/admin/pedidos/${id}/estatus`, { estatus: 'enviado', numero_guia: 'MX12345' })).estado, 200);
  assert.equal((await adm.put(`/admin/pedidos/${id}/estatus`, { estatus: 'preparando' })).estado, 409); // no retrocede
  assert.ok(db.prepare("SELECT 1 FROM correos WHERE asunto LIKE '%ahora está: Enviado%'").get());
});

test('RN-10 / RF-8 CA3: cancelar antes del envío restituye el inventario', async () => {
  const { n } = await nuevoCliente();
  const lon = prod('AC-001'), antes = stock('AC-001');
  await n.post('/carrito', { producto_id: lon.id, color: 'Azul', cantidad: 3 });
  const pago = await n.post('/checkout/pagar', { direccion: DIR(), tarjeta: TARJETA, acepta_politicas: true });
  assert.equal(stock('AC-001'), antes - 3);
  const r = await n.post(`/pedidos/${pago.datos.pedido_id}/cancelar`);
  assert.equal(r.estado, 200);
  assert.equal(stock('AC-001'), antes);
  assert.equal((await n.post(`/pedidos/${pago.datos.pedido_id}/cancelar`)).estado, 409);
  assert.ok(db.prepare("SELECT 1 FROM movimientos_inventario WHERE tipo = 'cancelacion' AND cantidad = 3").get());
});

test('RF-10 / RN-8: solo reseña o da like quien recibió la mochila; una reseña por producto', async () => {
  const { n } = await nuevoCliente();
  const dino = prod('IN-003');
  assert.equal((await n.post(`/productos/${dino.id}/resenas`, { calificacion: 5, comentario: 'Genial' })).estado, 403);
  const resena = db.prepare('SELECT id FROM resenas WHERE producto_id = ?').get(dino.id);
  assert.equal((await n.post(`/resenas/${resena.id}/like`)).estado, 403);

  // Elizabeth (cliente de prueba) tiene PED-000001 entregado de Dinos
  const e = navegador();
  await e.post('/auth/login', { correo: 'elizabeth.navarro@example.com', password: 'Cliente2026' });
  assert.equal((await e.get(`/productos/${dino.id}`)).datos.puede_resenar, true);
  assert.equal((await e.post(`/productos/${dino.id}/resenas`, { calificacion: 5, comentario: '' })).estado, 422);
  assert.equal((await e.post(`/productos/${dino.id}/resenas`, { calificacion: 5, comentario: 'x'.repeat(501) })).estado, 422);
  assert.equal((await e.post(`/productos/${dino.id}/resenas`, { calificacion: 5, comentario: 'Muy buena mochila' })).estado, 201);
  assert.equal((await e.post(`/productos/${dino.id}/resenas`, { calificacion: 4, comentario: 'Otra vez' })).estado, 409);
  assert.equal((await e.post(`/resenas/${resena.id}/like`)).datos.di_like, true);
  const r = (await e.get(`/productos/${dino.id}/resenas`)).datos;
  assert.equal(r.resumen.total, 5);
  assert.equal(r.resumen.por_estrella['5'], 4);
});

test('RF-9: factura simulada con RFC válido, folio consecutivo, PDF y reenvío', async () => {
  const e = navegador();
  await e.post('/auth/login', { correo: 'elizabeth.navarro@example.com', password: 'Cliente2026' });
  const pedidos = (await e.get('/pedidos')).datos;
  const reciente = pedidos.find((p) => p.puede_facturar);
  assert.ok(reciente, 'debe existir un pedido facturable');
  const dirs = (await e.get('/cuenta/direcciones')).datos;
  const mal = await e.post(`/pedidos/${reciente.id}/factura`, { rfc: 'abc', razon_social: '', cp_fiscal: '1', regimen: '', uso_cfdi: '', direccion_id: dirs[0].id });
  assert.equal(mal.estado, 422);
  assert.ok(mal.datos.errores.rfc && mal.datos.errores.razon_social && mal.datos.errores.cp_fiscal && mal.datos.errores.regimen);
  assert.ok((await e.post(`/pedidos/${reciente.id}/factura`, { rfc: 'XAXX010101000', razon_social: 'X', cp_fiscal: '06700', regimen: '601', uso_cfdi: 'G01', direccion_id: dirs[0].id })).datos.errores === undefined);
  const lista = (await e.get('/pedidos')).datos.find((p) => p.id === reciente.id);
  assert.equal(lista.factura, 'FAC-000001');
  const pdf = await e.get(`/pedidos/${reciente.id}/factura.pdf`);
  assert.equal(pdf.tipo, 'application/pdf'); assert.equal(pdf.datos.subarray(0, 4).toString(), '%PDF');
  assert.equal((await e.post(`/pedidos/${reciente.id}/factura`, { rfc: 'XAXX010101000', razon_social: 'X', cp_fiscal: '06700', regimen: '601', uso_cfdi: 'G01', direccion_id: dirs[0].id })).estado, 409);
  assert.equal((await e.post(`/pedidos/${reciente.id}/factura/enviar`)).estado, 200);
});

test('RF-15 / RN-9: devoluciones solo de pedidos entregados y dentro del plazo; resolución por el administrador', async () => {
  const e = navegador();
  await e.post('/auth/login', { correo: 'elizabeth.navarro@example.com', password: 'Cliente2026' });
  const pedidos = (await e.get('/pedidos')).datos;
  const entregado = pedidos.find((p) => p.estatus === 'entregado');
  const noEntregado = pedidos.find((p) => p.estatus === 'preparando');
  assert.equal((await e.post(`/pedidos/${noEntregado.id}/devolucion`, { motivo: 'Otro motivo' })).estado, 409);
  assert.equal((await e.post(`/pedidos/${entregado.id}/devolucion`, { motivo: 'inventado' })).estado, 422);
  assert.equal((await e.post(`/pedidos/${entregado.id}/devolucion`, { motivo: 'No es lo que pedí', comentarios: 'Color distinto' })).estado, 201);
  assert.equal((await e.post(`/pedidos/${entregado.id}/devolucion`, { motivo: 'No es lo que pedí' })).estado, 409);

  const adm = await loginAdmin();
  const dev = (await adm.get('/admin/devoluciones')).datos[0];
  const antes = stock('IN-003');
  assert.equal((await adm.post(`/admin/devoluciones/${dev.id}/resolver`, { decision: 'rechazada', respuesta: '' })).estado, 422);
  assert.equal((await adm.post(`/admin/devoluciones/${dev.id}/resolver`, { decision: 'aprobada', reingresar: true, respuesta: 'Aprobada' })).estado, 200);
  assert.equal(stock('IN-003'), antes + 1); // RN-22: regresa al inventario porque llegó en buen estado
  assert.equal((await e.get('/pedidos')).datos.find((p) => p.id === entregado.id).estatus, 'devuelto');

  // Fuera de plazo
  db.prepare("UPDATE pedidos SET estatus='entregado', entregado_en = ? WHERE id = ?").run(new Date(Date.now() - 20 * 86400000).toISOString(), noEntregado.id);
  assert.equal((await e.post(`/pedidos/${noEntregado.id}/devolucion`, { motivo: 'Otro motivo' })).estado, 409);
});

test('RF-18: catálogo del administrador (validaciones, código único, ocultar en vez de eliminar) e inventario', async () => {
  const adm = await loginAdmin();
  const cat = (await adm.get('/admin/categorias')).datos[0].id;
  const base = { codigo: 'TS-001', nombre: 'Prueba', categoria_id: cat, descripcion: 'Desc', material: 'Nailon', largo: 30, alto: 40, ancho: 15, colores: [{ nombre: 'Negro', hex: '#222831' }], precio: '199.50', existencias: 4, umbral: 5, estatus: 'activo', destacada: true };
  let r = await adm.post('/admin/productos', { ...base, codigo: 'IN-001', precio: '-5', existencias: '1.5', largo: 0 });
  assert.equal(r.estado, 422);
  assert.ok(r.datos.errores.codigo && r.datos.errores.precio && r.datos.errores.existencias && r.datos.errores.largo);
  r = await adm.post('/admin/productos', base);
  assert.equal(r.estado, 201);
  const id = r.datos.id;
  assert.equal(stock('TS-001'), 4);
  assert.ok((await adm.get('/admin/inventario')).datos.alertas.some((a) => a.codigo === 'TS-001')); // 4 ≤ umbral 5
  assert.equal((await adm.post('/admin/inventario/entradas', { producto_id: id, cantidad: 0 })).estado, 422);
  assert.equal((await adm.post('/admin/inventario/entradas', { producto_id: id, cantidad: 10 })).estado, 201);
  assert.ok(!(await adm.get('/admin/inventario')).datos.alertas.some((a) => a.codigo === 'TS-001')); // la alerta se quita
  assert.equal(db.prepare("SELECT COUNT(*) n FROM movimientos_inventario WHERE producto_id = ? AND tipo = 'entrada'").get(id).n, 2);
  // Producto con pedidos asociados: solo se oculta
  const conPedidos = (await adm.del(`/admin/productos/${prod('IN-003').id}`)).datos;
  assert.equal(conPedidos.oculto, true);
  assert.equal(prod('IN-003').estatus, 'oculto');
  db.prepare("UPDATE productos SET estatus='activo' WHERE codigo='IN-003'").run();
  assert.equal((await adm.del(`/admin/productos/${id}`)).datos.oculto, true); // tiene movimientos
  // Categoría con productos: solo se oculta
  assert.equal((await adm.del(`/admin/categorias/${cat}`)).datos.oculta, true);
  db.prepare("UPDATE categorias SET estatus='activa' WHERE id = ?").run(cat);
});

test('RF-3 / RF-11: destacadas nunca incluyen agotadas u ocultas; catálogo filtra y ordena', async () => {
  const n = navegador();
  db.prepare("UPDATE productos SET destacada = 1 WHERE codigo = 'JU-002'").run(); // agotada
  const dest = (await n.get('/productos/destacadas')).datos.map((p) => p.codigo);
  assert.ok(!dest.includes('JU-002'));
  const todos = (await n.get('/productos?por_pagina=48')).datos;
  assert.ok(todos.productos.find((p) => p.codigo === 'JU-002').agotado);
  const disp = (await n.get('/productos?disponibles=1&por_pagina=48')).datos;
  assert.ok(!disp.productos.some((p) => p.agotado));
  const barato = (await n.get('/productos?orden=precio_asc&min=100&max=600&por_pagina=48')).datos.productos;
  assert.ok(barato.every((p) => p.precio >= 100 && p.precio <= 600));
  assert.deepEqual(barato.map((p) => p.precio), [...barato.map((p) => p.precio)].sort((a, b) => a - b));
  assert.equal((await n.get('/productos?q=dino')).datos.total, 1);
  assert.equal((await n.get('/productos/destacadas')).datos.find((p) => p.codigo === 'IN-004').pocas_piezas, true); // RN-3
});

test('RF-7 / RN-16: estados y municipios guardados en la BD', async () => {
  const n = navegador();
  const estados = (await n.get('/geografia/estados')).datos;
  assert.equal(estados.length, 32);
  const edomex = estados.find((e) => e.nombre === 'Estado de México');
  assert.ok((await n.get(`/geografia/estados/${edomex.id}/municipios`)).datos.length >= 120);
  const { n: c } = await nuevoCliente();
  const mal = await c.post('/cuenta/direcciones', { ...DIR(), municipio_id: db.prepare('SELECT id FROM municipios WHERE estado_id = 2 LIMIT 1').get().id });
  assert.equal(mal.estado, 422); // municipio de otro estado
  assert.equal((await c.post('/cuenta/direcciones', { ...DIR(), referencias: 'x'.repeat(201) })).estado, 422);
  assert.equal((await c.post('/cuenta/direcciones', DIR())).estado, 201);
});
