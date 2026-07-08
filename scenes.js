/* =========================================================
 * scenes.js — 背景シーン定義
 * 各シーンは { sky, scroll, groundColor, road, dashColor } を返す。
 * scroll は走行モードで横に流れるレイヤー（560px幅でループ）。
 * ======================================================= */

const SCENES = [
  { id: 'city', name: 'シティ', emoji: '🏙️' },
  { id: 'sunset', name: '夕焼け', emoji: '🌇' },
  { id: 'mountain', name: '山道', emoji: '⛰️' },
  { id: 'night', name: 'ナイト', emoji: '🌃' },
  { id: 'beach', name: 'ビーチ', emoji: '🏖️' },
  { id: 'garage', name: 'ガレージ', emoji: '🔧' },
];

function buildingRow(color, tops) {
  // tops: [x, w, h] の配列。地面(252)から立ち上がるビル。
  return tops.map(([x, w, h]) => {
    let win = '';
    for (let wx = x + 8; wx < x + w - 10; wx += 16) {
      for (let wy = 252 - h + 12; wy < 240; wy += 22) {
        win += `<rect x="${wx}" y="${wy}" width="7" height="10" fill="rgba(255,255,255,.25)"/>`;
      }
    }
    return `<rect x="${x}" y="${252 - h}" width="${w}" height="${h}" fill="${color}"/>${win}`;
  }).join('');
}

function cloud(x, y, s, color = 'rgba(255,255,255,.9)') {
  return `<g transform="translate(${x},${y}) scale(${s})" fill="${color}">
    <ellipse cx="0" cy="0" rx="26" ry="13"/>
    <ellipse cx="20" cy="-6" rx="18" ry="11"/>
    <ellipse cx="-20" cy="-4" rx="16" ry="10"/>
  </g>`;
}

function tree(x, s) {
  return `<g transform="translate(${x},252) scale(${s})">
    <rect x="-4" y="-26" width="8" height="26" fill="#7a5233"/>
    <circle cx="0" cy="-44" r="24" fill="#3f9153"/>
    <circle cx="-16" cy="-32" r="16" fill="#48a35f"/>
    <circle cx="16" cy="-34" r="17" fill="#48a35f"/>
  </g>`;
}

function palm(x, flip) {
  const f = flip ? -1 : 1;
  return `<g transform="translate(${x},252) scale(${f},1)">
    <path d="M 0 0 Q 10 -50 26 -84" stroke="#8a6239" stroke-width="9" fill="none" stroke-linecap="round"/>
    <g fill="#2fa35c">
      <path d="M 26 -84 Q 56 -96 78 -82 Q 52 -80 26 -84 Z"/>
      <path d="M 26 -84 Q 50 -110 74 -108 Q 48 -92 26 -84 Z"/>
      <path d="M 26 -84 Q 12 -116 -12 -118 Q 8 -96 26 -84 Z"/>
      <path d="M 26 -84 Q -6 -98 -22 -84 Q 4 -76 26 -84 Z"/>
    </g>
    <circle cx="24" cy="-80" r="5" fill="#7a4a22"/>
  </g>`;
}

function mountainPath(pts, color) {
  return `<path d="M 0 252 ${pts.map(p => `L ${p[0]} ${p[1]}`).join(' ')} L 560 252 Z" fill="${color}"/>`;
}

function sceneSVG(id) {
  switch (id) {
    case 'city':
      return {
        sky: `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#8ecdf5"/><stop offset="1" stop-color="#e6f5ff"/>
              </linearGradient></defs>
              <rect width="560" height="252" fill="url(#sky)"/>
              <circle cx="480" cy="52" r="24" fill="#fff3b0" opacity=".9"/>`,
        scroll:
          buildingRow('#a7bdd3', [[10, 60, 150], [90, 44, 100], [300, 70, 170], [420, 50, 120]]) +
          buildingRow('#7e97b3', [[50, 56, 120], [150, 80, 190], [250, 46, 90], [370, 64, 140], [480, 70, 165]]) +
          cloud(120, 60, 1) + cloud(360, 40, 0.8) + cloud(520, 80, 0.6),
        groundColor: '#5a6069', road: true, dashColor: '#f4f6f8',
      };
    case 'sunset':
      return {
        sky: `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#3d2466"/><stop offset=".55" stop-color="#e2606f"/>
                <stop offset="1" stop-color="#ffca7a"/>
              </linearGradient></defs>
              <rect width="560" height="252" fill="url(#sky)"/>
              <circle cx="300" cy="210" r="46" fill="#ffde59" opacity=".95"/>
              <circle cx="300" cy="210" r="66" fill="#ffde59" opacity=".25"/>`,
        scroll:
          buildingRow('#472a4f', [[30, 60, 130], [130, 90, 180], [280, 54, 100], [400, 72, 150], [500, 50, 110]]) +
          `<path d="M 200 70 q 8 -8 16 0 q 8 -8 16 0" stroke="#331d3c" stroke-width="3" fill="none"/>
           <path d="M 440 50 q 7 -7 14 0 q 7 -7 14 0" stroke="#331d3c" stroke-width="3" fill="none"/>` +
          cloud(100, 50, 0.9, 'rgba(90,40,90,.55)') + cloud(430, 90, 0.7, 'rgba(90,40,90,.5)'),
        groundColor: '#4a3a4e', road: true, dashColor: '#ffd9a0',
      };
    case 'mountain':
      return {
        sky: `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#9fd7f7"/><stop offset="1" stop-color="#eef9ff"/>
              </linearGradient></defs>
              <rect width="560" height="252" fill="url(#sky)"/>`,
        scroll:
          mountainPath([[80, 110], [200, 252]], '#8fb2c9') +
          mountainPath([[180, 252], [320, 90], [480, 252]], '#6f96b3') +
          `<path d="M 292 122 L 320 90 L 348 122 Q 334 112 320 122 Q 306 112 292 122 Z" fill="#f4fbff"/>` +
          mountainPath([[420, 252], [520, 130], [560, 200]], '#8fb2c9') +
          tree(60, 1) + tree(250, 0.8) + tree(440, 1.1) + cloud(150, 55, 0.9) + cloud(430, 45, 0.7),
        groundColor: '#7d8a6d', road: true, dashColor: '#f4f6f8',
      };
    case 'night': {
      let stars = '';
      const pts = [[30, 30], [90, 70], [150, 25], [210, 55], [280, 30], [330, 75], [390, 20], [450, 60], [520, 35], [250, 100], [480, 110], [60, 120]];
      pts.forEach(([x, y], i) => { stars += `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1.5 : 2.5}" fill="#fff" opacity="${0.5 + (i % 4) * 0.12}"/>`; });
      return {
        sky: `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#070a1e"/><stop offset="1" stop-color="#232a55"/>
              </linearGradient></defs>
              <rect width="560" height="252" fill="url(#sky)"/>${stars}
              <circle cx="460" cy="56" r="26" fill="#f2ecc9"/>
              <circle cx="450" cy="50" r="7" fill="#ddd5ac" opacity=".6"/>
              <circle cx="470" cy="66" r="5" fill="#ddd5ac" opacity=".6"/>`,
        scroll:
          buildingRow('#141a38', [[20, 70, 160], [120, 50, 110], [240, 84, 190], [360, 56, 130], [460, 76, 170]]) +
          `<rect x="238" y="60" width="6" height="14" fill="#ff5f8f"/>
           <circle cx="241" cy="56" r="5" fill="#ff2d6f"/>`,
        groundColor: '#191d2e', road: true, dashColor: '#59f2e8',
      };
    }
    case 'beach':
      return {
        sky: `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#8fd9ff"/><stop offset="1" stop-color="#e9fbff"/>
              </linearGradient></defs>
              <rect width="560" height="252" fill="url(#sky)"/>
              <circle cx="90" cy="55" r="26" fill="#ffe269"/>
              <rect x="0" y="196" width="560" height="56" fill="#2fa8cf"/>
              <rect x="0" y="196" width="560" height="6" fill="rgba(255,255,255,.5)"/>`,
        scroll:
          `<path d="M 320 176 L 348 130 L 352 176 Z" fill="#fff"/>
           <path d="M 312 178 L 362 178 L 352 190 L 322 190 Z" fill="#e2574b"/>
           <path d="M 120 210 q 12 -8 24 0 M 420 220 q 12 -8 24 0" stroke="rgba(255,255,255,.7)" stroke-width="3" fill="none"/>` +
          palm(60, false) + palm(510, true) + cloud(240, 50, 0.9) + cloud(470, 85, 0.6),
        groundColor: '#f0d9a2', road: false, dashColor: '',
      };
    case 'garage':
    default:
      return {
        sky: `<rect width="560" height="252" fill="#363c48"/>
              <rect x="0" y="0" width="560" height="18" fill="#2b303a"/>
              <rect x="120" y="26" width="320" height="10" rx="5" fill="#e8f4ff" opacity=".9"/>
              <rect x="120" y="26" width="320" height="10" rx="5" fill="none" stroke="#20242c" stroke-width="2"/>
              <rect x="0" y="60" width="560" height="4" fill="rgba(255,255,255,.06)"/>
              <rect x="0" y="140" width="560" height="4" fill="rgba(255,255,255,.06)"/>`,
        scroll:
          `<g transform="translate(40,70)">
             <rect x="0" y="0" width="110" height="80" rx="6" fill="#2b303a" stroke="#20242c" stroke-width="3"/>
             <rect x="10" y="12" width="34" height="8" rx="4" fill="#8a94a6"/>
             <rect x="10" y="30" width="50" height="8" rx="4" fill="#8a94a6"/>
             <circle cx="86" cy="24" r="12" fill="none" stroke="#8a94a6" stroke-width="5"/>
             <rect x="10" y="52" width="26" height="16" rx="3" fill="#e2574b"/>
           </g>
           <g transform="translate(430,168)">
             <ellipse cx="40" cy="80" rx="46" ry="12" fill="rgba(0,0,0,.3)"/>
             <rect x="4" y="24" width="72" height="20" rx="10" fill="#23262d"/>
             <rect x="8" y="46" width="72" height="20" rx="10" fill="#2b2f37"/>
             <rect x="4" y="68" width="72" height="20" rx="10" fill="#23262d"/>
           </g>
           <g transform="translate(230,66)">
             <rect x="0" y="0" width="90" height="64" rx="4" fill="#f2b641"/>
             <rect x="0" y="0" width="90" height="64" rx="4" fill="none" stroke="#20242c" stroke-width="3"/>
             <text x="45" y="28" text-anchor="middle" font-size="16" font-weight="900" fill="#20242c" font-family="sans-serif">CUSTOM</text>
             <text x="45" y="50" text-anchor="middle" font-size="16" font-weight="900" fill="#e2574b" font-family="sans-serif">GARAGE</text>
           </g>`,
        groundColor: '#585f6b', road: false, dashColor: '',
      };
  }
}
