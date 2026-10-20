import fs from 'node:fs';
import { db, aCentavos, transaccion, config_, guardarConfig } from './db.js';
import { hashPassword } from './auth.js';
import { config } from './config.js';

const geografia = JSON.parse(fs.readFileSync(new URL('./data/geografia.json', import.meta.url), 'utf8'));

// Usuarios de prueba (RF anexo: "un administrador y un cliente registrado").
// Los apellidos del cliente de ejemplo son DISTINTOS a los que aparecen en los bocetos.
export const USUARIOS_PRUEBA = {
  admin: { correo: 'admin@mochilasaventuramx.com', password: 'Admin2026' },
  cliente: { correo: 'elizabeth.navarro@example.com', password: 'Cliente2026' },
};

const hace = (dias, horas = 0) => new Date(Date.now() - dias * 86_400_000 - horas * 3_600_000).toISOString();
const svg = (forma, c1, c2) => `/api/ilustracion/${forma}.svg?c1=${encodeURIComponent(c1)}&c2=${encodeURIComponent(c2)}`;

const COLORES = {
  Rosa: '#F4A6B8', Lila: '#B79CE0', Azul: '#2F6FD0', Verde: '#3BA564', Morado: '#7E4FC4',
  'Azul marino': '#1B2A5A', Gris: '#8B93A0', Negro: '#222831', Rojo: '#D93030',
};

const CATEGORIAS = [
  ['Infantil', 'Para niñas y niños de 3 a 11 años'],
  ['Juvenil', 'Unisex, de 12 años en adelante'],
  ['Accesorios', 'Loncheras y estuches'],
];

// [codigo, nombre, categoria, forma, largo, alto, ancho, material, colores, precio, existencias, destacada, descripcion, coleccion]
const PRODUCTOS = [
  ['IN-001', 'Rosa Floral', 'Infantil', 'mochila', 30, 42, 17, 'Poliéster', ['Rosa', 'Lila'], 649, 20, 1, 'Mochila escolar de diseño floral con compartimento principal amplio, bolsillos frontales con cierre y correas acolchadas ajustables. Ideal para llevar libros, cuadernos y todo lo necesario para el día.', 'Jardín'],
  ['IN-002', 'Unicornio con Ruedas', 'Infantil', 'ruedas', 32, 45, 20, 'Nailon', ['Morado', 'Rosa'], 799, 12, 0, 'Mochila con ruedas y asa telescópica para que los más pequeños no carguen peso. Diseño de unicornio, bolsillo lateral para botella y reflejantes de seguridad.', 'Fantasía'],
  ['IN-003', 'Dinos', 'Infantil', 'mochila', 30, 42, 17, 'Poliéster', ['Azul', 'Verde'], 599, 25, 1, 'La mochila escolar Dinos es perfecta para los pequeños exploradores. Confeccionada con materiales resistentes y un diseño divertido, cuenta con amplio espacio, correas acolchadas ajustables y bolsillos laterales para botellas. Ideal para llevar libros, cuadernos y todo lo necesario para la escuela y aventuras diarias.', 'Exploradores'],
  ['IN-004', 'Espacial con Ruedas', 'Infantil', 'ruedas', 32, 45, 20, 'Nailon', ['Azul marino', 'Gris'], 749, 3, 1, 'Mochila con ruedas de estampado espacial, asa telescópica y compartimentos organizados. Cuenta con franjas reflejantes y base reforzada para el uso diario.', 'Espacio'],
  ['JU-001', 'Urbana Laptop 15.6"', 'Juvenil', 'mochila', 33, 46, 19, 'Nailon impermeable', ['Negro', 'Gris'], 549, 18, 1, 'Mochila urbana con compartimento acolchado para laptop de hasta 15.6", puerto de carga USB externo y tela impermeable. Respaldo ventilado y correas ergonómicas.', 'Urbana'],
  ['JU-002', 'Antirrobo USB', 'Juvenil', 'mochila', 32, 44, 16, 'Poliéster', ['Negro', 'Azul marino'], 629, 0, 0, 'Mochila con cierre oculto antirrobo en la parte trasera, puerto USB de carga y bolsillo acolchado para laptop. Pensada para el traslado diario en la ciudad.', 'Urbana'],
  ['AC-001', 'Lonchera Térmica', 'Accesorios', 'lonchera', 22, 18, 12, 'Poliéster', ['Azul', 'Rosa'], 199, 30, 0, 'Lonchera con aislamiento térmico que conserva los alimentos frescos por más tiempo. Interior fácil de limpiar, cierre reforzado y asa de mano.', 'Escolar'],
  ['AC-002', 'Estuche Doble', 'Accesorios', 'estuche', 22, 8, 6, 'Poliéster', ['Rojo', 'Negro'], 99, 40, 0, 'Estuche de dos compartimentos con cierres independientes para separar lápices, plumas y colores. Compacto y resistente.', 'Escolar'],
];

const REGIMENES = [
  ['601', 'General de Ley Personas Morales'], ['603', 'Personas Morales con Fines no Lucrativos'],
  ['605', 'Sueldos y Salarios e Ingresos Asimilados a Salarios'], ['606', 'Arrendamiento'],
  ['612', 'Personas Físicas con Actividades Empresariales y Profesionales'], ['616', 'Sin obligaciones fiscales'],
  ['621', 'Incorporación Fiscal'], ['625', 'Actividades Empresariales con ingresos a través de Plataformas Tecnológicas'],
  ['626', 'Régimen Simplificado de Confianza (RESICO)'],
];
const USOS = [
  ['G01', 'Adquisición de mercancías'], ['G03', 'Gastos en general'], ['I04', 'Equipo de cómputo y accesorios'],
  ['D01', 'Honorarios médicos, dentales y gastos hospitalarios'], ['S01', 'Sin efectos fiscales'], ['CP01', 'Pagos'],
];

export function sembrarSiVacio() {
  const { n } = db.prepare('SELECT COUNT(*) n FROM usuarios').get();
  if (n === 0) sembrar();
}

export function sembrar() {
  transaccion(() => {
    // ---- Configuración de la tienda (Anexo: contacto y redes; RF-18 CA8)
    const cfg = {
      nombre_tienda: 'Mochilas Aventura MX', eslogan: 'Mochilas para cada aventura',
      correo_contacto: 'contacto@mochilasaventuramx.com', email_admin: 'admin@mochilasaventuramx.com',
      telefono: '55 1234 5678', whatsapp: '525512345678', horario: 'Lunes a viernes de 9:00 a 18:00 h',
      instagram: 'https://instagram.com/mochilasaventuramx', facebook: 'https://facebook.com/mochilasaventuramx',
      tiktok: 'https://tiktok.com/@mochilasaventuramx', x: 'https://x.com/mochilasaventuramx',
      video_url: 'https://www.tiktok.com/@mochilasaventuramx', // ← reemplazar por el video real de la tienda (RF-16 CA2)
      envio_gratis_desde: aCentavos(999), limite_modelo: 10, limite_pedido: 30, iva_pct: 16,
      dias_devolucion: 15, dias_carrito: 7, dias_factura_mes: 1, umbral_defecto: 5,
    };
    for (const [k, v] of Object.entries(cfg)) db.prepare('INSERT INTO configuracion(clave,valor) VALUES(?,?)').run(k, String(v));

    // ---- Zonas y geografía (RN-16, RN-17): guardadas en la BD, sin APIs
    const z1 = db.prepare('INSERT INTO zonas_envio(nombre,tarifa,costo,dias_min,dias_max) VALUES(?,?,?,?,?)').run('Ciudad de México y Estado de México', 'Más baja', 7900, 2, 4).lastInsertRowid;
    const z2 = db.prepare('INSERT INTO zonas_envio(nombre,tarifa,costo,dias_min,dias_max) VALUES(?,?,?,?,?)').run('Resto del país', 'Estándar', 14900, 4, 7).lastInsertRowid;
    const insE = db.prepare('INSERT INTO estados(clave,nombre,zona_id) VALUES(?,?,?)');
    const insM = db.prepare('INSERT INTO municipios(estado_id,nombre) VALUES(?,?)');
    for (const e of geografia.estados) {
      const id = insE.run(e.clave, e.nombre, e.clave === '09' || e.clave === '15' ? z1 : z2).lastInsertRowid;
      for (const m of e.municipios) insM.run(id, m);
    }

    for (const [c, n] of REGIMENES) db.prepare('INSERT INTO regimenes_fiscales VALUES(?,?)').run(c, n);
    for (const [c, n] of USOS) db.prepare('INSERT INTO usos_cfdi VALUES(?,?)').run(c, n);

    // ---- Categorías y productos
    CATEGORIAS.forEach(([n, d], i) => db.prepare('INSERT INTO categorias(nombre,descripcion,estatus,orden) VALUES(?,?,?,?)').run(n, d, 'activa', i));
    const idCat = (n) => db.prepare('SELECT id FROM categorias WHERE nombre = ?').get(n).id;
    for (const [cod, nom, cat, forma, l, a, an, mat, cols, precio, exist, dest, desc, colec] of PRODUCTOS) {
      const pid = db.prepare(
        `INSERT INTO productos(codigo,nombre,categoria_id,coleccion,descripcion,material,largo,alto,ancho,precio,existencias,umbral,estatus,destacada,forma)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(cod, nom, idCat(cat), colec, desc, mat, l, a, an, aCentavos(precio), exist, cfg.umbral_defecto, 'activo', dest, forma).lastInsertRowid;
      const foto = fs.existsSync(new URL(`../public/img/productos/${cod}.jpg`, import.meta.url)) ? `/img/productos/${cod}.jpg` : null;
      const fotos = [];
      cols.forEach((c, i) => {
        const hex = COLORES[c];
        const otro = COLORES[cols[(i + 1) % cols.length]];
        const url = i === 0 && foto ? foto : svg(forma, hex, otro);
        db.prepare('INSERT INTO producto_colores(producto_id,nombre,hex,foto) VALUES(?,?,?,?)').run(pid, c, hex, url);
        fotos.push(url);
      });
      if (foto) fotos.push(svg(forma, COLORES[cols[1]], COLORES[cols[0]]).replace('/api/', '/api/') + '&vista=trasera');
      fotos.forEach((u, i) => db.prepare('INSERT INTO producto_fotos(producto_id,url,orden) VALUES(?,?,?)').run(pid, u, i));
    }

    // ---- Usuarios
    const insU = db.prepare('INSERT INTO usuarios(nombres,apellido_paterno,apellido_materno,correo,password_hash,telefono,rol,acepto_privacidad,creado_en) VALUES(?,?,?,?,?,?,?,1,?)');
    insU.run('Administrador', 'Mochilas', 'Aventura', USUARIOS_PRUEBA.admin.correo, hashPassword(USUARIOS_PRUEBA.admin.password), null, 'administrador', hace(90));
    const cli = insU.run('Elizabeth', 'Navarro', 'Duarte', USUARIOS_PRUEBA.cliente.correo, hashPassword(USUARIOS_PRUEBA.cliente.password), '5512345678', 'cliente', hace(60)).lastInsertRowid;
    const demo = [
      ['Mariana', 'Gómez', 'Ruiz'], ['Luis', 'Herrera', 'Soto'], ['Sofía', 'Castillo', 'Pérez'],
      ['Carlos', 'Rivas', 'Mena'], ['Ana', 'Torres', 'Vega'],
    ].map(([n, a, m], i) => Number(insU.run(n, a, m, `cliente${i + 1}@example.com`, hashPassword('Cliente2026'), null, 'cliente', hace(80 - i)).lastInsertRowid));

    // ---- Dirección del cliente de prueba
    const edo = db.prepare("SELECT id FROM estados WHERE clave = '09'").get().id;
    const mun = db.prepare('SELECT id FROM municipios WHERE estado_id = ? AND nombre = ?').get(edo, 'Cuauhtémoc').id;
    db.prepare('INSERT INTO direcciones(usuario_id,alias,estado_id,municipio_id,calle,colonia,cp,num_ext,num_int,referencias) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(cli, 'Casa', edo, mun, 'Calle del Bosque', 'Roma Norte', '06700', '123', null, 'Casa de portón negro, entre dos calles');
    const mun2 = db.prepare('SELECT id FROM municipios WHERE estado_id = ? AND nombre = ?').get(edo, 'Benito Juárez').id;
    db.prepare('INSERT INTO direcciones(usuario_id,alias,estado_id,municipio_id,calle,colonia,cp,num_ext,num_int,referencias) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(cli, 'Oficina', edo, mun2, 'Av. Universidad', 'Narvarte', '03020', '456', 'Piso 10', null);

    // ---- Pedidos históricos del cliente de prueba (no mueven el stock del anexo)
    const prod = (cod) => db.prepare('SELECT * FROM productos WHERE codigo = ?').get(cod);
    const crearPedido = (usuarioId, estatus, creado, items, entregado = null, visto = 1) => {
      const filas = items.map(([cod, color, cant]) => ({ p: prod(cod), color, cant }));
      const subtotal = filas.reduce((s, f) => s + f.p.precio * f.cant, 0);
      const envio = subtotal >= aCentavos(999) ? 0 : 7900;
      const n = db.prepare("INSERT INTO folios(tipo,ultimo) VALUES('pedido',1) ON CONFLICT(tipo) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo").get().ultimo;
      const folio = `PED-${String(n).padStart(6, '0')}`;
      const pid = db.prepare(
        `INSERT INTO pedidos(folio,usuario_id,estatus,subtotal,envio,total,iva_incluido,tarjeta_ultimos4,numero_guia,zona_nombre,tiempo_estimado,
          dir_destinatario,dir_estado,dir_municipio,dir_calle,dir_colonia,dir_cp,dir_num_ext,dir_num_int,dir_referencias,visto_admin,creado_en,entregado_en)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(folio, usuarioId, estatus, subtotal, envio, subtotal + envio, Math.round((subtotal * 16) / 116), '4242',
        estatus === 'enviado' || estatus === 'entregado' ? 'MX' + (1000000 + n * 137) : null,
        'Ciudad de México y Estado de México', '2 a 4 días', 'Elizabeth Navarro Duarte', 'Ciudad de México', 'Cuauhtémoc',
        'Calle del Bosque', 'Roma Norte', '06700', '123', null, 'Casa de portón negro, entre dos calles', visto, creado, entregado).lastInsertRowid;
      for (const f of filas) {
        db.prepare('INSERT INTO pedido_items(pedido_id,producto_id,codigo,nombre,color,cantidad,precio_unitario) VALUES(?,?,?,?,?,?,?)')
          .run(pid, f.p.id, f.p.codigo, f.p.nombre, f.color, f.cant, f.p.precio);
      }
      db.prepare('INSERT INTO pedido_historial(pedido_id,estatus,nota,autor,fecha) VALUES(?,?,?,?,?)').run(pid, 'pagado', 'Pedido recibido y pago aprobado', 'Sistema', creado);
      return pid;
    };
    crearPedido(cli, 'entregado', hace(8), [['IN-003', 'Azul', 1]], hace(3));
    crearPedido(cli, 'enviado', hace(2), [['IN-001', 'Rosa', 1], ['AC-002', 'Rojo', 1]]);
    crearPedido(cli, 'preparando', hace(0, 3), [['JU-001', 'Negro', 1]], null, 0);
    crearPedido(cli, 'pagado', hace(0, 1), [['IN-004', 'Azul marino', 1], ['AC-002', 'Rojo', 1]], null, 0);

    // ---- Reseñas de ejemplo (con la insignia "Verificado")
    const res = (pcod, u, cal, txt, dias) =>
      db.prepare('INSERT INTO resenas(producto_id,usuario_id,calificacion,comentario,verificado,creado_en) VALUES(?,?,?,?,1,?)').run(prod(pcod).id, u, cal, txt, hace(dias));
    res('IN-003', demo[0], 5, '¡Excelente mochila! A mi hijo le encanta el diseño de los dinosaurios. Es muy espaciosa y los materiales se ven duraderos. Llegó rápido y bien empacada.', 12);
    res('IN-003', demo[1], 5, 'Muy resistente, ya lleva un mes de uso diario y se ve como nueva.', 20);
    res('IN-003', demo[2], 4, 'Buen tamaño para primaria. Los bolsillos laterales son muy útiles.', 25);
    res('IN-003', demo[3], 5, 'Color vivo y cierres firmes. Totalmente recomendada.', 30);
    res('IN-001', demo[2], 5, 'A mi hija le fascinó el diseño floral, es ligera y cómoda.', 9);
    res('IN-001', demo[4], 4, 'Bonita y bien hecha. Los colores son tal como en las fotos.', 15);
    res('IN-004', demo[0], 5, 'Las ruedas funcionan muy bien y mi hijo ya no carga el peso.', 7);
    res('JU-001', demo[3], 4, 'Cabe mi laptop sin problema y el material es impermeable.', 11);
    res('JU-001', demo[1], 4, 'Cómoda para el camino a la universidad.', 18);
    res('AC-002', demo[4], 5, 'Perfecto para los útiles, caben muchísimos lápices.', 6);
  });
}
