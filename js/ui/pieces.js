// ═══ SVG-фигуры: авторский набор «Ноктюрн» ═══
const BASE = `<rect x="30" y="68" width="40" height="7" rx="2"/><rect x="25" y="75" width="50" height="10" rx="3"/>`;

const SHAPES = {
  1: `<circle cx="50" cy="27" r="11"/><rect x="37" y="38" width="26" height="6" rx="3"/>
      <path d="M41 44 C41 52 37 59 34 68 L66 68 C63 59 59 52 59 44 Z"/>${BASE}`,
  2: `<path d="M32 68 C33 58 36 52 41 47 C38 47 34 48 31 46 C28 44 28 40 31 37 L40 28 C43 22 48 18 53 17 L55 10 L60 17 C67 19 71 26 71 34 C71 43 67 50 65 57 C63 62 64 66 66 68 Z"/>
      <path d="M60 22 C64 27 66 33 65 40" fill="none" stroke-width="2.5"/>
      <circle class="nc-eye" cx="52" cy="29" r="2.4"/><circle class="nc-eye" cx="33.5" cy="41" r="1.8"/>${BASE}`,
  3: `<circle cx="50" cy="13" r="4.5"/>
      <path d="M50 20 C59 28 65 36 65 45 C65 54 58 60 50 60 C42 60 35 54 35 45 C35 36 41 28 50 20 Z"/>
      <path d="M45 34 L57 46" fill="none" stroke-width="3"/>
      <rect x="36" y="60" width="28" height="6" rx="3"/><path d="M40 66 h20 v2 h-20 z"/>${BASE}`,
  4: `<path d="M30 20 L30 34 L36 38 L36 60 L32 68 L68 68 L64 60 L64 38 L70 34 L70 20 L62 20 L62 26 L56 26 L56 20 L44 20 L44 26 L38 26 L38 20 Z"/>
      <path d="M36 38 h28 M36 60 h28" fill="none" stroke-width="2.5"/>${BASE}`,
  5: `<circle cx="26" cy="22" r="3.5"/><circle cx="38" cy="14" r="3.5"/><circle cx="50" cy="11" r="3.5"/><circle cx="62" cy="14" r="3.5"/><circle cx="74" cy="22" r="3.5"/>
      <path d="M30 46 L26 24 L34 33 L38 15 L44 32 L50 12 L56 32 L62 15 L66 33 L74 24 L70 46 Z"/>
      <rect x="30" y="46" width="40" height="6" rx="2"/>
      <path d="M33 52 C33 60 30 64 28 68 L72 68 C70 64 67 60 67 52 Z"/>${BASE}`,
  6: `<rect x="47.5" y="6" width="5" height="14" rx="1.5"/><rect x="43" y="10.5" width="14" height="5" rx="1.5"/>
      <path d="M50 24 C61 24 69 32 69 42 C69 51 62 57 50 59 C38 57 31 51 31 42 C31 32 39 24 50 24 Z"/>
      <path d="M34 46 C40 50 60 50 66 46" fill="none" stroke-width="2.5"/>
      <rect x="36" y="59" width="28" height="6" rx="3"/><path d="M40 65 L38 68 L62 68 L60 65 Z"/>${BASE}`,
};

export function pieceSVG(type, color, cls = '') {
  const t = Math.abs(type);
  const white = color > 0;
  const fill = white ? 'url(#ncGradW)' : 'url(#ncGradB)';
  const stroke = white ? '#7a5c33' : '#d8b878';
  const eye = white ? '#7a5c33' : '#d8b878';
  return `<svg viewBox="0 0 100 100" class="nc-piece-svg ${cls}" aria-hidden="true">
    <g fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      ${SHAPES[t].replaceAll('class="nc-eye"', `fill="${eye}" stroke="none"`)}
    </g></svg>`;
}

export function pieceChip(code) {
  // 'wP', 'bN' …
  const map = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6 };
  const color = code[0] === 'w' ? 1 : -1;
  return `<span class="piece-chip">${pieceSVG(map[code[1]], color)}</span>`;
}

export function injectDefs() {
  if (document.getElementById('nc-defs')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'nc-defs';
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = `<defs>
    <linearGradient id="ncGradW" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdf6e3"/><stop offset=".55" stop-color="#e9d3a4"/><stop offset="1" stop-color="#c9a86a"/>
    </linearGradient>
    <linearGradient id="ncGradB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a4266"/><stop offset=".55" stop-color="#241d3a"/><stop offset="1" stop-color="#120d22"/>
    </linearGradient>
    <marker id="ncArrowGold" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#e8b64c"/></marker>
    <marker id="ncArrowViolet" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#a78bfa"/></marker>
    <marker id="ncArrowCyan" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#39d0ff"/></marker>
  </defs>`;
  document.body.prepend(svg);
}