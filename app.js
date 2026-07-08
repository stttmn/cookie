/* =========================================================
 * app.js — カスタムガレージ本体
 * 状態管理・SVG合成・UI・ガチャ・ギャラリー・PNG書き出し
 * ======================================================= */

/* ---------- カラーユーティリティ ---------- */
function hexToHsl(hex) {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s * 100, l * 100];
}
function hsl(h, s, l) {
  return `hsl(${((h % 360) + 360) % 360}, ${Math.max(0, Math.min(100, s))}%, ${Math.max(0, Math.min(100, l))}%)`;
}
function shade(hex, dl, ds = 0, dh = 0) {
  const [h, s, l] = hexToHsl(hex);
  return hsl(h + dh, s + ds, l + dl);
}

/* ---------- プリセット ---------- */
const PAINTS = ['#e0342f', '#ff7a1a', '#ffce00', '#3fae4c', '#12b5b0', '#1f6ff2',
  '#7a4ff2', '#f261a8', '#f5f3ee', '#22252b', '#8b95a3', '#7a4a22'];
const ACCENTS = ['#ffffff', '#20242c', '#ffce00', '#e0342f', '#1f6ff2', '#12b5b0', '#f261a8', '#ff7a1a'];
const RIMS = ['#d9dee5', '#20242c', '#f2b641', '#c0392b', '#4aa3f0', '#b08bf5'];
const GLOWS = ['#38f0ff', '#ff3fa4', '#7cff4f', '#b06bff'];
const FINISHES = [
  { id: 'solid', name: 'ソリッド', emoji: '🎨' },
  { id: 'metallic', name: 'メタリック', emoji: '✨' },
  { id: 'matte', name: 'マット', emoji: '🧱' },
  { id: 'pearl', name: 'パール', emoji: '🫧' },
];

/* ---------- 状態 ---------- */
const state = {
  car: 'sedan',
  color: '#e0342f',
  finish: 'metallic',
  decal: 'none',
  accent: '#ffffff',
  wheel: 'sport',
  rim: '#d9dee5',
  tint: 35,
  height: 0,       // -6(シャコタン)〜+10(リフトアップ)
  spoiler: false,
  roofbox: false,
  underglow: false,
  glow: '#38f0ff',
  scene: 'city',
  driving: false,
  zekkenNo: 7,
};

/* ---------- SVG合成 ----------
 * ページ内に複数のSVG（ステージ+ギャラリー）を並べるため、
 * defsのidは uid で名前空間を分ける。
 */
function paintDefs(color, finish, uid) {
  if (finish === 'metallic') {
    return `<linearGradient id="paint-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(color, 16, 4)}"/>
      <stop offset=".45" stop-color="${color}"/>
      <stop offset="1" stop-color="${shade(color, -16)}"/>
    </linearGradient>`;
  }
  if (finish === 'pearl') {
    return `<linearGradient id="paint-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(color, 22, 6, -28)}"/>
      <stop offset=".5" stop-color="${color}"/>
      <stop offset="1" stop-color="${shade(color, -10, 4, 26)}"/>
    </linearGradient>`;
  }
  const c = finish === 'matte' ? shade(color, -6, -18) : color;
  return `<linearGradient id="paint-${uid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c}"/>
  </linearGradient>`;
}

function tintColor(t) {
  // t: 0(素通し) 〜 100(スモーク)
  const l = 82 - t * 0.72;
  const s = 40 - t * 0.3;
  return hsl(205, s, l);
}

function carSVG(s, opts = {}) {
  const uid = opts.uid || 'main';
  const car = CARS.find(c => c.id === s.car);
  const scene = sceneSVG(s.scene);
  const sky = scene.sky
    .replaceAll('id="sky"', `id="sky-${uid}"`)
    .replaceAll('url(#sky)', `url(#sky-${uid})`);
  const lift = -s.height; // 上方向が負
  const glass = tintColor(s.tint);
  const spin = s.driving && !opts.still;
  const front = car.wheels[0], rear = car.wheels[car.wheels.length - 1];
  const cx = (front.x + rear.x) / 2;
  const halfW = (rear.x - front.x) / 2 + 60;
  const glossOn = s.finish !== 'matte';

  /* 走行モードのアニメーション */
  const scrollAnim = spin
    ? `<animateTransform attributeName="transform" type="translate" from="0 0" to="-560 0" dur="6s" repeatCount="indefinite"/>`
    : '';
  const dashAnim = spin
    ? `<animateTransform attributeName="transform" type="translate" from="0 0" to="-80 0" dur="0.35s" repeatCount="indefinite"/>`
    : '';
  const bounceAnim = spin
    ? `<animateTransform attributeName="transform" type="translate" values="0 ${lift};0 ${lift - 2};0 ${lift}" dur="0.5s" repeatCount="indefinite"/>`
    : '';

  /* 地面・道路 */
  let ground = `<rect x="0" y="${GROUND_Y}" width="560" height="48" fill="${scene.groundColor}"/>`;
  if (scene.road) {
    ground += `<rect x="0" y="${GROUND_Y}" width="560" height="4" fill="rgba(255,255,255,.25)"/>
      <g clip-path="url(#groundClip-${uid})"><g>${dashAnim}`;
    for (let x = -80; x < 640; x += 80) {
      ground += `<rect x="${x}" y="274" width="42" height="6" rx="3" fill="${scene.dashColor}" opacity=".85"/>`;
    }
    ground += `</g></g>`;
  } else {
    ground += `<rect x="0" y="${GROUND_Y}" width="560" height="5" fill="rgba(0,0,0,.15)"/>`;
  }

  /* デカール */
  const decal = s.decal !== 'none'
    ? `<g clip-path="url(#bodyClip-${uid})">${decalSVG(s.decal, s.accent, car, s.zekkenNo)}</g>`
    : '';

  /* パーツ */
  let parts = '';
  if (s.spoiler) {
    parts += `<path d="${car.spoiler}" fill="${shade(s.color, -24)}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>`;
  }
  if (s.roofbox) {
    const r = car.roof;
    const w = Math.min(150, r.x2 - r.x1 - 16);
    const x = (r.x1 + r.x2) / 2 - w / 2;
    parts += `<g>
      <rect x="${x}" y="${r.y - 20}" width="${w}" height="18" rx="9" fill="#2b303a" stroke="rgba(0,0,0,.4)"/>
      <rect x="${x + 8}" y="${r.y - 16}" width="${w - 16}" height="4" rx="2" fill="rgba(255,255,255,.2)"/>
      <rect x="${x + w * 0.25}" y="${r.y - 4}" width="6" height="6" fill="#20242c"/>
      <rect x="${x + w * 0.72}" y="${r.y - 4}" width="6" height="6" fill="#20242c"/>
    </g>`;
  }

  /* アンダーグロウ */
  const glow = s.underglow
    ? `<ellipse cx="${cx}" cy="${car.bottom + 14 + lift}" rx="${halfW}" ry="12"
         fill="${s.glow}" opacity=".75" filter="url(#blurGlow-${uid})"/>`
    : '';

  /* ヘッドライトビーム（ナイト×走行のお楽しみ） */
  const beam = (s.scene === 'night' && spin)
    ? `<path d="M 60 ${car.bottom - 46} L 0 ${car.bottom - 70} L 0 ${car.bottom - 6} L 60 ${car.bottom - 30} Z"
        fill="#fff8c4" opacity=".35"/>`
    : '';

  const windows = car.windows.map(w =>
    `<path d="${w}" fill="${glass}" stroke="rgba(20,28,40,.5)" stroke-width="2"/>`).join('');

  const details = car.details.map(d =>
    `<path d="${d}" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="2"/>`).join('');

  const handles = (car.handles || []).map(([hx, hy]) =>
    `<rect x="${hx}" y="${hy}" width="16" height="4.5" rx="2.2" fill="rgba(0,0,0,.35)"/>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 300" width="100%" height="100%" role="img" aria-label="カスタムした車のプレビュー">
    <defs>
      ${paintDefs(s.color, s.finish, uid)}
      <clipPath id="bodyClip-${uid}"><path d="${car.body}"/></clipPath>
      <clipPath id="groundClip-${uid}"><rect x="0" y="${GROUND_Y}" width="560" height="48"/></clipPath>
      <filter id="blurGlow-${uid}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="7"/>
      </filter>
    </defs>

    ${sky}
    <g><g>${scrollAnim}<g>${scene.scroll}</g><g transform="translate(560,0)">${scene.scroll}</g></g></g>
    ${ground}

    <ellipse cx="${cx}" cy="${GROUND_Y + 8}" rx="${halfW + 20}" ry="11" fill="rgba(0,0,0,.3)"/>
    ${glow}

    <g transform="translate(0 ${lift})">${bounceAnim}
      ${beam}
      ${car.wheels.map(w => `<path d="M ${w.x - car.arch} ${car.bottom} A ${car.arch} ${car.arch} 0 0 1 ${w.x + car.arch} ${car.bottom} Z" fill="#12151b"/>`).join('')}
      <path d="${car.mirror}" fill="${shade(s.color, -18)}" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/>
      ${parts}
      <path d="${car.body}" fill="url(#paint-${uid})" stroke="rgba(10,14,20,.45)" stroke-width="2.5" stroke-linejoin="round"/>
      ${decal}
      <g clip-path="url(#bodyClip-${uid})">
        <rect x="0" y="${car.bottom - 9}" width="560" height="24" fill="rgba(0,0,0,.2)"/>
        ${glossOn ? `<path d="M 40 ${car.bottom - 44} Q 280 ${car.bottom - 66} 530 ${car.bottom - 48} L 530 ${car.bottom - 40} Q 280 ${car.bottom - 58} 40 ${car.bottom - 36} Z" fill="rgba(255,255,255,.28)"/>` : ''}
      </g>
      ${windows}
      ${details}
      ${handles}
      <path d="${car.lights.head}" fill="#ffe9a3" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/>
      <path d="${car.lights.tail}" fill="#e6483d" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/>
    </g>

    ${car.wheels.map(w => wheelSVG(w.x, w.r, s.wheel, s.rim, spin)).join('')}
  </svg>`;
}

/* ---------- 愛車ネーム生成 ---------- */
function carNickname(s) {
  const [h, sat, l] = hexToHsl(s.color);
  let colorWord;
  if (l > 82) colorWord = '純白';
  else if (l < 20) colorWord = '漆黒';
  else if (sat < 18) colorWord = '銀灰';
  else if (h < 18 || h >= 340) colorWord = '真紅';
  else if (h < 42) colorWord = '蜜柑';
  else if (h < 70) colorWord = '黄金';
  else if (h < 160) colorWord = '若葉';
  else if (h < 200) colorWord = '翡翠';
  else if (h < 250) colorWord = '蒼空';
  else if (h < 290) colorWord = '菫色';
  else colorWord = '桜色';

  const carWord = {
    sedan: '紳士', sports: '韋駄天', suv: '冒険者',
    kei: 'ちびっこ', pickup: '力持ち', van: '旅がらす',
  }[s.car];

  const flavor = {
    none: '', stripes: 'レーサー', sideline: 'スタイラー', flame: 'ファイア',
    dots: 'ポップ', bolt: 'サンダー', zekken: 'チャンプ',
  }[s.decal];

  return `${colorWord}の${carWord}${flavor ? '・' + flavor : ''}号`;
}

/* ---------- UI 構築 ---------- */
const $ = sel => document.querySelector(sel);

function buildChoices() {
  $('#carChips').innerHTML = CARS.map(c =>
    `<button type="button" class="chip${state.car === c.id ? ' active' : ''}" data-car="${c.id}">
       <span class="chip-emoji">${c.emoji}</span>${c.name}</button>`).join('');

  $('#paintSwatches').innerHTML = PAINTS.map(p =>
    `<button type="button" class="swatch${state.color === p ? ' active' : ''}" data-paint="${p}" style="--c:${p}" aria-label="ボディカラー ${p}"></button>`).join('');

  $('#finishChips').innerHTML = FINISHES.map(f =>
    `<button type="button" class="chip${state.finish === f.id ? ' active' : ''}" data-finish="${f.id}">
       <span class="chip-emoji">${f.emoji}</span>${f.name}</button>`).join('');

  $('#decalChips').innerHTML = DECALS.map(d =>
    `<button type="button" class="chip${state.decal === d.id ? ' active' : ''}" data-decal="${d.id}">
       <span class="chip-emoji">${d.emoji}</span>${d.name}</button>`).join('');

  $('#accentSwatches').innerHTML = ACCENTS.map(p =>
    `<button type="button" class="swatch small${state.accent === p ? ' active' : ''}" data-accent="${p}" style="--c:${p}" aria-label="デカール色 ${p}"></button>`).join('');

  $('#wheelChips').innerHTML = WHEELS.map(w =>
    `<button type="button" class="chip${state.wheel === w.id ? ' active' : ''}" data-wheel="${w.id}">
       <span class="chip-emoji">${w.emoji}</span>${w.name}</button>`).join('');

  $('#rimSwatches').innerHTML = RIMS.map(p =>
    `<button type="button" class="swatch small${state.rim === p ? ' active' : ''}" data-rim="${p}" style="--c:${p}" aria-label="リム色 ${p}"></button>`).join('');

  $('#glowSwatches').innerHTML = GLOWS.map(p =>
    `<button type="button" class="swatch small${state.glow === p ? ' active' : ''}" data-glow="${p}" style="--c:${p}" aria-label="ネオン色 ${p}"></button>`).join('');

  $('#sceneChips').innerHTML = SCENES.map(sc =>
    `<button type="button" class="chip${state.scene === sc.id ? ' active' : ''}" data-scene="${sc.id}">
       <span class="chip-emoji">${sc.emoji}</span>${sc.name}</button>`).join('');
}

function render() {
  $('#stage').innerHTML = carSVG(state);
  $('#carName').textContent = carNickname(state);
  $('#driveBtn').classList.toggle('on', state.driving);
  $('#driveBtn').innerHTML = state.driving ? '🛑 とまる' : '🏁 はしる！';
  $('#spoilerBtn').classList.toggle('on', state.spoiler);
  $('#roofboxBtn').classList.toggle('on', state.roofbox);
  $('#glowBtn').classList.toggle('on', state.underglow);
  $('#glowSwatches').style.display = state.underglow ? '' : 'none';
  $('#accentRow').style.display = state.decal !== 'none' ? '' : 'none';
}

function refresh() { buildChoices(); render(); }

/* ---------- ガチャ ---------- */
const rand = arr => arr[Math.floor(Math.random() * arr.length)];

function gacha() {
  state.car = rand(CARS).id;
  state.color = rand(PAINTS);
  state.finish = rand(FINISHES).id;
  state.decal = rand(DECALS).id;
  state.accent = rand(ACCENTS);
  state.wheel = rand(WHEELS).id;
  state.rim = rand(RIMS);
  state.scene = rand(SCENES).id;
  state.tint = Math.floor(Math.random() * 90);
  state.height = rand([-6, -4, 0, 0, 4, 8]);
  state.spoiler = Math.random() < 0.4;
  state.roofbox = Math.random() < 0.25;
  state.underglow = Math.random() < 0.3;
  state.glow = rand(GLOWS);
  state.zekkenNo = 1 + Math.floor(Math.random() * 98);
  $('#tintRange').value = state.tint;
  $('#heightRange').value = state.height;
  refresh();
  const stage = $('#stageWrap');
  stage.classList.remove('shake');
  void stage.offsetWidth; // reflowでアニメーションを再発火させる
  stage.classList.add('shake');
}

/* ---------- ギャラリー ---------- */
const STORE_KEY = 'custom-garage-saves';

function loadSaves() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch { return []; }
}

function renderGallery() {
  const saves = loadSaves();
  const wrap = $('#gallery');
  const count = $('#galleryCount');
  count.textContent = saves.length ? `${saves.length}台` : '';
  count.style.display = saves.length ? '' : 'none';
  if (!saves.length) {
    wrap.innerHTML = '<p class="empty">まだ保存された愛車はありません。「💾 ガレージに保存」でコレクションしよう！</p>';
    return;
  }
  wrap.innerHTML = saves.map(sv => `
    <div class="garage-card">
      <div class="thumb">${carSVG({ ...sv.config, driving: false }, { still: true, uid: 't' + sv.id })}</div>
      <div class="garage-meta">
        <span class="garage-name">${sv.name}</span>
        <span class="garage-actions">
          <button type="button" class="mini-btn" data-load="${sv.id}">のせる</button>
          <button type="button" class="mini-btn del" data-del="${sv.id}" aria-label="削除">🗑</button>
        </span>
      </div>
    </div>`).join('');
}

function saveCurrent() {
  const saves = loadSaves();
  saves.unshift({
    id: Date.now().toString(36),
    name: carNickname(state),
    config: { ...state, driving: false },
  });
  localStorage.setItem(STORE_KEY, JSON.stringify(saves.slice(0, 24)));
  renderGallery();
  toast(`「${carNickname(state)}」をガレージに保存しました！`);
}

/* ---------- PNG書き出し ---------- */
function downloadPNG() {
  const svgText = carSVG({ ...state, driving: false }, { still: true })
    .replace('width="100%" height="100%"', 'width="1120" height="600"');
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1120; canvas.height = 600;
    canvas.getContext('2d').drawImage(img, 0, 0, 1120, 600);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => {
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = pngUrl;
      // 日本語ファイル名は環境により落ちるためASCII安全な名前にする
      a.download = `custom-garage-${state.car}-${Date.now().toString(36)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(pngUrl), 4000);
      toast('PNG画像を保存しました！');
    }, 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('画像の書き出しに失敗しました…'); };
  img.src = url;
}

/* ---------- トースト ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- イベント ---------- */
function init() {
  buildChoices();
  render();
  renderGallery();

  $('#controls').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.car) state.car = d.car;
    else if (d.paint) state.color = d.paint;
    else if (d.finish) state.finish = d.finish;
    else if (d.decal) {
      state.decal = d.decal;
      if (d.decal === 'zekken') state.zekkenNo = 1 + Math.floor(Math.random() * 98);
    }
    else if (d.accent) state.accent = d.accent;
    else if (d.wheel) state.wheel = d.wheel;
    else if (d.rim) state.rim = d.rim;
    else if (d.glow) state.glow = d.glow;
    else if (d.scene) state.scene = d.scene;
    else if (b.id === 'spoilerBtn') state.spoiler = !state.spoiler;
    else if (b.id === 'roofboxBtn') state.roofbox = !state.roofbox;
    else if (b.id === 'glowBtn') state.underglow = !state.underglow;
    else return;
    refresh();
  });

  $('#paintPicker').addEventListener('input', e => { state.color = e.target.value; refresh(); });
  $('#accentPicker').addEventListener('input', e => { state.accent = e.target.value; refresh(); });
  $('#tintRange').addEventListener('input', e => { state.tint = +e.target.value; render(); });
  $('#heightRange').addEventListener('input', e => { state.height = +e.target.value; render(); });

  $('#gachaBtn').addEventListener('click', gacha);
  $('#driveBtn').addEventListener('click', () => { state.driving = !state.driving; render(); });
  $('#saveBtn').addEventListener('click', saveCurrent);
  $('#pngBtn').addEventListener('click', downloadPNG);

  $('#gallery').addEventListener('click', e => {
    const load = e.target.closest('[data-load]');
    const del = e.target.closest('[data-del]');
    if (load) {
      const sv = loadSaves().find(x => x.id === load.dataset.load);
      if (sv) {
        Object.assign(state, sv.config, { driving: false });
        $('#tintRange').value = state.tint;
        $('#heightRange').value = state.height;
        refresh();
        toast(`「${sv.name}」をステージにのせました！`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (del) {
      const saves = loadSaves().filter(x => x.id !== del.dataset.del);
      localStorage.setItem(STORE_KEY, JSON.stringify(saves));
      renderGallery();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
