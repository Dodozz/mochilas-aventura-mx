// Pruebas de interfaz: ejecutan la aplicación REAL del navegador (JavaScript del frontend) dentro de jsdom
// contra el servidor real. Requieren las dependencias de desarrollo:  npm install  &&  npm run test:ui
import { JSDOM, VirtualConsole } from 'jsdom';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mochilas-ui-'));
process.env.DB_PATH = path.join(tmp, 'ui.db'); process.env.NODE_ENV = 'test';
const { app } = await import(path.join(RAIZ, 'server.js'));
const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
const BASE = `http://127.0.0.1:${srv.address().port}`;
const bundle = (await build({ entryPoints: [path.join(RAIZ, 'public/js/app.js')], bundle: true, format: 'iife', write: false, logLevel: 'error' })).outputFiles[0].text;
const html = fs.readFileSync(path.join(RAIZ, 'public/index.html'), 'utf8').replace(/<script type="module".*<\/script>/, '').replace(/<link[^>]*fonts[^>]*>/g, '');
const jar = {};
const errores = [];
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function mkFetch() {
  return async (url, opts = {}) => {
    const u = new URL(url, BASE);
    const res = await fetch(u, { ...opts, headers: { ...(opts.headers || {}), Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie?.() || []) { const [p] = c.split(';'); const i = p.indexOf('='); const v = p.slice(i + 1); if (v) jar[p.slice(0, i)] = v; else delete jar[p.slice(0, i)]; }
    return res;
  };
}
export async function abrir(ruta = '/') {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errores.push('jsdomError: ' + (e.detail?.stack || e.message || e)));
  vc.on('error', (...a) => errores.push('console.error: ' + a.map(String).join(' ')));
  vc.on('warn', () => {});
  const dom = new JSDOM(html, { url: BASE + ruta, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.fetch = mkFetch(); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
  w.eval(bundle);
  await esperar(w);
  return w;
}
export async function esperar(w, ms = 6000) {
  const t0 = Date.now();
  await wait(60);
  while (Date.now() - t0 < ms) {
    const c = w.document.querySelector('#contenido, #admin-raiz');
    if (c && !c.querySelector('.cargando') && c.children.length) { await wait(120); if (!c.querySelector('.cargando')) return; }
    await wait(60);
  }
}
export async function ir(w, ruta) {
  w.history.pushState({}, '', ruta); w.dispatchEvent(new w.PopStateEvent('popstate')); await esperar(w);
}
export const q = (w, s) => w.document.querySelector(s);
export const qa = (w, s) => [...w.document.querySelectorAll(s)];
export const txt = (w, s) => (q(w, s)?.textContent || '').replace(/\s+/g, ' ').trim();
export function escribir(w, el, v) { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); }
export const clic = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
let ok = 0, mal = 0;
export function chk(cond, msg) { if (cond) { ok++; console.log('  ✓', msg); } else { mal++; console.log('  ✗ FALLA:', msg); } }
export const resumen = () => { console.log(`\n${ok} correctas, ${mal} con falla`); if (errores.length) { console.log('Errores de consola/JS:'); [...new Set(errores)].forEach((e) => console.log('  -', e.slice(0, 400))); } srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(mal ? 1 : 0); };
export { errores };
