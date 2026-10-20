# Mochilas Aventura MX — Tienda en línea de mochilas

Tienda en línea completa (catálogo, carrito, pago simulado, pedidos, facturas, reseñas, favoritos) con su
**panel de administración**, construida a partir del documento *Requerimientos – Tienda en línea de mochilas* y los
25 bocetos de Irene.

- **Backend:** Node.js + Express
- **Base de datos:** SQLite relacional (archivo `data/mochilas.db`, se crea sola) con `better-sqlite3`
- **Frontend:** JavaScript sin framework (una sola página, rutas con URL reales), HTML y CSS propios, adaptable a móvil
- **Correo:** simulado y guardado en la base de datos (SMTP opcional con `nodemailer`)
- **Factura:** PDF generado con `pdfkit`

## Cómo ejecutarla

Requiere **Node.js 18 o superior** (probada con Node 22).

```bash
npm install
npm start
# → http://localhost:3000
```

La **primera vez** carga automáticamente los datos de ejemplo del anexo (8 mochilas, zonas de envío, 32 estados con
2,457 municipios, usuarios y pedidos de prueba). Para volver a empezar de cero: `npm run reset-db`.

### Usuarios de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@mochilasaventuramx.com` | `Admin2026` |
| Cliente | `elizabeth.navarro@example.com` | `Cliente2026` |

> Los apellidos del cliente de ejemplo (Navarro Duarte) son **distintos** a los que aparecen en los bocetos, como se pidió.

El cliente de prueba trae 4 pedidos (entregado, enviado, preparando y pagado) para probar facturas, devoluciones,
reseñas y cancelaciones sin tener que comprar primero. Tarjeta de prueba para pagar: `4111 1111 1111 1111`,
vencimiento futuro (ej. `12/30`) y CVV de 3 dígitos.

### Pruebas automáticas

```bash
npm test          # 16 pruebas de la API (rápidas)
npm run test:ui   # 4 recorridos de la interfaz real (138 verificaciones) con jsdom
```

`npm test` ejecuta 16 pruebas contra la API real (registro, correo duplicado, carrito y límites, pago, descuento de stock en transacción,
**dos compras simultáneas de las últimas piezas**, roles del panel, estatus, cancelación, reseñas, factura + PDF,
devoluciones, catálogo y geografía). `npm run test:ui` recorre la interfaz completa: visitante, registro y pago, cuenta de cliente y panel de administración.

## Estructura

```
server.js                 Arranque de Express
src/db.js                 Esquema relacional (tablas, llaves, restricciones) y utilidades
src/seed.js               Datos de ejemplo del anexo + usuarios de prueba
src/auth.js               Sesiones, cookies y verificación de rol en cada petición
src/servicios/            Reglas de negocio: catalogo, carrito, pedidos (checkout), facturas, admin
src/rutas/api.js          Endpoints  /api/...  y  /api/admin/...
src/correos.js            Plantillas de correo (comprobante, aviso al admin, estatus, devolución, factura)
src/data/geografia.json   Estados y municipios (guardados en la BD; sin APIs externas)
public/js/validators.js   Validaciones RF-20 — el MISMO archivo corre en pantalla y en servidor
public/js/vistas/         Una pantalla por archivo (inicio, catálogo, producto, carrito, checkout, cuenta, admin…)
public/css/styles.css     Diseño (paleta del logotipo: azul marino, naranja y crema)
tests/api.test.js         Pruebas automáticas
```

## Cobertura de requerimientos

| Requerimiento | Dónde está |
|---|---|
| **RF-1** Registro, acceso y roles | `/registro`, `/login`. Correo único sin distinguir mayúsculas; mensaje genérico al fallar el acceso; el rol vive en la BD; el carrito del visitante se conserva al registrarse o entrar y se regresa a la pantalla de origen |
| **RF-2** Encabezado | Logo, buscador, categorías, favoritos, carrito con contador, "Hola, Nombre" con menú; en móvil menú desplegable y solo la inicial |
| **RF-3 / RF-11 / RF-16** Inicio, destacadas, redes y video | `/`: banner, categorías, destacadas elegidas por el admin (nunca agotadas ni ocultas), sección de video + redes (se abren en pestaña nueva), compartir mochila |
| **RF-4** Catálogo y detalle | `/catalogo` (búsqueda, categorías, precio, disponibilidad, orden, cuadrícula/lista, paginación) y `/producto/:id` (galería, color, medidas Largo/Alto/Ancho, acordeones) |
| **RF-5** Carrito | Cantidad con menú 1–4 que también se puede escribir (solo enteros, mínimo 1, máximo 10 o las existencias, corrige con aviso), suma de línea repetida, aviso de envío gratis, IVA solo informativo, vigencia de 7 días |
| **RF-6 / RF-7** Pago y envíos | `/checkout/entrega` → `/checkout/pago` → confirmación (4 pasos). Zona automática por estado, validación en pantalla **y** servidor, pago simulado |
| **RF-8** Inventario | Descuento en transacción al aprobar el pago, etiqueta "¡Solo quedan N piezas!", restitución al cancelar, ajuste con aviso si cambió el stock al pagar |
| **RF-9** Factura simulada | Desde "Mis pedidos": RFC validado (con fecha), régimen y uso de CFDI, PDF descargable y envío por correo, folio `FAC-000001`, solo dentro del mes de la compra |
| **RF-10** Reseñas | Solo con compra **entregada**, una por producto, máx. 500 caracteres, insignia "Verificado", likes, orden, moderación del admin |
| **RF-12** Favoritos | Corazón en tarjetas y detalle; "Mover al carrito" verifica existencias |
| **RF-13 / RF-14 / RF-17** FAQ, políticas, contacto | FAQ por categoría en el inicio, 4 políticas desde el pie, `/contacto`; el aviso de privacidad habilita "Crear cuenta" y las políticas habilitan "Pagar" |
| **RF-15** Devoluciones y cancelaciones | Cancelar antes del envío (restituye stock); devolución solo de pedidos entregados dentro de 15 días; el admin aprueba/rechaza y la pieza regresa al inventario solo si llegó en buen estado |
| **RF-18** Panel de administración | `/admin/...`: pedidos (filtros, nuevos, estatus + guía + correo), catálogo (alta/edición/ocultar/destacar/fotos), categorías, inventario (alertas, entradas, bitácora), reseñas, devoluciones, configuración (envío, mínimo gratis, límites), correos |
| **RF-19** Mis pedidos y perfil | `/cuenta/...`: datos, direcciones, pedidos, favoritos |
| **RF-20** Validaciones | `public/js/validators.js`, compartido entre pantalla y servidor |
| **RNF-1…4** | Nombre comercial en encabezado/pie/correos/facturas; adaptable a móvil; ≤5 pasos de compra; mensajes en español; 300 peticiones simultáneas sin errores; **dos compras simultáneas no venden de más**; BD relacional con rol verificado en cada petición y bitácora de movimientos |

## Decisiones y supuestos (revísalos)

1. **"Compra completada" = pedido entregado.** Solo así se puede reseñar o dar like a una mochila.
2. **Documento sobre bocetos.** Cuando no coinciden, se siguió el documento (ver tabla siguiente) y los bocetos para el diseño visual.
3. **Pago simulado:** se aprueba si los formatos cumplen RF-20 (sin algoritmo de Luhn, porque el documento no lo pide). No se guarda el número completo ni el CVV: solo los últimos 4 dígitos.
4. **Estatus:** pagado → preparando → enviado → entregado (no retroceden); "enviado" exige número de guía. Además existen *cancelado* y *devuelto*.
5. **Carrito de visitantes:** se guarda en el servidor ligado a una cookie y se fusiona con la cuenta al entrar.
6. **Correos:** sin SMTP se guardan en la BD y se ven en *Administración → Correos*. Para correo real, copia `.env.example` a `.env` con tus datos SMTP.
7. **Dinero** en centavos enteros (sin errores de redondeo); precios con IVA incluido y el IVA solo como desglose (`monto × 16 / 116`).

## Diferencias entre bocetos y documento

| Boceto | Qué se hizo |
|---|---|
| Usuaria "Elizabeth Ramírez Claudio" | Se cambiaron los apellidos (Navarro Duarte) |
| FAQ con errores ("¿Cómo lugar un orden?") | Se usaron las preguntas redactadas del anexo |
| Carrito: "Compra $72 más" con subtotal $848 | Se calcula bien: $999 − $848 = **$151** |
| Pago: "Envío Gratis" con total $927 | Gratis solo desde $999 (RN-6) |
| Logo de PayPal en el pie | Se omitió: el único medio es tarjeta de crédito/débito (RF-6) |
| `hola@…` en el pie | Se usó `contacto@mochilasaventuramx.com` del anexo (configurable) |
| Catálogo con otros productos y precios tachados | Se usaron los 8 productos del anexo |
| Estatus "En proceso" / "Pago pendiente" | Se usaron los de RF-7 (+ cancelado) |
| Folios `#MX-2026-0045` / `ORD-12345` | Se usó `PED-000124` y `FAC-000001` (RN-20) |

## Antes de entregar o publicar

- **Video real (RF-16 CA2 / RNF-1 CA3):** no se puede generar un video real desde el código. Publica uno en una red social de la tienda y
  pega su enlace en *Administración → Configuración → Video de la tienda* (admite YouTube, archivo `.mp4` o enlace a la red social). Mientras tanto la sección
  enlaza al perfil de TikTok de ejemplo.
- **Fotos:** las de Rosa Floral, Dinos, Espacial, Urbana y el Estuche son recortes de los bocetos (baja resolución). Unicornio, Antirrobo y
  Lonchera usan ilustraciones SVG de respaldo. Sube fotos reales desde *Administración → Catálogo*.
- **Datos de contacto y redes:** son los de ejemplo del anexo; cámbialos en la tabla `configuracion`.
- **Producción:** define `NODE_ENV=production` y usa HTTPS (las cookies pasan a `Secure`).
