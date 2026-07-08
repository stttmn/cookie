/* =========================================================
 * cars.js — 車種・ホイール・デカールの形状定義
 * 座標系: viewBox 0 0 560 300 / 地面 y=252
 * ======================================================= */

const GROUND_Y = 252;

/* ---------- 車種定義 ----------
 * body    : ボディ塗装面（ホイールアーチ込みのシルエット）
 * windows : ガラス面のパス配列
 * lights  : head(前照灯) / tail(尾灯)
 * details : ドアの継ぎ目などの線（stroke描画）
 * handles : ドアハンドル [x, y]
 * mirror  : サイドミラー
 * spoiler : スポイラー装着時のパス
 * roof    : ルーフボックス設置範囲 {x1, x2, y}
 * wheels  : [{x, r}] 接地はアプリ側で計算
 */
const CARS = [
  {
    id: 'sedan', arch: 44, name: 'セダン', emoji: '🚗',
    bottom: 218,
    wheels: [{ x: 152, r: 33 }, { x: 408, r: 33 }],
    body: `M 58 218 L 54 196 Q 54 176 80 170 L 96 166
           Q 150 158 188 156 Q 210 120 254 114 L 330 114
           Q 372 118 394 152 Q 458 158 482 168 Q 504 174 505 194
           L 502 218 L 452 218 A 44 44 0 0 0 364 218
           L 196 218 A 44 44 0 0 0 108 218 Z`,
    windows: [
      'M 214 150 Q 230 126 256 121 L 294 121 L 294 150 Z',
      'M 302 121 L 328 121 Q 360 125 376 149 L 302 150 Z',
    ],
    lights: {
      head: 'M 58 172 Q 72 166 92 165 L 87 180 Q 68 180 58 182 Z',
      tail: 'M 482 170 Q 500 175 503 188 L 486 188 Z',
    },
    details: ['M 262 156 L 258 212', 'M 344 156 L 348 212'],
    handles: [[268, 168], [352, 168]],
    mirror: 'M 240 152 Q 236 142 246 141 L 254 145 L 252 154 Z',
    spoiler: 'M 448 148 L 496 143 L 499 152 L 451 157 Z',
    roof: { x1: 256, x2: 328, y: 114 },
  },
  {
    id: 'sports', arch: 44, name: 'スポーツ', emoji: '🏎️',
    bottom: 222,
    wheels: [{ x: 140, r: 34 }, { x: 420, r: 34 }],
    body: `M 46 222 L 42 202 Q 42 186 70 182 Q 130 172 190 168
           Q 230 132 280 128 L 330 128 Q 380 134 404 164
           Q 470 170 500 182 Q 518 188 516 204 L 512 222
           L 464 222 A 44 44 0 0 0 376 222
           L 184 222 A 44 44 0 0 0 96 222 Z`,
    windows: [
      'M 236 162 Q 252 138 284 133 L 318 133 L 320 162 Z',
      'M 328 133 Q 366 139 386 160 L 330 162 Z',
    ],
    lights: {
      head: 'M 46 188 L 86 181 L 88 190 L 48 196 Z',
      tail: 'M 494 184 L 514 192 L 512 203 L 492 197 Z',
    },
    details: ['M 292 166 L 288 218', 'M 368 168 L 372 218'],
    handles: [[300, 178]],
    mirror: 'M 262 164 Q 258 154 268 153 L 276 157 L 274 166 Z',
    spoiler: `M 458 148 L 512 141 L 514 151 L 460 158 Z
              M 478 154 L 488 153 L 493 180 L 483 181 Z`,
    roof: { x1: 282, x2: 328, y: 128 },
  },
  {
    id: 'suv', arch: 50, name: 'SUV', emoji: '🚙',
    bottom: 210,
    wheels: [{ x: 150, r: 38 }, { x: 414, r: 38 }],
    body: `M 62 210 L 58 180 Q 58 160 84 154 L 98 150
           Q 150 142 205 140 L 240 104 Q 248 98 264 98 L 400 98
           Q 416 98 422 106 L 430 140 L 478 148 Q 502 154 503 176
           L 500 210 L 464 210 A 50 50 0 0 0 364 210
           L 200 210 A 50 50 0 0 0 100 210 Z`,
    windows: [
      'M 250 134 Q 260 106 286 103 L 316 103 L 316 134 Z',
      'M 324 103 L 396 103 Q 408 104 412 112 L 418 134 L 324 134 Z',
    ],
    lights: {
      head: 'M 60 164 Q 74 158 96 156 L 92 172 Q 72 172 60 174 Z',
      tail: 'M 490 152 Q 502 158 502 174 L 488 176 Z',
    },
    details: ['M 320 140 L 320 206', 'M 250 140 L 248 206'],
    handles: [[262, 152], [332, 152]],
    mirror: 'M 244 134 Q 240 124 250 123 L 258 127 L 256 136 Z',
    spoiler: 'M 402 90 L 436 95 L 432 106 L 402 100 Z',
    roof: { x1: 266, x2: 398, y: 98 },
  },
  {
    id: 'kei', arch: 40, name: '軽ワゴン', emoji: '🚐',
    bottom: 216,
    wheels: [{ x: 160, r: 30 }, { x: 402, r: 30 }],
    body: `M 96 216 L 92 178 Q 92 158 116 152 L 148 148
           L 170 106 Q 176 96 192 96 L 424 96 Q 442 96 446 112
           L 452 152 Q 466 158 466 180 L 462 216
           L 442 216 A 40 40 0 0 0 362 216
           L 200 216 A 40 40 0 0 0 120 216 Z`,
    windows: [
      'M 180 142 L 196 103 L 268 103 L 268 142 Z',
      'M 276 103 L 420 103 Q 434 104 436 116 L 440 142 L 276 142 Z',
    ],
    lights: {
      head: 'M 102 162 Q 102 155 111 155 Q 121 155 121 162 Q 121 170 111 170 Q 102 170 102 162 Z',
      tail: 'M 452 156 L 464 162 L 462 186 L 452 184 Z',
    },
    details: ['M 272 148 L 270 214', 'M 358 148 L 360 214'],
    handles: [[282, 158], [370, 158]],
    mirror: 'M 174 138 Q 170 128 180 127 L 188 131 L 186 140 Z',
    spoiler: 'M 420 88 L 452 96 L 448 106 L 420 98 Z',
    roof: { x1: 194, x2: 422, y: 96 },
  },
  {
    id: 'pickup', arch: 48, name: 'ピックアップ', emoji: '🛻',
    bottom: 212,
    wheels: [{ x: 148, r: 36 }, { x: 420, r: 36 }],
    body: `M 58 212 L 54 176 Q 54 158 80 152 L 96 148
           Q 140 142 192 140 L 216 106 Q 224 98 240 98 L 330 98
           Q 344 98 346 110 L 348 138 L 500 138 L 504 212
           L 468 212 A 48 48 0 0 0 372 212
           L 196 212 A 48 48 0 0 0 100 212 Z`,
    windows: [
      'M 226 134 L 242 104 Q 246 101 254 101 L 286 101 L 286 134 Z',
      'M 294 101 L 328 101 Q 340 102 340 112 L 340 134 L 294 134 Z',
    ],
    lights: {
      head: 'M 58 160 Q 72 154 94 152 L 90 168 Q 68 168 58 170 Z',
      tail: 'M 492 142 L 502 142 L 502 168 L 492 166 Z',
    },
    details: ['M 352 142 L 352 208', 'M 250 140 L 248 208'],
    handles: [[262, 152]],
    mirror: 'M 220 134 Q 216 124 226 123 L 234 127 L 232 136 Z',
    spoiler: 'M 474 128 L 504 128 L 504 138 L 474 138 Z',
    roof: { x1: 242, x2: 328, y: 98 },
  },
  {
    id: 'van', arch: 45, name: 'バン', emoji: '🚌',
    bottom: 214,
    wheels: [{ x: 150, r: 34 }, { x: 420, r: 34 }],
    body: `M 64 214 L 60 172 L 68 116 Q 70 100 90 100 L 470 100
           Q 492 100 494 122 L 498 176 L 496 214
           L 465 214 A 45 45 0 0 0 375 214
           L 195 214 A 45 45 0 0 0 105 214 Z`,
    windows: [
      'M 66 150 L 72 112 Q 74 106 84 106 L 122 106 L 122 150 Z',
      'M 132 106 L 244 106 L 244 150 L 132 150 Z',
      'M 254 106 L 452 106 L 456 150 L 254 150 Z',
    ],
    lights: {
      head: 'M 62 156 L 92 156 L 92 172 L 62 170 Z',
      tail: 'M 488 128 L 496 128 L 498 160 L 488 158 Z',
    },
    details: ['M 128 152 L 128 210', 'M 250 152 L 250 210'],
    handles: [[140, 164], [262, 164]],
    mirror: 'M 60 128 Q 52 126 52 134 Q 52 142 60 140 Z',
    spoiler: 'M 450 92 L 486 100 L 482 110 L 450 102 Z',
    roof: { x1: 92, x2: 468, y: 100 },
  },
];

/* ---------- ホイールデザイン ---------- */
const WHEELS = [
  { id: 'sport', name: 'スポーク', emoji: '☀️' },
  { id: 'mesh', name: 'メッシュ', emoji: '🕸️' },
  { id: 'dish', name: 'ディッシュ', emoji: '💿' },
  { id: 'star', name: 'スター', emoji: '⭐' },
  { id: 'steel', name: '鉄チン', emoji: '⚙️' },
];

/* ホイール1本のSVGを生成。spin=true で回転アニメーション付き */
function wheelSVG(x, r, design, rimColor, spin) {
  const cy = GROUND_Y - r;
  const rim = r * 0.62;
  const hub = Math.max(3.5, r * 0.14);
  let spokes = '';

  if (design === 'sport') {
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 * Math.PI) / 180;
      spokes += `<line x1="${x}" y1="${cy}" x2="${x + Math.cos(a) * rim}" y2="${cy + Math.sin(a) * rim}"
        stroke="${rimColor}" stroke-width="${r * 0.18}" stroke-linecap="round"/>`;
    }
  } else if (design === 'mesh') {
    for (let i = 0; i < 10; i++) {
      const a = (i * 36 * Math.PI) / 180;
      spokes += `<line x1="${x}" y1="${cy}" x2="${x + Math.cos(a) * rim}" y2="${cy + Math.sin(a) * rim}"
        stroke="${rimColor}" stroke-width="${r * 0.08}" stroke-linecap="round"/>`;
    }
    spokes += `<circle cx="${x}" cy="${cy}" r="${rim * 0.55}" fill="none" stroke="${rimColor}" stroke-width="${r * 0.07}"/>`;
  } else if (design === 'dish') {
    spokes = `<circle cx="${x}" cy="${cy}" r="${rim * 0.92}" fill="${rimColor}"/>`;
    for (let i = 0; i < 5; i++) {
      const a = ((i * 72 + 18) * Math.PI) / 180;
      spokes += `<circle cx="${x + Math.cos(a) * rim * 0.62}" cy="${cy + Math.sin(a) * rim * 0.62}"
        r="${r * 0.06}" fill="rgba(0,0,0,.45)"/>`;
    }
  } else if (design === 'star') {
    let d = '';
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * (Math.PI / 180);
      const a1 = a - 0.32, a2 = a + 0.32;
      d += `M ${x + Math.cos(a1) * hub * 1.6} ${cy + Math.sin(a1) * hub * 1.6}
            L ${x + Math.cos(a) * rim} ${cy + Math.sin(a) * rim}
            L ${x + Math.cos(a2) * hub * 1.6} ${cy + Math.sin(a2) * hub * 1.6} Z `;
    }
    spokes = `<path d="${d}" fill="${rimColor}"/>`;
  } else { // steel
    spokes = `<circle cx="${x}" cy="${cy}" r="${rim * 0.92}" fill="${rimColor}"/>`;
    for (let i = 0; i < 4; i++) {
      const a = ((i * 90 + 45) * Math.PI) / 180;
      spokes += `<circle cx="${x + Math.cos(a) * rim * 0.5}" cy="${cy + Math.sin(a) * rim * 0.5}"
        r="${r * 0.11}" fill="rgba(0,0,0,.5)"/>`;
    }
  }

  const anim = spin
    ? `<animateTransform attributeName="transform" type="rotate"
         from="0 ${x} ${cy}" to="360 ${x} ${cy}" dur="0.55s" repeatCount="indefinite"/>`
    : '';

  return `
    <g>
      <circle cx="${x}" cy="${cy}" r="${r}" fill="#1b1e24"/>
      <circle cx="${x}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
      <circle cx="${x}" cy="${cy}" r="${rim}" fill="#23262d"/>
      <g>${spokes}${anim}</g>
      <circle cx="${x}" cy="${cy}" r="${rim}" fill="none" stroke="${rimColor}" stroke-width="${r * 0.09}"/>
      <circle cx="${x}" cy="${cy}" r="${hub}" fill="#d7dde4" stroke="rgba(0,0,0,.35)"/>
    </g>`;
}

/* ---------- デカール ----------
 * 各関数は accent(色) と car を受け取り、ボディにクリップされる前提の
 * SVG文字列を返す。
 */
const DECALS = [
  { id: 'none', name: 'なし', emoji: '🚫' },
  { id: 'stripes', name: 'ストライプ', emoji: '🏁' },
  { id: 'sideline', name: 'サイドライン', emoji: '➖' },
  { id: 'flame', name: 'ファイア', emoji: '🔥' },
  { id: 'dots', name: '水玉', emoji: '🎈' },
  { id: 'bolt', name: 'サンダー', emoji: '⚡' },
  { id: 'zekken', name: 'ゼッケン', emoji: '🎯' },
];

function decalSVG(id, accent, car, zekkenNo) {
  const b = car.bottom;
  switch (id) {
    case 'stripes': {
      let s = '';
      [200, 252, 304].forEach((x, i) => {
        const w = i === 1 ? 30 : 20;
        s += `<path d="M ${x} 250 L ${x + 55} 88 L ${x + 55 + w} 88 L ${x + w} 250 Z" fill="${accent}" opacity="${i === 1 ? 0.95 : 0.8}"/>`;
      });
      return s;
    }
    case 'sideline':
      return `<rect x="0" y="${b - 58}" width="560" height="15" fill="${accent}" opacity=".95"/>
              <rect x="0" y="${b - 38}" width="560" height="6" fill="${accent}" opacity=".6"/>`;
    case 'flame': {
      const d = `M 30 ${b + 10} L 30 130
        Q 100 122 132 148 Q 150 118 166 152 Q 214 128 198 166
        Q 250 146 224 182 Q 276 166 244 198 Q 296 186 260 212
        Q 306 206 268 224 Q 310 222 272 236 L 30 ${b + 10} Z`;
      return `<path d="${d}" fill="${accent}" opacity=".92"/>
              <path d="${d}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" transform="translate(-6,4) scale(.97)"/>`;
    }
    case 'dots': {
      let s = '';
      for (let ix = 0; ix < 10; ix++) {
        for (let iy = 0; iy < 4; iy++) {
          const x = 55 + ix * 52 + (iy % 2) * 26;
          const y = 104 + iy * 42;
          s += `<circle cx="${x}" cy="${y}" r="11" fill="${accent}" opacity=".85"/>`;
        }
      }
      return s;
    }
    case 'bolt':
      return `<path d="M 216 104 L 292 104 L 254 158 L 310 158 L 198 244 L 244 172 L 186 172 Z"
                fill="${accent}" stroke="rgba(255,255,255,.5)" stroke-width="3" stroke-linejoin="round"/>`;
    case 'zekken': {
      const cx = 290, cy = b - 44;
      return `<circle cx="${cx}" cy="${cy}" r="27" fill="#fdfdf8"/>
              <circle cx="${cx}" cy="${cy}" r="27" fill="none" stroke="${accent}" stroke-width="4.5"/>
              <text x="${cx}" y="${cy + 11}" text-anchor="middle" font-size="31" font-weight="900"
                font-family="'Arial Black',sans-serif" fill="#20242c">${zekkenNo}</text>
              <rect x="0" y="${cy + 34}" width="560" height="7" fill="${accent}" opacity=".8"/>`;
    }
    default:
      return '';
  }
}
