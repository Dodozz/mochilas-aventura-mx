// Ilustraciones SVG de respaldo para productos sin foto (mochila, mochila con ruedas, lonchera, estuche).
const hexOk = (c, d) => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : d);
const oscuro = (hex, f = 0.72) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.round(v * f)).toString(16).padStart(2, '0');
  return '#' + c((n >> 16) & 255) + c((n >> 8) & 255) + c(n & 255);
};

export function ilustracion(forma, c1, c2, vista) {
  c1 = hexOk(c1, '#2F6FD0'); c2 = hexOk(c2, '#FF6B2C');
  const d1 = oscuro(c1), d2 = oscuro(c2);
  const fondo = '<rect width="400" height="400" rx="24" fill="#F6F0E2"/>';
  let cuerpo = '';
  if (forma === 'lonchera') {
    cuerpo = `<path d="M130 150 q70 -70 140 0" fill="none" stroke="${d1}" stroke-width="14" stroke-linecap="round"/>
      <rect x="80" y="150" width="240" height="150" rx="26" fill="${c1}"/>
      <rect x="80" y="150" width="240" height="46" rx="22" fill="${d1}"/>
      <rect x="110" y="215" width="180" height="62" rx="14" fill="${c2}"/>
      <path d="M150 250 l22 -24 l18 18 l14 -12 l22 18z" fill="#fff" opacity=".85"/>`;
  } else if (forma === 'estuche') {
    cuerpo = `<rect x="60" y="165" width="280" height="80" rx="38" fill="${c1}"/>
      <rect x="60" y="205" width="280" height="64" rx="32" fill="${d1}"/>
      <path d="M90 205 H310" stroke="#fff" stroke-width="5" stroke-dasharray="10 8" opacity=".8"/>
      <circle cx="310" cy="205" r="9" fill="${c2}"/>`;
  } else {
    const ruedas = forma === 'ruedas';
    cuerpo = `${ruedas ? `<rect x="188" y="26" width="24" height="70" rx="6" fill="#555"/><rect x="170" y="20" width="60" height="14" rx="7" fill="#333"/>` : `<path d="M165 78 q35 -40 70 0" fill="none" stroke="${d1}" stroke-width="14" stroke-linecap="round"/>`}
      <rect x="112" y="92" width="176" height="${ruedas ? 238 : 262}" rx="62" fill="${c1}"/>
      ${vista === 'trasera' ? `<rect x="146" y="130" width="42" height="150" rx="18" fill="${d1}"/><rect x="212" y="130" width="42" height="150" rx="18" fill="${d1}"/>`
      : `<rect x="136" y="${ruedas ? 210 : 226}" width="128" height="${ruedas ? 92 : 100}" rx="22" fill="${c2}"/>
         <rect x="152" y="${ruedas ? 226 : 242}" width="96" height="12" rx="6" fill="${d2}"/>
         <path d="M170 ${ruedas ? 290 : 312} l30 -30 l22 22 l16 -12 l14 20z" fill="#fff" opacity=".85"/>
         <path d="M150 140 q50 -26 100 0" fill="none" stroke="${d1}" stroke-width="10" stroke-linecap="round"/>`}
      <rect x="80" y="150" width="36" height="120" rx="18" fill="${d2}"/><rect x="284" y="150" width="36" height="120" rx="18" fill="${d2}"/>
      ${ruedas ? `<circle cx="150" cy="352" r="16" fill="#333"/><circle cx="250" cy="352" r="16" fill="#333"/>` : ''}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img">${fondo}${cuerpo}</svg>`;
}
