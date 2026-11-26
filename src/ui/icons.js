// Inline SVG: HUD and button icons (ICONS), the story card pictures (STORY_ART)
// and the drawings on the journal's Sightings cards (SIGHTING_ART).
const S = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
export const ICONS = {
  coin: S('<circle cx="12" cy="12" r="10" fill="#ffd54a" stroke="#0b1830" stroke-width="2"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="#c98a00" stroke-width="2"/><path d="M9 7.5a6 6 0 0 1 4-1.3" stroke="#fff6c8" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  chest: S('<path d="M3 11h18v9H3z" fill="#a8693a" stroke="#0b1830" stroke-width="2" stroke-linejoin="round"/><path d="M3 11a9 5 0 0 1 18 0z" fill="#c07d44" stroke="#0b1830" stroke-width="2" stroke-linejoin="round"/><path d="M3 13h18" stroke="#ffd54a" stroke-width="2"/><rect x="10" y="11.5" width="4" height="4.5" rx="1" fill="#ffd54a" stroke="#0b1830" stroke-width="1.5"/>'),
  hull: S('<path d="M2 13h20l-3 6H5z" fill="#c8915a" stroke="#0b1830" stroke-width="2" stroke-linejoin="round"/><path d="M12 13V3l7 8h-7" fill="#fff8e7" stroke="#0b1830" stroke-width="1.8" stroke-linejoin="round"/>'),
  sail: S(`<path d="M10 3v15" ${STROKE}/><path d="M11 4c5 3 7 8 7 12h-7z" fill="currentColor" opacity=".9"/><path d="M4 18h16l-2 3H6z" fill="currentColor"/>`),
  rudder: S(`<circle cx="12" cy="12" r="7" ${STROKE}/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M4.9 19.1l3.5-3.5M15.6 8.4l3.5-3.5" ${STROKE}/>`),
  keel: S(`<path d="M2 7h20l-3 5H5z" fill="currentColor"/><path d="M10 12h4l-1 9h-2z" fill="currentColor"/><path d="M8 20h8" ${STROKE}/>`),
  lantern: S(`<path d="M9 3h6M12 3v2" ${STROKE}/><path d="M7 7h10l-1 12H8z" ${STROKE}/><path d="M12 10c1.6 2 1.6 4 0 5.5-1.6-1.5-1.6-3.5 0-5.5z" fill="currentColor"/><path d="M6 21h12" ${STROKE}/>`),
  spyglass: S(`<path d="M3 15l5-2 1.5 3.5-5 2z" fill="currentColor"/><path d="M9 12.5l6-2.6 1.6 3.6-6 2.6z" fill="currentColor" opacity=".85"/><path d="M15.5 9.5l5-2.1 1.6 3.6-5 2.1z" fill="currentColor" opacity=".7"/><path d="M11 17l-2 5M13 16l2 5" ${STROKE}/>`),
  anchor: S(`<circle cx="12" cy="5" r="2.2" ${STROKE}/><path d="M12 7.2V21M8 11h8M4 14c0 4 3.5 7 8 7s8-3 8-7" ${STROKE}/><path d="M2.5 15.5L4 13l2 2.2M21.5 15.5L20 13l-2 2.2" ${STROKE}/>`),
  map: S(`<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" ${STROKE}/><path d="M9 4v14M15 6v14" ${STROKE}/><path d="M11.5 10.5l2 2m0-2l-2 2" stroke="#ff6b5b" stroke-width="2" stroke-linecap="round"/>`),
  pause: S('<rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/>'),
  sun: S('<circle cx="12" cy="12" r="5" fill="#ffd54a" stroke="#0b1830" stroke-width="1.6"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" stroke="#ffd54a" stroke-width="2.2" stroke-linecap="round"/>'),
  moon: S('<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.5A7 7 0 0 1 15.5 3.5z" fill="#e8ecff" stroke="#0b1830" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10" cy="14" r="1.2" fill="#b8c2e8"/><circle cx="13" cy="9" r=".9" fill="#b8c2e8"/>'),
  star: S('<path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill="#ffd54a" stroke="#0b1830" stroke-width="1.5" stroke-linejoin="round"/>'),
  close: S(`<path d="M6 6l12 12M18 6L6 18" ${STROKE} stroke-width="2.8"/>`),
  plus: S(`<path d="M12 5v14M5 12h14" ${STROKE} stroke-width="2.8"/>`),
  minus: S(`<path d="M5 12h14" ${STROKE} stroke-width="2.8"/>`),
  target: S(`<circle cx="12" cy="12" r="7" ${STROKE}/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" ${STROKE}/>`),
  check: S(`<path d="M4 12.5l5 5L20 6.5" ${STROKE} stroke-width="3"/>`),
  chevUp: S(`<path d="M5 15l7-7 7 7" ${STROKE} stroke-width="3.2"/>`),
  chevDown: S(`<path d="M5 9l7 7 7-7" ${STROKE} stroke-width="3.2"/>`),
  chevLeft: S(`<path d="M15 5l-7 7 7 7" ${STROKE} stroke-width="3"/>`),
  chevRight: S(`<path d="M9 5l7 7-7 7" ${STROKE} stroke-width="3"/>`),
  needle: S(`<path d="M19.5 3.5L6 17" ${STROKE} stroke-width="2.6"/><ellipse cx="18" cy="5" rx="1.1" ry="2.2" transform="rotate(45 18 5)" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 17c-2 1-3.5 2.5-3 4 1.5.5 3-1 4-3" ${STROKE}/><path d="M17 6c-4 0-9 3-11 8" fill="none" stroke="#ff6b5b" stroke-width="1.8" stroke-linecap="round"/>`),
  face: S(`<circle cx="12" cy="12" r="9" ${STROKE}/><circle cx="9" cy="11" r="1.4" fill="currentColor"/><circle cx="15" cy="11" r="1.4" fill="currentColor"/><path d="M8.5 15c2 2 5 2 7 0" ${STROKE}/>`),
  scroll: S(`<path d="M6 4h11a3 3 0 0 1 0 6h-1v8a3 3 0 0 1-3 3H6a3 3 0 0 1 0-6h1V7a3 3 0 0 1 3-3" ${STROKE}/><path d="M10 9h4M10 13h4" ${STROKE}/>`),
  book: S(`<path d="M4 5.5C7 4 9.5 4 12 6c2.5-2 5-2 8-.5V19c-3-1.5-5.5-1.5-8 .5-2.5-2-5-2-8-.5z" ${STROKE}/><path d="M12 6v13.5" ${STROKE}/>`),
  letters: S(`<rect x="3" y="6" width="18" height="13" rx="1.5" ${STROKE}/><path d="M3.5 7l8.5 6.5L20.5 7" ${STROKE}/><path d="M12 13.5V19" stroke="#c8322b" stroke-width="2.2"/>`),
  scarf: S(`<path d="M5 6c3 2.5 11 2.5 14 0l-1.5 4c-3.5 2-7.5 2-11 0z" fill="#c8322b" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 10.5l2.5 9 2.5-1-1.5-8.5" fill="#c8322b" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`),
  helmet: S(`<path d="M5 15a7 7 0 0 1 14 0z" fill="#e6cf92" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M2 15.5h20c0 1.6-4.5 2.5-10 2.5S2 17.1 2 15.5z" fill="#e6cf92" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5.4 12.6h13.2" stroke="#c8322b" stroke-width="2"/><circle cx="12" cy="7.4" r="1.1" fill="currentColor"/><circle cx="9.6" cy="10.4" r="1.7" fill="#9fe0ec" stroke="#c9973a" stroke-width="1.2"/><circle cx="14.4" cy="10.4" r="1.7" fill="#9fe0ec" stroke="#c9973a" stroke-width="1.2"/>`),
  flag: S(`<path d="M6 3v18" ${STROKE}/><path d="M6 4h12l-3 4 3 4H6z" fill="#e8413a" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`),
  tricorn: S(`<path d="M3 15c3-7 15-7 18 0-4 3-14 3-18 0z" fill="#2a2430" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4.5 14.5c4 2 11 2 15 0" fill="none" stroke="#e8413a" stroke-width="1.8"/><path d="M15.5 9.5c2-4 5-5 6-4-1 1-2.500 3.500-3.500 6" fill="#fff8e7" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`),
  dice: S(`<rect x="3.5" y="3.5" width="17" height="17" rx="4" ${STROKE}/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/>`),
};

// ------------------------------------------------------------ story art
// Little painted scenes for the story cards (320×170, flat shapes, ink lines).
const INK = 'stroke="#2a1d12" stroke-width="2.5" stroke-linejoin="round"';
// (`id` names the gradient: pictures shown side by side each need their own)
const sky = (a, b, sea = '#3f86c9', sea2 = '#2c6aa8', id = 'sk') => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="320" height="170" fill="url(#${id})"/><rect y="110" width="320" height="60" fill="${sea}"/>
  <path d="M0 122 Q20 118 40 122 T80 122 T120 122 T160 122 T200 122 T240 122 T280 122 T320 122 V170 H0Z" fill="${sea2}" opacity=".55"/>
  <path d="M30 140 q10 -4 20 0 M120 150 q10 -4 20 0 M230 136 q10 -4 20 0 M270 156 q10 -4 20 0" stroke="#fff" stroke-width="2" fill="none" opacity=".6" stroke-linecap="round"/>`;
const smallBoat = (x, y, s = 1, patch = true) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-26 0 H26 L18 12 H-18 Z" fill="#a8693a" ${INK}/><path d="M0 0 V-46" ${INK}/>
  <path d="M2 -44 L30 -6 H2 Z" fill="#fff4dc" ${INK}/>${patch ? '<rect x="9" y="-22" width="8" height="7" fill="#e0b070" stroke="#2a1d12" stroke-width="1.5"/>' : ''}
  <path d="M0 -46 l9 3 -9 3" fill="#c8322b" stroke="#2a1d12" stroke-width="1.5"/></g>`;
const rocks = (x) => `<g transform="translate(${x} 0)"><path d="M0 116 L6 52 L30 44 L40 116 Z" fill="#8f877d" ${INK}/><path d="M6 52 L30 44 L28 54 L8 58 Z" fill="#6fae55" ${INK}/>
  <path d="M34 116 L40 76 L60 72 L66 116 Z" fill="#7d766d" ${INK}/><path d="M40 76 L60 72 L59 79 L41 81Z" fill="#6fae55" stroke="#2a1d12" stroke-width="2"/></g>`;
const redwingArt = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-30 0 H30 L20 13 H-20 Z" fill="#221c26" ${INK}/><path d="M-28 3 H27" stroke="#b81f2e" stroke-width="3"/><path d="M0 0 V-54" ${INK}/>
  <path d="M3 -52 L36 -6 H3 Z" fill="#b81f2e" ${INK}/><path d="M-3 -46 L-26 -6 H-3 Z" fill="#b81f2e" ${INK}/>
  <path d="M6 -16 q6 -12 20 -13 l-6 5 5 2 -7 3 4 3 q-9 3 -16 0z" fill="#221c26"/>
  <path d="M0 -54 l10 3 -10 3" fill="#fff4dc" stroke="#2a1d12" stroke-width="1.5"/></g>`;
export const STORY_ART = {
  ghost: () => SIGHTING_ART.ghostShip(true),
  redwing: () => sky('#ffd9a8', '#bfe0f2') + `<circle cx="258" cy="42" r="16" fill="#ffd54a" ${INK}/>${redwingArt(150, 116, 1.35)}${smallBoat(262, 118, 0.6)}`,
  deep: () => sky('#2a2a52', '#5a4a7a', '#1d2a55', '#141d40') + `<circle cx="250" cy="34" r="12" fill="#e8ecff" ${INK}/>
    <ellipse cx="150" cy="146" rx="96" ry="16" fill="#0c1230" opacity=".75"/>
    <path d="M70 150 q-6 -46 16 -62 q16 -10 22 4 q-14 0 -18 14 q-4 20 4 44z" fill="#5a2f6e" ${INK}/>
    <path d="M214 152 q12 -40 -6 -58 q-12 -10 -20 0 q12 2 14 14 q2 20 -8 44z" fill="#5a2f6e" ${INK}/>
    <circle cx="136" cy="146" r="4" fill="#ffd54a"/><circle cx="162" cy="146" r="4" fill="#ffd54a"/>${redwingArt(280, 116, 0.5)}${smallBoat(40, 118, 0.5)}`,
  harbor: () => sky('#ffe3b0', '#9fd0ee') + `<circle cx="258" cy="40" r="18" fill="#ffd54a" ${INK}/>
    <path d="M0 112 Q50 60 120 70 T200 112 Z" fill="#6cc24a" ${INK}/><path d="M60 80 h22 v14 h-22z M100 74 h18 v12 h-18z" fill="#ead7b0" ${INK}/>
    <path d="M56 80 l15 -12 15 12 M97 74 l12 -10 12 10" fill="#c2573f" ${INK}/>
    <path d="M150 112 H300 V118 H150 Z" fill="#9b7650" ${INK}/><path d="M170 118v14 M210 118v14 M250 118v14 M290 118v14" ${INK}/>
    ${smallBoat(255, 112, 0.8)}<path d="M150 40 q6 -5 12 0 q6 -5 12 0 M190 26 q5 -4 10 0 q5 -4 10 0" stroke="#2a1d12" stroke-width="2" fill="none"/>`,
  boat: () => sky('#bfe4ff', '#e8f6ff') + `<circle cx="60" cy="38" r="14" fill="#ffe27a" ${INK}/>${smallBoat(165, 116, 1.4)}
    <path d="M110 30 q16 -10 32 0 q12 -8 24 0 q-28 6 -56 0" fill="#fff" stroke="#2a1d12" stroke-width="2"/>`,
  wreck: () => sky('#d9e8f2', '#a9c9dd', '#4a7fae', '#3a6b96') + rocks(190) + `
    <g transform="translate(150 112) rotate(-14)"><path d="M-70 -6 H40 L60 -26 L56 0 Q-10 22 -70 4 Z" fill="#6a4527" ${INK}/>
    <path d="M-60 -6 H36" ${INK}/><path d="M-30 -6 V-34 L-26 -40" fill="none" ${INK}/><path d="M-26 -40 l12 4 -12 4z" fill="#c8322b" stroke="#2a1d12" stroke-width="1.5"/>
    <path d="M-50 -6 v-10 M-40 -6 v-12" stroke="#7a5333" stroke-width="3"/></g>
    <path d="M40 150 h22 M70 156 h14" stroke="#9a7046" stroke-width="5" stroke-linecap="round"/>`,
  letters: () => `<rect width="320" height="170" fill="#e9d9b4"/><rect x="12" y="12" width="296" height="146" rx="8" fill="#f4e8cc" stroke="#b09060" stroke-width="2"/>
    <g transform="rotate(-6 150 90)"><rect x="70" y="52" width="130" height="78" fill="#fffaf0" ${INK}/><path d="M70 52 L135 96 L200 52" fill="none" ${INK}/></g>
    <g transform="rotate(4 170 100)"><rect x="96" y="66" width="130" height="78" fill="#fff6e6" ${INK}/><path d="M96 66 L161 110 L226 66" fill="none" ${INK}/>
    <path d="M161 66 V144 M96 105 H226" stroke="#c8322b" stroke-width="4"/><circle cx="161" cy="105" r="7" fill="#b3261e" ${INK}/></g>
    <path d="M232 124 q22 -40 40 -10 q10 18 -10 26" fill="none" stroke="#c8322b" stroke-width="9" stroke-linecap="round"/>
    <g transform="translate(52 120)"><path d="M0 0 v-28" stroke="#4a7a3a" stroke-width="2.5"/><circle cy="-32" r="7" fill="#f2a6c0" ${INK}/><circle cy="-32" r="2.5" fill="#ffd54a"/></g>`,
  sunset: () => sky('#5a3c7a', '#ff9a5a', '#3a4f8a', '#2c3c70') + `<circle cx="160" cy="112" r="34" fill="#ffcf6a" ${INK}/>
    <rect y="112" width="320" height="58" fill="#3a4f8a"/><path d="M128 124 h64 M138 134 h44 M148 144 h24" stroke="#ffcf6a" stroke-width="4" stroke-linecap="round"/>
    ${smallBoat(70, 120, 0.7, false)}`,
  home: () => sky('#ffb877', '#ffe6b8') + `<path d="M0 112 Q90 84 200 96 T320 112 Z" fill="#6cc24a" ${INK}/>
    <rect x="96" y="56" width="92" height="48" fill="#ead7b0" ${INK}/><path d="M86 60 L142 22 L198 60 Z" fill="#c2573f" ${INK}/>
    <rect x="112" y="70" width="20" height="18" fill="#ffd54a" ${INK}/><path d="M122 70 v18 M112 79 h20" stroke="#2a1d12" stroke-width="1.5"/>
    <rect x="150" y="74" width="18" height="30" fill="#7a4a24" ${INK}/><path d="M90 104 H194 V110 H90Z" fill="#9b7650" ${INK}/>
    <path d="M160 22 v-12 h10 v18" fill="#8f877d" ${INK}/><path d="M166 6 q6 -6 0 -10" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/>`,
};

// ---------------------------------------------------------- sightings art
// The drawings on the Sightings cards (320×170, like the story art). Each takes
// `seen`: before you've seen the thing it is drawn as a dark shape on a dull
// sea, with nothing to give it away.
const DULL = ['#c9d3da', '#dfe6ea', '#9fb0bd', '#8c9eac'];
const DARK = '#3b4a5c';
const shade = (seen, col) => (seen ? col : DARK);
const inkFor = (seen) => (seen ? INK : `stroke="${DARK}" stroke-width="2.5" stroke-linejoin="round"`);
const sightSky = (seen, id, a, b, sea, sea2) => (seen ? sky(a, b, sea, sea2, id) : sky(...DULL, id));
const foam = (seen, d) => `<path d="${d}" stroke="${seen ? '#ffffff' : DARK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
export const SIGHTING_ART = {
  whale: (seen) => sightSky(seen, 'sgWhale', '#bfe4ff', '#eef8ff') + `
    <path d="M96 128 C92 84 122 46 168 40 C206 36 236 58 244 92 C247 108 240 122 232 128 Z" fill="${shade(seen, '#3f5d7d')}" ${inkFor(seen)}/>
    <path d="M110 128 C108 104 122 82 146 70 C140 92 150 114 176 128 Z" fill="${shade(seen, '#d9e6ec')}" ${inkFor(seen)}/>
    <path d="M150 74 C128 78 112 96 104 116 C122 110 140 96 156 82 Z" fill="${shade(seen, '#34506e')}" ${inkFor(seen)}/>
    <circle cx="214" cy="84" r="4" fill="${shade(seen, '#141c28')}"/>
    ${foam(seen, 'M176 36 q-4 -18 -18 -24 M182 34 q0 -18 8 -26 M188 36 q8 -14 22 -16')}
    ${foam(seen, 'M70 130 q14 -16 28 -2 M232 130 q14 -14 26 0 M52 136 q8 -8 16 0')}`,
  dolphins: (seen) => {
    const one = (x, y, s, r) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
      <path d="M-44 6 C-30 -22 14 -28 44 -6 L58 -4 L46 4 C20 14 -14 14 -34 10 L-50 22 L-48 6 L-60 -4 Z" fill="${shade(seen, '#6d8ea8')}" ${inkFor(seen)}/>
      <path d="M-30 9 C-10 12 22 10 44 2 C22 16 -10 16 -30 9 Z" fill="${shade(seen, '#e8f0f3')}"/>
      <path d="M-6 -20 L-12 -36 L8 -22 Z" fill="${shade(seen, '#5a7a94')}" ${inkFor(seen)}/>
      <circle cx="34" cy="-6" r="2.6" fill="${shade(seen, '#141c28')}"/></g>`;
    return sightSky(seen, 'sgDolphins', '#ffe9b8', '#bfe6f6', '#2f9bc0', '#1f7fa6') + one(118, 84, 1.05, -24) + one(214, 70, 0.8, 10)
      + foam(seen, 'M62 120 q10 -14 22 -2 M150 122 q8 -10 18 0 M236 120 q10 -14 22 -2');
  },
  ghostShip: (seen) => {
    const pale = shade(seen, '#bfeeda'), sail = shade(seen, '#e4fff3'), glow = shade(seen, '#8dffb9');
    const rim = seen ? 'stroke="#7fc9b0" stroke-width="2" stroke-linejoin="round"' : inkFor(false);
    const night = seen ? `<circle cx="64" cy="36" r="13" fill="#e8ecff" opacity=".85"/><rect y="92" width="320" height="26" fill="#aebfd8" opacity=".18"/>` : '';
    const lamps = [[98, 88], [176, 106], [258, 94]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${seen ? 9 : 4}" fill="${glow}" opacity="${seen ? 0.3 : 1}"/><circle cx="${x}" cy="${y}" r="3.6" fill="${glow}"/>`).join('');
    return sightSky(seen, 'sgGhost', '#141a3a', '#2c3566', '#1a2450', '#131b40') + night + `
      <g opacity="${seen ? 0.82 : 1}"><path d="M92 110 L104 132 H216 L236 104 L206 110 Z" fill="${pale}" ${rim}/>
      <path d="M92 110 V94 H116 V110" fill="${pale}" ${rim}/>
      <path d="M140 110 V28 M188 110 V40 M236 104 L262 92" fill="none" ${rim}/>
      <path d="M116 38 H164 L160 66 L152 60 L146 70 L138 62 L130 70 L120 64 Z" fill="${sail}" ${rim}/>
      <path d="M120 72 H160 L158 98 L148 92 L140 100 L130 94 L122 98 Z" fill="${sail}" ${rim}/>
      <path d="M170 48 H206 L204 74 L196 68 L188 78 L180 70 L172 74 Z" fill="${sail}" ${rim}/>
      <path d="M172 80 H204 L202 100 L194 96 L186 102 L176 98 Z" fill="${sail}" ${rim}/></g>${lamps}`;
  },
  archCrabs: (seen) => {
    const crab = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s}) rotate(180)">
      <path d="M-10 -4 l-9 -7 M10 -4 l9 -7 M-11 2 l-9 2 M11 2 l9 2 M-9 6 l-7 6 M9 6 l7 6" stroke="${shade(seen, '#b33a26')}" stroke-width="3" stroke-linecap="round"/>
      <ellipse rx="11" ry="7.5" fill="${shade(seen, '#e0553a')}" ${inkFor(seen)}/>
      <circle cx="-17" cy="-13" r="4.5" fill="${shade(seen, '#e0553a')}" ${inkFor(seen)}/><circle cx="17" cy="-13" r="4.5" fill="${shade(seen, '#e0553a')}" ${inkFor(seen)}/></g>`;
    return sightSky(seen, 'sgCrabs', '#bfe4ff', '#e8f6ff') + `
      <path d="M0 0 H320 V118 H272 C268 60 222 34 160 34 C98 34 52 60 48 118 H0 Z" fill="${shade(seen, '#a39b91')}" ${inkFor(seen)}/>
      ${seen ? '<path d="M48 118 C52 60 98 34 160 34 C222 34 268 60 272 118 H256 C250 72 212 50 160 50 C108 50 70 72 64 118 Z" fill="#837b73"/>' : ''}
      ${seen ? crab(112, 62, 0.9) + crab(160, 56, 1.1) + crab(208, 62, 0.9) + crab(136, 74, 0.6) + crab(186, 74, 0.6) : ''}`;
  },
  turtles: (seen) => {
    const one = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">
      <path d="M14 0 C24 4 36 10 42 18 C30 18 18 12 8 4 Z" fill="${shade(seen, '#d9cf9a')}" ${inkFor(seen)}/>
      <path d="M26 -4 C32 -8 36 -16 44 -19 C52 -21 57 -13 51 -8 C45 -4 36 -1 28 1 Z" fill="${shade(seen, '#d9cf9a')}" ${inkFor(seen)}/>
      <circle cx="48" cy="-14" r="2.2" fill="${shade(seen, '#141c28')}"/>
      <path d="M-32 2 C-30 -22 24 -26 32 2 Z" fill="${shade(seen, '#5d7a4a')}" ${inkFor(seen)}/>
      <path d="M-10 -18 L-4 -8 H8 L14 -18 M-4 -8 L-10 1 M8 -8 L14 1 M-20 -10 L-10 -4 M24 -10 L14 -4" stroke="${shade(seen, '#4a6339')}" stroke-width="2" fill="none" stroke-linecap="round"/></g>`;
    return sightSky(seen, 'sgTurtles', '#ffe9b8', '#bfe6f6', '#2f9bc0', '#1f7fa6') + (seen ? `<circle cx="276" cy="36" r="15" fill="#ffd54a" ${INK}/>` : '')
      + one(72, 114, 0.85) + one(160, 118, 1.05) + one(246, 114, 0.8)
      + foam(seen, 'M38 118 q10 -6 20 0 M118 124 q12 -6 24 0 M214 118 q10 -6 20 0');
  },
  bloom: (seen) => {
    const swirl = 'M30 140 q20 -12 40 0 t40 0 M170 152 q16 -10 32 0 t32 0 M110 126 q12 -7 24 0 M250 132 q12 -7 24 0';
    const night = seen ? `<circle cx="258" cy="34" r="13" fill="#e8ecff"/>
      <path d="M40 30 h.1 M96 18 h.1 M150 40 h.1 M200 16 h.1 M300 66 h.1 M24 70 h.1" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="70" cy="140" rx="46" ry="9" fill="#4fd8ff" opacity=".35"/><ellipse cx="206" cy="152" rx="44" ry="8" fill="#4fd8ff" opacity=".3"/><ellipse cx="270" cy="132" rx="28" ry="6" fill="#4fd8ff" opacity=".4"/>
      <path d="M180 118 Q130 124 70 118 M182 122 Q134 134 84 130" stroke="#4fd8ff" stroke-width="9" fill="none" opacity=".35" stroke-linecap="round"/>
      <path d="M180 118 Q130 124 70 118 M182 122 Q134 134 84 130" stroke="#9ff4ff" stroke-width="3" fill="none" stroke-linecap="round"/>
      <g transform="translate(206 114)"><path d="M-26 0 H26 L18 11 H-18 Z" fill="#0a0f24"/><path d="M0 0 V-44" stroke="#0a0f24" stroke-width="3"/><path d="M2 -42 L28 -6 H2 Z" fill="#0a0f24"/></g>
      <path d="M60 162 h.1 M140 146 h.1 M236 160 h.1 M290 148 h.1 M30 128 h.1" stroke="#9ff4ff" stroke-width="4" stroke-linecap="round"/>` : '';
    return sightSky(seen, 'sgBloom', '#0f1535', '#232c5c', '#131b40', '#0e1533') + night
      + `<path d="${swirl}" stroke="${shade(seen, '#9ff4ff')}" stroke-width="3" fill="none" stroke-linecap="round" opacity="${seen ? 0.9 : 0.7}"/>`;
  },
  waterspout: (seen) => sightSky(seen, 'sgSpout', '#7f8b98', '#bcc6cf', '#3d5f78', '#2f4c62') + `
    <ellipse cx="154" cy="114" rx="36" ry="7" fill="${shade(seen, '#dfe8f0')}" opacity=".8"/>
    <g transform="translate(0 -37) scale(1 1.33)"><path d="M124 40 C138 66 164 74 162 90 C160 100 150 104 146 113 H160 C162 104 172 98 174 88 C178 72 198 64 216 40 Z" fill="${shade(seen, '#e3ecf3')}" ${inkFor(seen)}/>
    <path d="M136 56 Q170 70 206 54 M148 70 Q170 80 190 68 M158 82 Q168 88 176 80 M152 98 Q160 102 166 96" stroke="${shade(seen, '#8fa2b4')}" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>
    <path transform="translate(0 -22)" d="M-10 0 H330 V42 C310 58 284 48 268 56 C250 66 228 54 212 60 C190 68 150 66 130 58 C110 50 90 62 70 54 C50 46 30 58 -10 46 Z" fill="${shade(seen, '#434c59')}" ${inkFor(seen)}/>
    ${foam(seen, 'M124 112 q8 -14 20 -6 M166 112 q8 -12 22 -2 M140 104 q-6 -10 -16 -10 M166 102 q8 -8 16 -6')}
    ${foam(seen, 'M50 130 q10 -6 20 0 M240 126 q10 -6 20 0')}`,
  iceberg: (seen) => sightSky(seen, 'sgIceberg', '#cfe6f5', '#f3fbff', '#3a78a8', '#2c6390') + `
    <path d="M62 112 H226 L212 132 H82 Z" fill="${shade(seen, '#7fb9d9')}" opacity=".85"/>
    <path d="M70 112 L88 66 L112 54 L130 30 L158 22 L178 44 L196 40 L214 70 L218 112 Z" fill="${shade(seen, '#eaf6ff')}" ${inkFor(seen)}/>
    <path d="M158 22 L178 44 L196 40 L214 70 L218 112 H176 L168 64 Z" fill="${shade(seen, '#a9d3ea')}" ${inkFor(seen)}/>
    <path d="M112 54 L118 82 M130 30 L138 60" stroke="${shade(seen, '#a9d3ea')}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <g transform="rotate(16 240 112)"><path d="M226 112 L228 62 L248 56 L254 112 Z" fill="${shade(seen, '#eaf6ff')}" ${inkFor(seen)}/><path d="M248 56 L254 112 H242 L240 64 Z" fill="${shade(seen, '#a9d3ea')}"/></g>
    <path d="M38 116 l6 -8 10 2 4 6 Z M278 118 l5 -7 9 1 3 6 Z M106 124 l4 -5 7 1 2 4 Z" fill="${shade(seen, '#eaf6ff')}" ${inkFor(seen)}/>
    ${foam(seen, 'M222 112 q-4 -16 -14 -20 M246 110 q2 -18 12 -24 M262 114 q8 -12 18 -12 M232 118 q14 -6 28 0')}
    ${foam(seen, 'M30 140 q10 -6 20 0 M150 146 q10 -6 20 0')}`,
  bottle: (seen) => {
    const glint = seen ? '<path d="M0 -11 L2.6 -2.6 L11 0 L2.6 2.6 L0 11 L-2.6 2.6 L-11 0 L-2.6 -2.6 Z" transform="translate(134 72)" fill="#ffffff" stroke="#2a1d12" stroke-width="1.5" stroke-linejoin="round"/>' : '';
    const paper = seen ? '<rect x="-34" y="-7" width="40" height="14" rx="4" fill="#fff4dc" stroke="#2a1d12" stroke-width="1.5"/><path d="M-26 -7 V7 M-2 -7 V7" stroke="#c9a26a" stroke-width="2"/>' : '';
    return sightSky(seen, 'sgBottle', '#bfe4ff', '#eef8ff') + `
    <g transform="translate(160 106) rotate(-24)">
      <path d="M-46 -15 H12 C24 -15 26 -6 34 -6 H46 V6 H34 C26 6 24 15 12 15 H-46 C-54 15 -54 -15 -46 -15 Z" fill="${shade(seen, '#3f9a6a')}" ${inkFor(seen)}/>
      ${paper}<path d="M-40 -10 H6" stroke="${shade(seen, '#7fd0a0')}" stroke-width="3.5" stroke-linecap="round"/>
      <rect x="45" y="-5" width="11" height="10" rx="2" fill="${shade(seen, '#c9a26a')}" ${inkFor(seen)}/></g>
    <path d="M96 120 q16 -7 32 0 t32 0 t32 0 t32 0 V138 H96 Z" fill="${seen ? '#3f86c9' : DULL[2]}" opacity=".7"/>${glint}
    ${foam(seen, 'M106 120 q10 -6 20 0 M196 112 q10 -6 20 0 M40 140 q10 -6 20 0 M262 134 q10 -6 20 0')}`;
  },
};
