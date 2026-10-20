import { estado, esc, $, ico, logoIcono, post, toast, errorToast, campoPassword, ojoPassword, datosForm, marcarErrores, errorCampo } from '../util.js';
import { validarRegistro, validarNombre, validarCorreo, validarPassword } from '../validators.js';

const destino = (ctx) => {
  const v = ctx.query.get('volver');
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/'; // solo rutas internas
};

export async function render(ctx) {
  const esLogin = ctx.params[0] === 'login';
  if (estado.usuario) return ctx.navegar(destino(ctx), { reemplazar: true });
  ctx.titulo(esLogin ? 'Iniciar sesión' : 'Crear cuenta');
  const volver = ctx.query.get('volver') ? `?volver=${encodeURIComponent(ctx.query.get('volver'))}` : '';
  ctx.contenedor.innerHTML = esLogin ? vistaLogin(volver) : vistaRegistro(volver);
  ojoPassword(ctx.contenedor);
  const form = $('form', ctx.contenedor);
  (esLogin ? loginEventos : registroEventos)(ctx, form);
}

const vistaLogin = (volver) => `<div class="contenedor auth-pagina"><div class="auth-card">
  <div class="logo-c">${logoIcono()}</div><h1>Iniciar sesión</h1><p class="sub">Accede a tu cuenta</p>
  <div id="alerta"></div>
  <form novalidate>
    <div class="campo"><label for="f-correo">Correo electrónico</label><input id="f-correo" name="correo" type="email" autocomplete="email" required></div>
    ${campoPassword()}
    <button class="btn block" type="submit">Iniciar sesión</button></form>
  <p class="centrado" style="margin:1.1rem 0 0"><a href="/registro${volver}" data-link style="color:var(--naranja-d)">¿No tienes cuenta? Crea una</a></p></div></div>`;

const vistaRegistro = (volver) => `<div class="contenedor auth-pagina"><div class="auth-card">
  <div class="logo-c">${logoIcono()}</div><h1>Crear cuenta</h1><p class="sub muted">Para pagar necesitas una cuenta</p>
  <div id="alerta"></div>
  <form novalidate>
    <div class="campo"><label for="f-nombres">Nombre(s)</label><input id="f-nombres" name="nombres" autocomplete="given-name" maxlength="50" required></div>
    <div class="fila-campos mantener"><div class="campo"><label for="f-ap">Apellido paterno</label><input id="f-ap" name="apellido_paterno" autocomplete="family-name" maxlength="50" required></div>
      <div class="campo"><label for="f-am">Apellido materno</label><input id="f-am" name="apellido_materno" maxlength="50" required></div></div>
    <div class="campo"><label for="f-correo">Correo electrónico</label><input id="f-correo" name="correo" type="email" autocomplete="email" required></div>
    ${campoPassword('password', 'Contraseña', 'new-password').replace('</div></div>', '</div><span class="nota">Mínimo 8 caracteres, con letras y números</span></div>')}
    <div class="campo"><label class="chk-linea" style="margin:0"><input type="checkbox" name="acepta_privacidad" id="f-priv"><span>Acepto el <a href="/politicas/privacidad" target="_blank" rel="noopener">aviso de privacidad</a></span></label></div>
    <button class="btn block" id="btn-crear" type="submit" aria-disabled="true">Crear cuenta</button></form>
  <p class="centrado" style="margin:1.1rem 0 0">¿Ya tienes cuenta? <a href="/login${volver}" data-link style="color:var(--naranja-d);font-weight:700">Inicia sesión</a></p></div></div>`;

function loginEventos(ctx, form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = datosForm(form), errores = {};
    const ec = validarCorreo(d.correo); if (ec) errores.correo = ec;
    if (!d.password) errores.password = 'Escribe tu contraseña.';
    if (marcarErrores(form, errores)) return;
    const b = $('button[type=submit]', form); b.disabled = true;
    try {
      const r = await post('/auth/login', { correo: d.correo.trim(), password: d.password });
      estado.usuario = r.usuario; await ctx.refrescarSesion(); toast(`¡Hola de nuevo, ${r.usuario.nombres.split(' ')[0]}!`, 'ok');
      ctx.navegar(destino(ctx) === '/' && r.usuario.rol === 'administrador' ? '/admin/pedidos' : destino(ctx), { reemplazar: true });
    } catch (er) {
      b.disabled = false; $('#alerta').innerHTML = `<div class="alerta error" role="alert">${ico('info')}<span>${esc(er.message)}</span></div>`;
      $('[name=password]', form).value = '';
    }
  });
}

function registroEventos(ctx, form) {
  const priv = $('#f-priv'), btn = $('#btn-crear');
  const sync = () => { btn.classList.toggle('desactivado', !priv.checked); btn.setAttribute('aria-disabled', !priv.checked); };
  priv.addEventListener('change', sync); sync();
  const reglas = { nombres: (v) => validarNombre(v, 'El nombre'), apellido_paterno: (v) => validarNombre(v, 'El apellido paterno'), apellido_materno: (v) => validarNombre(v, 'El apellido materno'), correo: validarCorreo, password: validarPassword };
  for (const [n, f] of Object.entries(reglas)) { const el = $(`[name=${n}]`, form); el.addEventListener('blur', () => errorCampo(el.closest('.campo'), f(el.value))); }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = datosForm(form); d.acepta_privacidad = priv.checked;
    const errores = validarRegistro(d);
    if (marcarErrores(form, errores)) return;
    btn.disabled = true;
    try {
      const r = await post('/auth/registro', d);
      estado.usuario = r.usuario; await ctx.refrescarSesion(); toast(r.mensaje, 'ok');
      ctx.navegar(destino(ctx), { reemplazar: true });
    } catch (er) {
      btn.disabled = false; $('[name=password]', form).value = ''; // se conservan los demás datos (RF-1 CA9)
      if (er.datos.errores) {
        marcarErrores(form, er.datos.errores);
        if (er.datos.correo_duplicado) { // enlace a iniciar sesión junto al error
          const campo = $('[name=correo]', form).closest('.campo');
          $('.error', campo).innerHTML = `Este correo ya está registrado. <a href="/login${ctx.query.get('volver') ? `?volver=${encodeURIComponent(ctx.query.get('volver'))}` : ''}" data-link>Inicia sesión</a> o usa otro correo`;
        }
      } else errorToast(er);
    }
  });
}
