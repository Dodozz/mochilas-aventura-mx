import express from 'express';
import { db, ErrorApi, ahora, configuracion, aPesos } from '../db.js';
import {
  hashPassword, verificarPassword, iniciarSesion, cerrarSesion, requiereSesion, requiereAdmin, duenoCarrito, limitarIntentos, olvidarIntentos,
} from '../auth.js';
import { validarRegistro, validarPerfil, validarCorreo, soloDigitos, limpiar } from '../validadores.js';
import * as catalogo from '../servicios/catalogo.js';
import * as carrito from '../servicios/carrito.js';
import * as pedidos from '../servicios/pedidos.js';
import * as facturas from '../servicios/facturas.js';
import * as admin from '../servicios/admin.js';
import { ilustracion } from '../ilustraciones.js';

export const api = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next); // captura errores async

/** Router donde TODOS los manejadores pueden ser async: sus errores llegan al manejador central (no tumban el servidor). */
function enrutador() {
  const r = express.Router();
  for (const m of ['get', 'post', 'put', 'delete', 'use']) {
    const original = r[m].bind(r);
    r[m] = (...args) => original(...args.map((a) => (typeof a === 'function' && a.length < 4 && !a.stack ? ah(a) : a)));
  }
  return r;
}

const publicUsuario = (u) => u && { id: u.id, nombres: u.nombres, apellido_paterno: u.apellido_paterno, apellido_materno: u.apellido_materno, correo: u.correo, telefono: u.telefono, rol: u.rol };
const rutas = enrutador();

// ============================================================ Tienda: configuración y contenido
rutas.get('/tienda', async (req, res) => {
  const [c, zonas, categorias] = await Promise.all([
    configuracion(),
    db.prepare('SELECT nombre, tarifa, costo, dias_min, dias_max FROM zonas_envio ORDER BY id').all(),
    catalogo.categoriasActivas(),
  ]);
  res.json({
    nombre: c.nombre_tienda, eslogan: c.eslogan, correo: c.correo_contacto, telefono: c.telefono, whatsapp: c.whatsapp, horario: c.horario,
    redes: { instagram: c.instagram, facebook: c.facebook, tiktok: c.tiktok, x: c.x, whatsapp: `https://wa.me/${c.whatsapp}` },
    video_url: c.video_url,
    envio_gratis_desde: aPesos(Number(c.envio_gratis_desde)),
    limite_modelo: Number(c.limite_modelo), limite_pedido: Number(c.limite_pedido),
    dias_devolucion: Number(c.dias_devolucion),
    zonas: zonas.map((z) => ({ ...z, costo: aPesos(z.costo) })),
    categorias,
    motivos_devolucion: pedidos.MOTIVOS_DEVOLUCION,
  });
});

rutas.get('/ilustracion/:forma.svg', (req, res) => {
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(ilustracion(req.params.forma, req.query.c1, req.query.c2, req.query.vista));
});

rutas.get('/geografia/estados', async (_req, res) => res.json(await pedidos.listarEstados()));
rutas.get('/geografia/estados/:id/municipios', async (req, res) => res.json(await pedidos.listarMunicipios(Number(req.params.id))));
rutas.get('/fiscal', async (_req, res) => res.json(await facturas.catalogosFiscales()));

// ============================================================ Catálogo
rutas.get('/productos', async (req, res) => res.json(await catalogo.listarCatalogo(req.query, req.usuario?.id)));
rutas.get('/productos/destacadas', async (req, res) => res.json(await catalogo.listarDestacadas(req.usuario?.id)));
rutas.get('/productos/:id', async (req, res) => res.json(await catalogo.detalleProducto(Number(req.params.id), req.usuario?.id)));
rutas.get('/productos/:id/resenas', async (req, res) => {
  const [resumen, resenas] = await Promise.all([
    catalogo.resumenResenas(Number(req.params.id)),
    catalogo.listarResenas(Number(req.params.id), req.query.orden, req.usuario?.id),
  ]);
  res.json({ resumen, resenas });
});
rutas.post('/productos/:id/resenas', requiereSesion, async (req, res) => {
  await catalogo.crearResena(req.usuario.id, Number(req.params.id), req.body);
  res.status(201).json({ ok: true, mensaje: '¡Gracias por tu reseña!' });
});
rutas.post('/resenas/:id/like', requiereSesion, async (req, res) => res.json(await catalogo.alternarLike(req.usuario.id, Number(req.params.id))));

// ============================================================ Cuenta: registro, acceso, perfil
rutas.get('/sesion', async (req, res) => res.json({ usuario: publicUsuario(req.usuario), piezas: await carrito.contarPiezas(duenoCarrito(req)) }));

rutas.post('/auth/registro', async (req, res) => {
  const d = req.body || {};
  const errores = validarRegistro(d);
  if (Object.keys(errores).length) throw new ErrorApi(422, 'Revisa los campos marcados.', { errores });
  const duplicado = () => new ErrorApi(409, 'Este correo ya está registrado. Inicia sesión o usa otro correo', { errores: { correo: 'Este correo ya está registrado. Inicia sesión o usa otro correo' }, correo_duplicado: true });
  // RF-1 CA9 / RN-23: se verifica en la BD sin distinguir mayúsculas
  if (await db.prepare('SELECT 1 FROM usuarios WHERE correo = ? COLLATE NOCASE').get(String(d.correo).trim())) throw duplicado();
  let id;
  try {
    id = Number((await db.prepare(
      `INSERT INTO usuarios(nombres, apellido_paterno, apellido_materno, correo, password_hash, rol, acepto_privacidad, creado_en) VALUES(?,?,?,?,?,'cliente',1,?)`
    ).run(limpiar(d.nombres), limpiar(d.apellido_paterno), limpiar(d.apellido_materno), String(d.correo).trim(), hashPassword(d.password), ahora())).lastInsertRowid);
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) throw duplicado(); // dos registros simultáneos con el mismo correo
    throw e;
  }
  await carrito.fusionar(req.visitante, id);
  await iniciarSesion(res, id);
  const u = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  res.status(201).json({ usuario: publicUsuario(u), mensaje: `¡Bienvenido, ${u.nombres}!` });
});

rutas.post('/auth/login', limitarIntentos, async (req, res) => {
  const { correo, password } = req.body || {};
  const u = validarCorreo(correo) ? null : await db.prepare('SELECT * FROM usuarios WHERE correo = ? COLLATE NOCASE').get(String(correo).trim());
  // Mensaje genérico: no revela cuál de los dos datos falló (RF-1 CA8)
  if (!u || !verificarPassword(String(password ?? ''), u.password_hash)) throw new ErrorApi(401, 'Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.');
  olvidarIntentos(req);
  await carrito.fusionar(req.visitante, u.id);
  await iniciarSesion(res, u.id);
  res.json({ usuario: publicUsuario(u) });
});

rutas.post('/auth/logout', async (req, res) => { await cerrarSesion(req, res); res.json({ ok: true }); });

rutas.get('/cuenta/perfil', requiereSesion, async (req, res) => res.json(publicUsuario(await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id))));
rutas.put('/cuenta/perfil', requiereSesion, async (req, res) => {
  const d = req.body || {};
  const errores = validarPerfil(d);
  if (Object.keys(errores).length) throw new ErrorApi(422, 'Revisa los campos marcados.', { errores });
  await db.prepare('UPDATE usuarios SET nombres = ?, apellido_paterno = ?, apellido_materno = ?, telefono = ? WHERE id = ?')
    .run(limpiar(d.nombres), limpiar(d.apellido_paterno), limpiar(d.apellido_materno), soloDigitos(d.telefono) || null, req.usuario.id);
  res.json({ usuario: publicUsuario(await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id)), mensaje: 'Tus datos se guardaron.' });
});

rutas.get('/cuenta/direcciones', requiereSesion, async (req, res) => res.json(await pedidos.listarDirecciones(req.usuario.id)));
rutas.post('/cuenta/direcciones', requiereSesion, async (req, res) => res.status(201).json({ id: await pedidos.guardarDireccion(req.usuario.id, req.body || {}) }));
rutas.put('/cuenta/direcciones/:id', requiereSesion, async (req, res) => res.json({ id: await pedidos.guardarDireccion(req.usuario.id, req.body || {}, Number(req.params.id)) }));
rutas.delete('/cuenta/direcciones/:id', requiereSesion, async (req, res) => { await pedidos.eliminarDireccion(req.usuario.id, Number(req.params.id)); res.json({ ok: true }); });

rutas.get('/cuenta/favoritos', requiereSesion, async (req, res) => res.json(await catalogo.listarFavoritos(req.usuario.id)));
rutas.post('/favoritos/:id', requiereSesion, async (req, res) => res.json(await catalogo.alternarFavorito(req.usuario.id, Number(req.params.id))));

// ============================================================ Carrito (visitantes y clientes)
rutas.get('/carrito', async (req, res) => res.json(await carrito.leerCarrito(duenoCarrito(req))));
rutas.post('/carrito', async (req, res) => {
  const r = await carrito.agregar(duenoCarrito(req), req.body || {});
  res.status(201).json({ ...r, piezas: await carrito.contarPiezas(duenoCarrito(req)) });
});
rutas.put('/carrito/:id', async (req, res) => {
  const r = await carrito.actualizarCantidad(duenoCarrito(req), Number(req.params.id), req.body?.cantidad);
  res.json({ ...r, carrito: await carrito.leerCarrito(duenoCarrito(req)) });
});
rutas.delete('/carrito/:id', async (req, res) => {
  await carrito.eliminar(duenoCarrito(req), Number(req.params.id));
  res.json({ carrito: await carrito.leerCarrito(duenoCarrito(req)) });
});

// ============================================================ Checkout y pedidos (solo clientes con sesión, RN-1)
rutas.get('/checkout/resumen', requiereSesion, async (req, res) => res.json(await pedidos.resumenCheckout({ usuarioId: req.usuario.id }, req.query.estado_id)));
rutas.post('/checkout/pagar', requiereSesion, async (req, res) => res.status(201).json(await pedidos.pagar(req.usuario, req.body || {})));

rutas.get('/pedidos', requiereSesion, async (req, res) => res.json(await pedidos.listarPedidosCliente(req.usuario.id)));
rutas.get('/pedidos/:id', requiereSesion, async (req, res) => {
  const p = await pedidos.pedidoDeCliente(req.usuario.id, Number(req.params.id));
  res.json(await pedidos.formatearPedido(p));
});
rutas.post('/pedidos/:id/cancelar', requiereSesion, async (req, res) => { await pedidos.cancelarPedido(req.usuario, Number(req.params.id)); res.json({ mensaje: 'Tu pedido fue cancelado y te enviamos la confirmación por correo.' }); });
rutas.post('/pedidos/:id/devolucion', requiereSesion, async (req, res) => {
  await pedidos.solicitarDevolucion(req.usuario, Number(req.params.id), req.body || {});
  res.status(201).json({ mensaje: 'Recibimos tu solicitud de devolución. Te avisaremos por correo cuando la revisemos.' });
});

// Facturas (RF-9)
rutas.post('/pedidos/:id/factura', requiereSesion, async (req, res) => {
  const r = await facturas.solicitarFactura(req.usuario, Number(req.params.id), req.body || {});
  res.status(201).json({ ...r, mensaje: `Factura ${r.folio} generada y enviada a ${req.usuario.correo}.` });
});
rutas.get('/pedidos/:id/factura.pdf', requiereSesion, async (req, res) => {
  const { factura, pedido } = await facturas.facturaDePedido(req.usuario, Number(req.params.id));
  const pdf = await facturas.generarPdf(factura, pedido);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${factura.folio}.pdf"`, 'Content-Length': pdf.length }).send(pdf);
});
rutas.post('/pedidos/:id/factura/enviar', requiereSesion, async (req, res) => {
  const { factura, pedido } = await facturas.facturaDePedido(req.usuario, Number(req.params.id));
  await facturas.enviarFacturaPorCorreo(req.usuario, factura, pedido);
  res.json({ mensaje: `Te enviamos la factura ${factura.folio} a ${req.usuario.correo}.` });
});

// ============================================================ Panel de administración (rol verificado en la BD en CADA petición)
export const panel = enrutador();
panel.use(requiereAdmin);
panel.get('/contadores', async (_req, res) => res.json(await admin.contadores()));

panel.get('/pedidos', async (req, res) => {
  const [lista, contadores] = await Promise.all([admin.listarPedidosAdmin(req.query), admin.contadores()]);
  res.json({ ...lista, contadores });
});
panel.get('/pedidos/:id', async (req, res) => res.json(await admin.detallePedidoAdmin(Number(req.params.id))));
panel.put('/pedidos/:id/estatus', async (req, res) => { await admin.cambiarEstatus(req.usuario, Number(req.params.id), req.body || {}); res.json({ mensaje: 'Estatus actualizado y cliente notificado por correo.' }); });

panel.get('/categorias', async (_req, res) => res.json(await admin.listarCategorias()));
panel.post('/categorias', async (req, res) => { await admin.guardarCategoria(req.body || {}); res.status(201).json({ ok: true }); });
panel.put('/categorias/:id', async (req, res) => { await admin.guardarCategoria({ ...req.body, id: Number(req.params.id) }); res.json({ ok: true }); });
panel.delete('/categorias/:id', async (req, res) => res.json(await admin.eliminarCategoria(Number(req.params.id))));

panel.get('/productos', async (_req, res) => {
  const [productos, categorias] = await Promise.all([admin.listarProductosAdmin(), admin.listarCategorias()]);
  res.json({ productos, categorias });
});
panel.post('/productos', async (req, res) => res.status(201).json({ id: await admin.guardarProducto(req.usuario, req.body || {}) }));
panel.put('/productos/:id', async (req, res) => res.json({ id: await admin.guardarProducto(req.usuario, { ...req.body, id: Number(req.params.id) }) }));
panel.post('/productos/:id/destacada', async (req, res) => res.json(await admin.alternarDestacada(Number(req.params.id))));
panel.post('/productos/:id/estatus', async (req, res) => res.json(await admin.alternarEstatus(Number(req.params.id))));
panel.delete('/productos/:id', async (req, res) => res.json(await admin.eliminarProducto(Number(req.params.id))));
panel.post('/fotos', async (req, res) => res.status(201).json({ url: await admin.guardarFoto(req.body?.datos) }));

panel.get('/inventario', async (_req, res) => res.json(await admin.inventario()));
panel.post('/inventario/entradas', async (req, res) => res.status(201).json(await admin.registrarEntrada(req.usuario, req.body || {})));

panel.get('/devoluciones', async (_req, res) => res.json(await admin.listarDevoluciones()));
panel.post('/devoluciones/:id/resolver', async (req, res) => { await admin.resolverDevolucion(req.usuario, Number(req.params.id), req.body || {}); res.json({ mensaje: 'Resolución registrada y cliente notificado por correo.' }); });

panel.get('/resenas', async (_req, res) => res.json(await admin.listarResenasAdmin()));
panel.post('/resenas/:id/alternar', async (req, res) => res.json(await admin.alternarResena(Number(req.params.id))));

panel.get('/configuracion', async (_req, res) => res.json(await admin.leerConfiguracion()));
panel.put('/configuracion', async (req, res) => { await admin.guardarConfiguracion(req.body || {}); res.json({ mensaje: 'Configuración guardada.' }); });

panel.get('/correos', async (_req, res) => res.json(await admin.listarCorreos()));
panel.get('/correos/:id', async (req, res) => {
  const c = await admin.correoPorId(Number(req.params.id));
  if (!c) throw new ErrorApi(404, 'El correo no existe.');
  res.json(c);
});

rutas.use('/admin', panel);
api.use(rutas);
