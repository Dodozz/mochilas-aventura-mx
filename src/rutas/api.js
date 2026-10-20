import express from 'express';
import { db, ErrorApi, ahora, config_, aPesos } from '../db.js';
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
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); // captura errores async

const publicUsuario = (u) => u && { id: u.id, nombres: u.nombres, apellido_paterno: u.apellido_paterno, apellido_materno: u.apellido_materno, correo: u.correo, telefono: u.telefono, rol: u.rol };

// ============================================================ Tienda: configuración y contenido
api.get('/tienda', (req, res) => {
  const c = (k) => config_(k);
  res.json({
    nombre: c('nombre_tienda'), eslogan: c('eslogan'), correo: c('correo_contacto'), telefono: c('telefono'), whatsapp: c('whatsapp'), horario: c('horario'),
    redes: { instagram: c('instagram'), facebook: c('facebook'), tiktok: c('tiktok'), x: c('x'), whatsapp: `https://wa.me/${c('whatsapp')}` },
    video_url: c('video_url'),
    envio_gratis_desde: aPesos(Number(c('envio_gratis_desde'))),
    limite_modelo: Number(c('limite_modelo')), limite_pedido: Number(c('limite_pedido')),
    dias_devolucion: Number(c('dias_devolucion')),
    zonas: db.prepare('SELECT nombre, tarifa, costo, dias_min, dias_max FROM zonas_envio ORDER BY id').all().map((z) => ({ ...z, costo: aPesos(z.costo) })),
    categorias: catalogo.categoriasActivas(),
    motivos_devolucion: pedidos.MOTIVOS_DEVOLUCION,
  });
});

api.get('/ilustracion/:forma.svg', (req, res) => {
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(ilustracion(req.params.forma, req.query.c1, req.query.c2, req.query.vista));
});

api.get('/geografia/estados', (_req, res) => res.json(pedidos.listarEstados()));
api.get('/geografia/estados/:id/municipios', (req, res) => res.json(pedidos.listarMunicipios(Number(req.params.id))));
api.get('/fiscal', (_req, res) => res.json(facturas.catalogosFiscales()));

// ============================================================ Catálogo
api.get('/productos', (req, res) => res.json(catalogo.listarCatalogo(req.query, req.usuario?.id)));
api.get('/productos/destacadas', (req, res) => res.json(catalogo.listarDestacadas(req.usuario?.id)));
api.get('/productos/:id', (req, res) => res.json(catalogo.detalleProducto(Number(req.params.id), req.usuario?.id)));
api.get('/productos/:id/resenas', (req, res) => res.json({
  resumen: catalogo.resumenResenas(Number(req.params.id)),
  resenas: catalogo.listarResenas(Number(req.params.id), req.query.orden, req.usuario?.id),
}));
api.post('/productos/:id/resenas', requiereSesion, (req, res) => {
  catalogo.crearResena(req.usuario.id, Number(req.params.id), req.body);
  res.status(201).json({ ok: true, mensaje: '¡Gracias por tu reseña!' });
});
api.post('/resenas/:id/like', requiereSesion, (req, res) => res.json(catalogo.alternarLike(req.usuario.id, Number(req.params.id))));

// ============================================================ Cuenta: registro, acceso, perfil
api.get('/sesion', (req, res) => res.json({ usuario: publicUsuario(req.usuario), piezas: carrito.contarPiezas(duenoCarrito(req)) }));

api.post('/auth/registro', (req, res) => {
  const d = req.body || {};
  const errores = validarRegistro(d);
  if (Object.keys(errores).length) throw new ErrorApi(422, 'Revisa los campos marcados.', { errores });
  // RF-1 CA9 / RN-23: se verifica en la BD sin distinguir mayúsculas
  if (db.prepare('SELECT 1 FROM usuarios WHERE correo = ? COLLATE NOCASE').get(String(d.correo).trim())) {
    throw new ErrorApi(409, 'Este correo ya está registrado. Inicia sesión o usa otro correo', { errores: { correo: 'Este correo ya está registrado. Inicia sesión o usa otro correo' }, correo_duplicado: true });
  }
  const id = Number(db.prepare(
    `INSERT INTO usuarios(nombres, apellido_paterno, apellido_materno, correo, password_hash, rol, acepto_privacidad, creado_en) VALUES(?,?,?,?,?,'cliente',1,?)`
  ).run(limpiar(d.nombres), limpiar(d.apellido_paterno), limpiar(d.apellido_materno), String(d.correo).trim(), hashPassword(d.password), ahora()).lastInsertRowid);
  carrito.fusionar(req.visitante, id);
  iniciarSesion(res, id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  res.status(201).json({ usuario: publicUsuario(u), mensaje: `¡Bienvenido, ${u.nombres}!` });
});

api.post('/auth/login', limitarIntentos, (req, res) => {
  const { correo, password } = req.body || {};
  const u = validarCorreo(correo) ? null : db.prepare('SELECT * FROM usuarios WHERE correo = ? COLLATE NOCASE').get(String(correo).trim());
  // Mensaje genérico: no revela cuál de los dos datos falló (RF-1 CA8)
  if (!u || !verificarPassword(String(password ?? ''), u.password_hash)) throw new ErrorApi(401, 'Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.');
  olvidarIntentos(req);
  carrito.fusionar(req.visitante, u.id);
  iniciarSesion(res, u.id);
  res.json({ usuario: publicUsuario(u) });
});

api.post('/auth/logout', (req, res) => { cerrarSesion(req, res); res.json({ ok: true }); });

api.get('/cuenta/perfil', requiereSesion, (req, res) => res.json(publicUsuario(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id))));
api.put('/cuenta/perfil', requiereSesion, (req, res) => {
  const d = req.body || {};
  const errores = validarPerfil(d);
  if (Object.keys(errores).length) throw new ErrorApi(422, 'Revisa los campos marcados.', { errores });
  db.prepare('UPDATE usuarios SET nombres = ?, apellido_paterno = ?, apellido_materno = ?, telefono = ? WHERE id = ?')
    .run(limpiar(d.nombres), limpiar(d.apellido_paterno), limpiar(d.apellido_materno), soloDigitos(d.telefono) || null, req.usuario.id);
  res.json({ usuario: publicUsuario(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id)), mensaje: 'Tus datos se guardaron.' });
});

api.get('/cuenta/direcciones', requiereSesion, (req, res) => res.json(pedidos.listarDirecciones(req.usuario.id)));
api.post('/cuenta/direcciones', requiereSesion, (req, res) => res.status(201).json({ id: pedidos.guardarDireccion(req.usuario.id, req.body || {}) }));
api.put('/cuenta/direcciones/:id', requiereSesion, (req, res) => res.json({ id: pedidos.guardarDireccion(req.usuario.id, req.body || {}, Number(req.params.id)) }));
api.delete('/cuenta/direcciones/:id', requiereSesion, (req, res) => { pedidos.eliminarDireccion(req.usuario.id, Number(req.params.id)); res.json({ ok: true }); });

api.get('/cuenta/favoritos', requiereSesion, (req, res) => res.json(catalogo.listarFavoritos(req.usuario.id)));
api.post('/favoritos/:id', requiereSesion, (req, res) => res.json(catalogo.alternarFavorito(req.usuario.id, Number(req.params.id))));

// ============================================================ Carrito (visitantes y clientes)
api.get('/carrito', (req, res) => res.json(carrito.leerCarrito(duenoCarrito(req))));
api.post('/carrito', (req, res) => {
  const r = carrito.agregar(duenoCarrito(req), req.body || {});
  res.status(201).json({ ...r, piezas: carrito.contarPiezas(duenoCarrito(req)) });
});
api.put('/carrito/:id', (req, res) => {
  const r = carrito.actualizarCantidad(duenoCarrito(req), Number(req.params.id), req.body?.cantidad);
  res.json({ ...r, carrito: carrito.leerCarrito(duenoCarrito(req)) });
});
api.delete('/carrito/:id', (req, res) => {
  carrito.eliminar(duenoCarrito(req), Number(req.params.id));
  res.json({ carrito: carrito.leerCarrito(duenoCarrito(req)) });
});

// ============================================================ Checkout y pedidos (solo clientes con sesión, RN-1)
api.get('/checkout/resumen', requiereSesion, (req, res) => res.json(pedidos.resumenCheckout({ usuarioId: req.usuario.id }, req.query.estado_id)));
api.post('/checkout/pagar', requiereSesion, (req, res) => res.status(201).json(pedidos.pagar(req.usuario, req.body || {})));

api.get('/pedidos', requiereSesion, (req, res) => res.json(pedidos.listarPedidosCliente(req.usuario.id)));
api.get('/pedidos/:id', requiereSesion, (req, res) => {
  const p = pedidos.pedidoDeCliente(req.usuario.id, Number(req.params.id));
  res.json(pedidos.formatearPedido(p));
});
api.post('/pedidos/:id/cancelar', requiereSesion, (req, res) => { pedidos.cancelarPedido(req.usuario, Number(req.params.id)); res.json({ mensaje: 'Tu pedido fue cancelado y te enviamos la confirmación por correo.' }); });
api.post('/pedidos/:id/devolucion', requiereSesion, (req, res) => {
  pedidos.solicitarDevolucion(req.usuario, Number(req.params.id), req.body || {});
  res.status(201).json({ mensaje: 'Recibimos tu solicitud de devolución. Te avisaremos por correo cuando la revisemos.' });
});

// Facturas (RF-9)
api.post('/pedidos/:id/factura', requiereSesion, ah(async (req, res) => {
  const r = await facturas.solicitarFactura(req.usuario, Number(req.params.id), req.body || {});
  res.status(201).json({ ...r, mensaje: `Factura ${r.folio} generada y enviada a ${req.usuario.correo}.` });
}));
api.get('/pedidos/:id/factura.pdf', requiereSesion, ah(async (req, res) => {
  const { factura, pedido } = facturas.facturaDePedido(req.usuario, Number(req.params.id));
  const pdf = await facturas.generarPdf(factura, pedido);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${factura.folio}.pdf"`, 'Content-Length': pdf.length }).send(pdf);
}));
api.post('/pedidos/:id/factura/enviar', requiereSesion, ah(async (req, res) => {
  const { factura, pedido } = facturas.facturaDePedido(req.usuario, Number(req.params.id));
  await facturas.enviarFacturaPorCorreo(req.usuario, factura, pedido);
  res.json({ mensaje: `Te enviamos la factura ${factura.folio} a ${req.usuario.correo}.` });
}));

// ============================================================ Panel de administración (rol verificado en la BD en CADA petición)
export const panel = express.Router();
panel.use(requiereAdmin);
panel.get('/contadores', (_req, res) => res.json(admin.contadores()));

panel.get('/pedidos', (req, res) => res.json({ ...admin.listarPedidosAdmin(req.query), contadores: admin.contadores() }));
panel.get('/pedidos/:id', (req, res) => res.json(admin.detallePedidoAdmin(Number(req.params.id))));
panel.put('/pedidos/:id/estatus', (req, res) => { admin.cambiarEstatus(req.usuario, Number(req.params.id), req.body || {}); res.json({ mensaje: 'Estatus actualizado y cliente notificado por correo.' }); });

panel.get('/categorias', (_req, res) => res.json(admin.listarCategorias()));
panel.post('/categorias', (req, res) => { admin.guardarCategoria(req.body || {}); res.status(201).json({ ok: true }); });
panel.put('/categorias/:id', (req, res) => { admin.guardarCategoria({ ...req.body, id: Number(req.params.id) }); res.json({ ok: true }); });
panel.delete('/categorias/:id', (req, res) => res.json(admin.eliminarCategoria(Number(req.params.id))));

panel.get('/productos', (_req, res) => res.json({ productos: admin.listarProductosAdmin(), categorias: admin.listarCategorias() }));
panel.post('/productos', (req, res) => res.status(201).json({ id: admin.guardarProducto(req.usuario, req.body || {}) }));
panel.put('/productos/:id', (req, res) => res.json({ id: admin.guardarProducto(req.usuario, { ...req.body, id: Number(req.params.id) }) }));
panel.post('/productos/:id/destacada', (req, res) => res.json(admin.alternarDestacada(Number(req.params.id))));
panel.post('/productos/:id/estatus', (req, res) => res.json(admin.alternarEstatus(Number(req.params.id))));
panel.delete('/productos/:id', (req, res) => res.json(admin.eliminarProducto(Number(req.params.id))));
panel.post('/fotos', (req, res) => res.status(201).json({ url: admin.guardarFoto(req.body?.datos) }));

panel.get('/inventario', (_req, res) => res.json(admin.inventario()));
panel.post('/inventario/entradas', (req, res) => res.status(201).json(admin.registrarEntrada(req.usuario, req.body || {})));

panel.get('/devoluciones', (_req, res) => res.json(admin.listarDevoluciones()));
panel.post('/devoluciones/:id/resolver', (req, res) => { admin.resolverDevolucion(req.usuario, Number(req.params.id), req.body || {}); res.json({ mensaje: 'Resolución registrada y cliente notificado por correo.' }); });

panel.get('/resenas', (_req, res) => res.json(admin.listarResenasAdmin()));
panel.post('/resenas/:id/alternar', (req, res) => res.json(admin.alternarResena(Number(req.params.id))));

panel.get('/configuracion', (_req, res) => res.json(admin.leerConfiguracion()));
panel.put('/configuracion', (req, res) => { admin.guardarConfiguracion(req.body || {}); res.json({ mensaje: 'Configuración guardada.' }); });

panel.get('/correos', (_req, res) => res.json(admin.listarCorreos()));
panel.get('/correos/:id', (req, res) => {
  const c = admin.correoPorId(Number(req.params.id));
  if (!c) throw new ErrorApi(404, 'El correo no existe.');
  res.json(c);
});

api.use('/admin', panel);
