import fs from 'node:fs';
import { db, aCentavos, transaccion } from './db.js';
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
// Los nombres dicen QUÉ es el producto (tipo + color o tema) y la descripción explica para quién es y qué incluye:
// el buscador usa ambos, así que conviene redactarlos con las palabras que usaría un cliente.
// El primer color de cada producto es el que aparece en su foto.
const PRODUCTOS = [
  ['IN-001', 'Mochila rosa de flores', 'Infantil', 'mochila', 30, 42, 17, 'Poliéster', ['Rosa', 'Lila'], 649, 20, 1,
    'Mochila escolar rosa con estampado de flores, pensada para niñas y niños de primaria. Tiene compartimento principal amplio para libros y cuadernos, bolsillo frontal con cierre, bolsillos laterales para botella de agua y correas acolchadas ajustables. Disponible en rosa y lila.', 'Jardín'],
  ['IN-002', 'Mochila con ruedas de unicornio', 'Infantil', 'ruedas', 32, 45, 20, 'Nailon', ['Morado', 'Rosa'], 799, 12, 0,
    'Mochila con ruedas y estampado de unicornio para que los más pequeños no carguen peso en la espalda. Incluye asa telescópica, bolsillo lateral para botella de agua y franjas reflejantes de seguridad para el camino a la escuela. Disponible en morado y rosa.', 'Fantasía'],
  ['IN-003', 'Mochila verde de dinosaurios', 'Infantil', 'mochila', 30, 42, 17, 'Poliéster', ['Verde', 'Azul'], 599, 25, 1,
    'Mochila escolar con estampado de dinosaurios (T-rex, triceratops y estegosaurio) para pequeños exploradores. Está hecha de poliéster resistente y tiene compartimento principal amplio, dos bolsillos frontales, bolsillos laterales para botella de agua y correas acolchadas ajustables. Ideal para la escuela y las aventuras de todos los días. Disponible en verde y azul.', 'Exploradores'],
  ['IN-004', 'Mochila con ruedas de galaxia', 'Infantil', 'ruedas', 32, 45, 20, 'Nailon', ['Azul marino', 'Gris'], 749, 3, 1,
    'Mochila con ruedas y estampado de galaxia con cohetes, planetas y astronautas. Tiene asa telescópica, compartimentos para organizar los útiles, base reforzada y franjas reflejantes para el camino a la escuela. Disponible en azul marino y gris.', 'Espacio'],
  ['JU-001', 'Mochila gris para laptop 15.6"', 'Juvenil', 'mochila', 33, 46, 19, 'Nailon impermeable', ['Gris', 'Negro'], 549, 18, 1,
    'Mochila juvenil para laptop de hasta 15.6 pulgadas, ideal para la secundaria, la prepa, la universidad o el trabajo. Tiene compartimento acolchado para la computadora, puerto USB externo para cargar el celular, tela impermeable, respaldo ventilado y correas ergonómicas. Disponible en gris y negro.', 'Urbana'],
  ['JU-002', 'Mochila negra antirrobo con USB', 'Juvenil', 'mochila', 32, 44, 16, 'Poliéster', ['Negro', 'Azul marino'], 629, 0, 0,
    'Mochila antirrobo con el cierre oculto contra la espalda para que nadie la abra sin que te des cuenta. Incluye puerto USB de carga, bolsillo acolchado para laptop y bolsillo secreto para cartera y celular. Pensada para moverte seguro por la ciudad y en el transporte público. Disponible en negro y azul marino.', 'Urbana'],
  ['AC-001', 'Lonchera térmica escolar', 'Accesorios', 'lonchera', 22, 18, 12, 'Poliéster', ['Azul', 'Rosa'], 199, 30, 0,
    'Lonchera térmica para llevar el almuerzo o el refrigerio a la escuela o al trabajo. Su aislamiento conserva la comida fría o caliente por más tiempo, el forro interior se limpia fácilmente y tiene cierre reforzado y asa de mano. Disponible en azul y rosa.', 'Escolar'],
  ['AC-002', 'Estuche doble para lápices', 'Accesorios', 'estuche', 22, 8, 6, 'Poliéster', ['Rojo', 'Negro'], 99, 40, 0,
    'Estuche escolar con dos compartimentos y cierres independientes para separar lápices, plumas, colores, goma y sacapuntas. Es compacto, resistente y cabe en cualquier mochila. Disponible en rojo y negro.', 'Escolar'],
];

// Nombres con los que se sembraron las primeras versiones (para actualizar bases de datos ya creadas).
const NOMBRES_ANTERIORES = {
  'IN-001': 'Rosa Floral', 'IN-002': 'Unicornio con Ruedas', 'IN-003': 'Dinos', 'IN-004': 'Espacial con Ruedas',
  'JU-001': 'Urbana Laptop 15.6"', 'JU-002': 'Antirrobo USB', 'AC-001': 'Lonchera Térmica', 'AC-002': 'Estuche Doble',
};

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

const hayUsuarios = async () => (await db.prepare('SELECT COUNT(*) n FROM usuarios').get()).n > 0;

/** Contraseñas de los usuarios de prueba (bcrypt es lento: se calcula ANTES de tocar la base de datos). */
function hashesDePrueba() {
  return {
    admin: hashPassword(USUARIOS_PRUEBA.admin.password),
    cliente: hashPassword(USUARIOS_PRUEBA.cliente.password),
    demo: hashPassword('Cliente2026'),
  };
}

/**
 * Primera ejecución: carga los datos de ejemplo en UN SOLO lote "todo o nada" (en Turso es una sola petición de red).
 * Si varias copias del servidor arrancan a la vez (Vercel), todas pueden intentar sembrar: la primera lo logra y a
 * las demás el lote se les rechaza completo (clave repetida en `configuracion`), así que nada queda duplicado ni a medias.
 */
export async function sembrarSiVacio() {
  if (!await hayUsuarios()) {
    try {
      await sembrar(hashesDePrueba());
    } catch (e) {
      if (!await hayUsuarios()) throw e; // falló por otra razón
      // otra copia del servidor sembró al mismo tiempo: no hay nada que hacer
    }
  }
  await actualizarCatalogoBase();
}

/**
 * Bases de datos creadas con la versión anterior: renombra los productos base y les pone la descripción nueva,
 * solo si el administrador no los ha modificado (su nombre sigue siendo el original). También corrige el orden
 * de colores cuyo primer color no coincidía con su foto (Dinos y Urbana). Es idempotente.
 */
export async function actualizarCatalogoBase() {
  const viejos = Object.values(NOMBRES_ANTERIORES);
  const pendientes = await db.prepare(`SELECT 1 FROM productos WHERE nombre IN (${viejos.map(() => '?').join(',')}) LIMIT 1`).get(...viejos);
  if (!pendientes) return; // lo normal: nada que actualizar (una sola consulta al arrancar)
  await transaccion(async () => {
    for (const [cod, nom, , , , , , , cols, , , , desc] of PRODUCTOS) {
      const p = await db.prepare('SELECT id, nombre FROM productos WHERE codigo = ?').get(cod);
      if (!p || p.nombre !== NOMBRES_ANTERIORES[cod]) continue;
      await db.prepare('UPDATE productos SET nombre = ?, descripcion = ? WHERE id = ?').run(nom, desc, p.id);
      await db.prepare('UPDATE pedido_items SET nombre = ? WHERE producto_id = ? AND nombre = ?').run(nom, p.id, NOMBRES_ANTERIORES[cod]);
      // El color que muestra la foto real pasa a ser el primero (se intercambian nombre y tono entre los dos registros).
      const filas = await db.prepare('SELECT id, nombre, hex, foto FROM producto_colores WHERE producto_id = ? ORDER BY id').all(p.id);
      const conFoto = filas[0]?.foto?.startsWith('/img/productos/');
      if (conFoto && filas.length > 1 && filas[0].nombre === cols[1] && filas[1].nombre === cols[0]) {
        const upd = db.prepare('UPDATE producto_colores SET nombre = ?, hex = ? WHERE id = ?');
        await upd.run('__intercambio__', filas[0].hex, filas[0].id); // el nombre de color es único por producto
        await upd.run(filas[0].nombre, filas[0].hex, filas[1].id);
        await upd.run(filas[1].nombre, filas[1].hex, filas[0].id);
        // la ilustración del segundo color tenía los tonos al revés: se invierten c1 y c2
        const ilus = filas[1].foto;
        if (ilus?.startsWith('/api/ilustracion/')) {
          const u = new URL(ilus, 'http://x');
          const [c1, c2] = [u.searchParams.get('c1'), u.searchParams.get('c2')];
          u.searchParams.set('c1', c2); u.searchParams.set('c2', c1);
          const nueva = u.pathname + u.search;
          await db.prepare('UPDATE producto_colores SET foto = ? WHERE id = ?').run(nueva, filas[1].id);
          await db.prepare('UPDATE producto_fotos SET url = ? WHERE producto_id = ? AND url = ?').run(nueva, p.id, ilus);
        }
      }
    }
  });
}

/** Arma todas las sentencias de los datos de ejemplo (ids fijos: la base está vacía). */
function sentenciasDeEjemplo(hashes) {
  const L = []; // [sql, args]
  const ins = (sql, ...args) => L.push([sql, args]);

  // ---- Configuración de la tienda (Anexo: contacto y redes; RF-18 CA8). Va PRIMERO: si otra copia ya sembró,
  //      estas claves chocan y todo el lote se rechaza.
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
  for (const [k, v] of Object.entries(cfg)) ins('INSERT INTO configuracion(clave,valor) VALUES(?,?)', k, String(v));

  // ---- Zonas y geografía (RN-16, RN-17): guardadas en la BD, sin APIs
  ins('INSERT INTO zonas_envio(id,nombre,tarifa,costo,dias_min,dias_max) VALUES(1,?,?,?,?,?)', 'Ciudad de México y Estado de México', 'Más baja', 7900, 2, 4);
  ins('INSERT INTO zonas_envio(id,nombre,tarifa,costo,dias_min,dias_max) VALUES(2,?,?,?,?,?)', 'Resto del país', 'Estándar', 14900, 4, 7);
  geografia.estados.forEach((e, i) => {
    ins('INSERT INTO estados(id,clave,nombre,zona_id) VALUES(?,?,?,?)', i + 1, e.clave, e.nombre, e.clave === '09' || e.clave === '15' ? 1 : 2);
    // municipios del estado en una sola sentencia
    for (let j = 0; j < e.municipios.length; j += 200) {
      const parte = e.municipios.slice(j, j + 200);
      ins(`INSERT INTO municipios(estado_id,nombre) VALUES ${parte.map(() => '(?,?)').join(',')}`, ...parte.flatMap((m) => [i + 1, m]));
    }
  });
  const idEstado = (clave) => geografia.estados.findIndex((e) => e.clave === clave) + 1;

  for (const [c, n] of REGIMENES) ins('INSERT INTO regimenes_fiscales VALUES(?,?)', c, n);
  for (const [c, n] of USOS) ins('INSERT INTO usos_cfdi VALUES(?,?)', c, n);

  // ---- Categorías y productos
  CATEGORIAS.forEach(([n, d], i) => ins('INSERT INTO categorias(id,nombre,descripcion,estatus,orden) VALUES(?,?,?,?,?)', i + 1, n, d, 'activa', i));
  const idCat = (n) => CATEGORIAS.findIndex(([c]) => c === n) + 1;
  const productos = new Map(); // código → { id, nombre, precio }
  PRODUCTOS.forEach(([cod, nom, cat, forma, l, a, an, mat, cols, precio, exist, dest, desc, colec], i) => {
    const pid = i + 1;
    productos.set(cod, { id: pid, codigo: cod, nombre: nom, precio: aCentavos(precio) });
    ins(`INSERT INTO productos(id,codigo,nombre,categoria_id,coleccion,descripcion,material,largo,alto,ancho,precio,existencias,umbral,estatus,destacada,forma)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, pid, cod, nom, idCat(cat), colec, desc, mat, l, a, an, aCentavos(precio), exist, cfg.umbral_defecto, 'activo', dest, forma);
    const foto = fs.existsSync(new URL(`../public/img/productos/${cod}.jpg`, import.meta.url)) ? `/img/productos/${cod}.jpg` : null;
    const fotos = [];
    cols.forEach((c, k) => {
      const hex = COLORES[c];
      const otro = COLORES[cols[(k + 1) % cols.length]];
      const url = k === 0 && foto ? foto : svg(forma, hex, otro);
      ins('INSERT INTO producto_colores(producto_id,nombre,hex,foto) VALUES(?,?,?,?)', pid, c, hex, url);
      fotos.push(url);
    });
    if (foto) fotos.push(`${svg(forma, COLORES[cols[1]], COLORES[cols[0]])}&vista=trasera`);
    fotos.forEach((u, k) => ins('INSERT INTO producto_fotos(producto_id,url,orden) VALUES(?,?,?)', pid, u, k));
  });

  // ---- Usuarios (1 = administrador, 2 = cliente de prueba, 3–7 = clientes que dejaron reseñas)
  const insU = 'INSERT INTO usuarios(id,nombres,apellido_paterno,apellido_materno,correo,password_hash,telefono,rol,acepto_privacidad,creado_en) VALUES(?,?,?,?,?,?,?,?,1,?)';
  ins(insU, 1, 'Administrador', 'Mochilas', 'Aventura', USUARIOS_PRUEBA.admin.correo, hashes.admin, null, 'administrador', hace(90));
  const cli = 2;
  ins(insU, cli, 'Elizabeth', 'Navarro', 'Duarte', USUARIOS_PRUEBA.cliente.correo, hashes.cliente, '5512345678', 'cliente', hace(60));
  const demo = [
    ['Mariana', 'Gómez', 'Ruiz'], ['Luis', 'Herrera', 'Soto'], ['Sofía', 'Castillo', 'Pérez'],
    ['Carlos', 'Rivas', 'Mena'], ['Ana', 'Torres', 'Vega'],
  ].map(([n, a, m], i) => { ins(insU, 3 + i, n, a, m, `cliente${i + 1}@example.com`, hashes.demo, null, 'cliente', hace(80 - i)); return 3 + i; });

  // ---- Direcciones del cliente de prueba
  const cdmx = idEstado('09');
  const insD = `INSERT INTO direcciones(usuario_id,alias,estado_id,municipio_id,calle,colonia,cp,num_ext,num_int,referencias)
                VALUES(?,?,?,(SELECT id FROM municipios WHERE estado_id = ? AND nombre = ?),?,?,?,?,?,?)`;
  ins(insD, cli, 'Casa', cdmx, cdmx, 'Cuauhtémoc', 'Calle del Bosque', 'Roma Norte', '06700', '123', null, 'Casa de portón negro, entre dos calles');
  ins(insD, cli, 'Oficina', cdmx, cdmx, 'Benito Juárez', 'Av. Universidad', 'Narvarte', '03020', '456', 'Piso 10', null);

  // ---- Pedidos históricos del cliente de prueba (no mueven el stock del anexo)
  let n = 0;
  const crearPedido = (estatus, creado, items, entregado = null, visto = 1) => {
    const pid = ++n;
    const filas = items.map(([cod, color, cant]) => ({ p: productos.get(cod), color, cant }));
    const subtotal = filas.reduce((s, f) => s + f.p.precio * f.cant, 0);
    const envio = subtotal >= aCentavos(999) ? 0 : 7900;
    ins(`INSERT INTO pedidos(id,folio,usuario_id,estatus,subtotal,envio,total,iva_incluido,tarjeta_ultimos4,numero_guia,zona_nombre,tiempo_estimado,
          dir_destinatario,dir_estado,dir_municipio,dir_calle,dir_colonia,dir_cp,dir_num_ext,dir_num_int,dir_referencias,visto_admin,creado_en,entregado_en)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    pid, `PED-${String(pid).padStart(6, '0')}`, cli, estatus, subtotal, envio, subtotal + envio, Math.round((subtotal * 16) / 116), '4242',
    estatus === 'enviado' || estatus === 'entregado' ? 'MX' + (1000000 + pid * 137) : null,
    'Ciudad de México y Estado de México', '2 a 4 días', 'Elizabeth Navarro Duarte', 'Ciudad de México', 'Cuauhtémoc',
    'Calle del Bosque', 'Roma Norte', '06700', '123', null, 'Casa de portón negro, entre dos calles', visto, creado, entregado);
    for (const f of filas) {
      ins('INSERT INTO pedido_items(pedido_id,producto_id,codigo,nombre,color,cantidad,precio_unitario) VALUES(?,?,?,?,?,?,?)', pid, f.p.id, f.p.codigo, f.p.nombre, f.color, f.cant, f.p.precio);
    }
    ins('INSERT INTO pedido_historial(pedido_id,estatus,nota,autor,fecha) VALUES(?,?,?,?,?)', pid, 'pagado', 'Pedido recibido y pago aprobado', 'Sistema', creado);
  };
  crearPedido('entregado', hace(8), [['IN-003', 'Verde', 1]], hace(3));
  crearPedido('enviado', hace(2), [['IN-001', 'Rosa', 1], ['AC-002', 'Rojo', 1]]);
  crearPedido('preparando', hace(0, 3), [['JU-001', 'Gris', 1]], null, 0);
  crearPedido('pagado', hace(0, 1), [['IN-004', 'Azul marino', 1], ['AC-002', 'Rojo', 1]], null, 0);
  ins("INSERT INTO folios(tipo, ultimo) VALUES('pedido', ?)", n);

  // ---- Reseñas de ejemplo (con la insignia "Verificado")
  const res = (cod, u, cal, txt, dias) =>
    ins('INSERT INTO resenas(producto_id,usuario_id,calificacion,comentario,verificado,creado_en) VALUES(?,?,?,?,1,?)', productos.get(cod).id, u, cal, txt, hace(dias));
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
  return L;
}

/** Carga los datos de ejemplo en un solo lote atómico. */
export async function sembrar(hashes = hashesDePrueba()) {
  await db.lote(sentenciasDeEjemplo(hashes));
}
