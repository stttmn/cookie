/* =========================================================
 * app.js — カスタムガレージ（実車写真版）本体
 * 検索 → 車えらび → カスタム → 保存/書き出し
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

/* ---------- プリセット ---------- */
const PAINTS = ['#e0342f', '#ff7a1a', '#ffce00', '#3fae4c', '#12b5b0', '#1f6ff2',
  '#7a4ff2', '#f261a8', '#f5f3ee', '#22252b', '#8b95a3', '#7a4a22'];
const ACCENTS = ['#ffffff', '#20242c', '#ffce00', '#e0342f', '#1f6ff2', '#12b5b0', '#f261a8', '#ff7a1a'];
const GLOWS = ['#38f0ff', '#ff3fa4', '#7cff4f', '#b06bff'];
const FINISHES = [
  { id: 'none', name: 'そのまま', emoji: '📷' },
  { id: 'gloss', name: 'グロス', emoji: '✨' },
  { id: 'matte', name: 'マット', emoji: '🧱' },
];
const DECALS = [
  { id: 'none', name: 'なし', emoji: '🚫' },
  { id: 'stripes', name: 'ストライプ', emoji: '🏁' },
  { id: 'sideline', name: 'サイドライン', emoji: '➖' },
  { id: 'flame', name: 'ファイア', emoji: '🔥' },
  { id: 'dots', name: '水玉', emoji: '🎈' },
  { id: 'bolt', name: 'サンダー', emoji: '⚡' },
  { id: 'zekken', name: 'ゼッケン', emoji: '🎯' },
];

/* ---------- 状態 ---------- */
const state = {
  car: null,          // commonsSearch の結果1件 {title, large, page, artist, license, ...}
  color: null,        // null = オリジナルカラー
  strength: 0.85,
  finish: 'none',
  decal: 'none',
  accent: '#ffffff',
  neon: null,
  scale: 1,
  lift: 0,
  flip: false,
  scene: 'city',
  zekkenNo: 7,
  driving: false,
};

let carImg = null;        // HTMLImageElement
let carAnalysis = null;   // {hasAlpha, bbox}
let styledCar = null;     // {canvas, bbox, hasAlpha}
let currentScene = null;
let lastResults = [];     // ガチャの車替え用プール
let rafId = null;
let driveOffset = 0;

const $ = sel => document.querySelector(sel);
const rand = arr => arr[Math.floor(Math.random() * arr.length)];

/* ---------- 描画 ---------- */
const canvas = () => $('#stage');

function restyle() {
  styledCar = carImg ? buildStyledCar(carImg, carAnalysis, state) : null;
}

function draw(t = 0) {
  if (!currentScene) return;
  const ctx = canvas().getContext('2d');
  composeStage(ctx, currentScene, styledCar, state, {
    t, offset: driveOffset, driving: state.driving,
  });
}

function startDrive() {
  cancelAnimationFrame(rafId);
  let last = performance.now();
  const loop = now => {
    driveOffset += (now - last) * 0.22;
    last = now;
    draw(now);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function stopDrive() {
  cancelAnimationFrame(rafId);
  rafId = null;
  draw();
}

async function setScene(id) {
  state.scene = id;
  currentScene = await loadScene(id);
  draw();
}

/* ---------- 車のロード ---------- */
async function selectCar(item) {
  toast(`「${shortTitle(item.title)}」を読み込み中…`);
  try {
    const img = await loadCarImage(item.large);
    carImg = img;
    carAnalysis = analyzeImage(img);
    state.car = item;
    restyle();
    draw();
    updateUI();
    if (!carAnalysis.hasAlpha) {
      toast('この画像は切り抜きではないのでそのまま表示します。色替え・デカールには「切り抜き(PNG)」の画像がおすすめ！');
    } else {
      toast(`「${shortTitle(item.title)}」をステージにのせました！`);
    }
  } catch (e) {
    toast('画像を読み込めませんでした。別の画像を試してみてください');
  }
}

function shortTitle(t) {
  return t.length > 28 ? t.slice(0, 28) + '…' : t;
}

/* ---------- 検索 ---------- */
async function doSearch(term) {
  const grid = $('#results');
  grid.innerHTML = '<p class="hint">🔍 さがしています…</p>';
  try {
    const pngOnly = $('#pngOnly').checked;
    const results = await commonsSearch(term, { pngOnly });
    lastResults = results;
    if (!results.length) {
      grid.innerHTML = '<p class="hint">見つかりませんでした。英語の車名（例: Nissan GT-R）や「切り抜きのみ」オフで試してみてください</p>';
      return;
    }
    grid.innerHTML = results.map((r, i) => `
      <button type="button" class="result-card" data-pick="${i}" title="${r.title}">
        <span class="result-thumb"><img src="${r.thumb}" alt="${r.title}" loading="lazy"></span>
        <span class="result-name">${shortTitle(r.title)}</span>
      </button>`).join('');
  } catch (e) {
    grid.innerHTML = `<p class="hint">検索に失敗しました（${e.message}）。ネット接続を確認して再度お試しください</p>`;
  }
}

/* ---------- 愛車ネーム ---------- */
function carNickname() {
  if (!state.car) return '';
  let colorWord = '';
  if (state.color) {
    const [h, sat, l] = hexToHsl(state.color);
    if (l > 82) colorWord = '純白の';
    else if (l < 20) colorWord = '漆黒の';
    else if (sat < 18) colorWord = '銀灰の';
    else if (h < 18 || h >= 340) colorWord = '真紅の';
    else if (h < 42) colorWord = '蜜柑の';
    else if (h < 70) colorWord = '黄金の';
    else if (h < 160) colorWord = '若葉の';
    else if (h < 200) colorWord = '翡翠の';
    else if (h < 250) colorWord = '蒼空の';
    else if (h < 290) colorWord = '菫色の';
    else colorWord = '桜色の';
  }
  const flavor = {
    none: '', stripes: 'レーサー', sideline: 'スタイラー', flame: 'ファイア',
    dots: 'ポップ', bolt: 'サンダー', zekken: 'チャンプ',
  }[state.decal];
  return `${colorWord}${shortTitle(state.car.title)}${flavor ? '・' + flavor : ''}号`;
}

/* ---------- UI ---------- */
function buildStaticChoices() {
  $('#quickChips').innerHTML = QUICK_CARS.map(c =>
    `<button type="button" class="chip" data-quick="${c.q}">${c.label}</button>`).join('');

  $('#paintSwatches').innerHTML =
    `<button type="button" class="chip small-chip${state.color === null ? ' active' : ''}" data-original="1">オリジナル</button>` +
    PAINTS.map(p =>
      `<button type="button" class="swatch${state.color === p ? ' active' : ''}" data-paint="${p}" style="--c:${p}" aria-label="ボディカラー ${p}"></button>`).join('');

  $('#finishChips').innerHTML = FINISHES.map(f =>
    `<button type="button" class="chip${state.finish === f.id ? ' active' : ''}" data-finish="${f.id}">
      <span class="chip-emoji">${f.emoji}</span>${f.name}</button>`).join('');

  $('#decalChips').innerHTML = DECALS.map(d =>
    `<button type="button" class="chip${state.decal === d.id ? ' active' : ''}" data-decal="${d.id}">
      <span class="chip-emoji">${d.emoji}</span>${d.name}</button>`).join('');

  $('#accentSwatches').innerHTML = ACCENTS.map(p =>
    `<button type="button" class="swatch small${state.accent === p ? ' active' : ''}" data-accent="${p}" style="--c:${p}" aria-label="デカール色 ${p}"></button>`).join('');

  $('#glowSwatches').innerHTML = GLOWS.map(p =>
    `<button type="button" class="swatch small${state.neon === p ? ' active' : ''}" data-glow="${p}" style="--c:${p}" aria-label="ネオン色 ${p}"></button>`).join('');

  $('#sceneChips').innerHTML = SCENES.map(sc =>
    `<button type="button" class="chip${state.scene === sc.id ? ' active' : ''}" data-scene="${sc.id}">
      <span class="chip-emoji">${sc.emoji}</span>${sc.name}</button>`).join('');
}

function updateUI() {
  buildStaticChoices();
  $('#carName').textContent = state.car ? carNickname() : 'まだ車がえらばれていません';
  $('#driveBtn').classList.toggle('on', state.driving);
  $('#driveBtn').innerHTML = state.driving ? '🛑 とまる' : '🏁 はしる！';
  $('#flipBtn').classList.toggle('on', state.flip);
  $('#glowSwatches').style.display = state.neon ? '' : 'none';
  $('#neonBtn').classList.toggle('on', !!state.neon);
  $('#accentRow').style.display = state.decal !== 'none' ? '' : 'none';
  $('#strengthRow').style.display = state.color ? '' : 'none';

  // クレジット表記
  const cr = $('#credit');
  if (state.car && state.car.page && state.car.page !== '#') {
    cr.innerHTML = `画像: <a href="${state.car.page}" target="_blank" rel="noopener">${shortTitle(state.car.title)}</a>` +
      `${state.car.artist ? '（' + state.car.artist + '）' : ''}${state.car.license ? ' / ' + state.car.license : ''} — Wikimedia Commons`;
  } else if (state.car) {
    cr.textContent = `画像: ${state.car.artist || ''}`;
  } else {
    cr.textContent = '';
  }

  // 不透明写真モードでは使えない機能を薄くする
  const cutoutOnly = !!(carAnalysis && !carAnalysis.hasAlpha);
  ['#paintBlock', '#decalBlock', '#partsBlock', '#sceneBlock'].forEach(sel => {
    $(sel).classList.toggle('disabled', cutoutOnly);
  });
}

/* ---------- ガチャ ---------- */
async function gacha() {
  if (lastResults.length && Math.random() < 0.7) {
    const pick = rand(lastResults);
    if (!state.car || pick.large !== state.car.large) await selectCar(pick);
  }
  state.color = Math.random() < 0.8 ? rand(PAINTS) : null;
  state.strength = 0.7 + Math.random() * 0.3;
  state.finish = rand(FINISHES).id;
  state.decal = rand(DECALS).id;
  state.accent = rand(ACCENTS);
  state.neon = Math.random() < 0.3 ? rand(GLOWS) : null;
  state.scene = rand(SCENES).id;
  state.zekkenNo = 1 + Math.floor(Math.random() * 98);
  state.flip = Math.random() < 0.3;
  $('#strengthRange').value = Math.round(state.strength * 100);
  await setScene(state.scene);
  restyle();
  draw();
  updateUI();
  const stageWrap = $('#stageWrap');
  stageWrap.classList.remove('shake');
  void stageWrap.offsetWidth;
  stageWrap.classList.add('shake');
}

/* ---------- ギャラリー ---------- */
const STORE_KEY = 'custom-garage-photo-saves';

function loadSaves() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch { return []; }
}
function persistSaves(saves) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(saves)); }
  catch { toast('保存領域がいっぱいです。古い愛車を削除してください'); }
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
      <div class="thumb"><img src="${sv.snap}" alt="${sv.name}"></div>
      <div class="garage-meta">
        <span class="garage-name" title="${sv.name}">${sv.name}</span>
        <span class="garage-actions">
          <button type="button" class="mini-btn" data-load="${sv.id}">のせる</button>
          <button type="button" class="mini-btn del" data-del="${sv.id}" aria-label="削除">🗑</button>
        </span>
      </div>
    </div>`).join('');
}

function snapshot() {
  const c = document.createElement('canvas');
  c.width = 280; c.height = 150;
  c.getContext('2d').drawImage(canvas(), 0, 0, 280, 150);
  return c.toDataURL('image/jpeg', 0.72);
}

function saveCurrent() {
  if (!state.car) { toast('先に車をえらんでね！'); return; }
  let snap;
  try { snap = snapshot(); }
  catch (e) { toast('この画像は保存用サムネイルを作れませんでした'); return; }
  const saves = loadSaves();
  saves.unshift({
    id: Date.now().toString(36),
    name: carNickname(),
    snap,
    config: { ...state, driving: false },
  });
  persistSaves(saves.slice(0, 24));
  renderGallery();
  toast(`「${carNickname()}」をガレージに保存しました！`);
}

async function loadSave(id) {
  const sv = loadSaves().find(x => x.id === id);
  if (!sv) return;
  Object.assign(state, sv.config, { driving: false });
  stopDrive();
  $('#strengthRange').value = Math.round(state.strength * 100);
  $('#scaleRange').value = Math.round(state.scale * 100);
  $('#liftRange').value = state.lift;
  await setScene(state.scene);
  await selectCar(state.car);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- PNG書き出し ---------- */
function downloadPNG() {
  if (!state.car) { toast('先に車をえらんでね！'); return; }
  const credit = state.car.page && state.car.page !== '#'
    ? `photo: ${(state.car.artist || 'Wikimedia Commons').slice(0, 40)} / ${state.car.license || ''} (Wikimedia Commons)`
    : '';
  let dataUrl;
  try { dataUrl = exportStagePNG(canvas(), credit); }
  catch (e) { toast('画像の書き出しに失敗しました…'); return; }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `custom-garage-${Date.now().toString(36)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('PNG画像を保存しました！');
}

/* ---------- トースト ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- イベント ---------- */
function wire() {
  $('#searchForm').addEventListener('submit', e => {
    e.preventDefault();
    const q = $('#searchInput').value.trim();
    if (q) doSearch(q);
  });

  $('#picker').addEventListener('click', e => {
    const quick = e.target.closest('[data-quick]');
    if (quick) {
      $('#searchInput').value = quick.dataset.quick;
      doSearch(quick.dataset.quick);
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) selectCar(lastResults[+pick.dataset.pick]);
  });

  $('#controls').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.original) state.color = null;
    else if (d.paint) state.color = d.paint;
    else if (d.finish) state.finish = d.finish;
    else if (d.decal) {
      state.decal = d.decal;
      if (d.decal === 'zekken') state.zekkenNo = 1 + Math.floor(Math.random() * 98);
    }
    else if (d.accent) state.accent = d.accent;
    else if (d.glow) state.neon = d.glow;
    else if (d.scene) { await setScene(d.scene); updateUI(); return; }
    else if (b.id === 'neonBtn') state.neon = state.neon ? null : GLOWS[0];
    else if (b.id === 'flipBtn') state.flip = !state.flip;
    else return;
    restyle();
    draw();
    updateUI();
  });

  $('#paintPicker').addEventListener('input', e => {
    state.color = e.target.value;
    restyle(); draw(); updateUI();
  });
  $('#accentPicker').addEventListener('input', e => {
    state.accent = e.target.value;
    restyle(); draw(); updateUI();
  });
  $('#strengthRange').addEventListener('input', e => {
    state.strength = +e.target.value / 100;
    restyle(); draw();
  });
  $('#scaleRange').addEventListener('input', e => {
    state.scale = +e.target.value / 100;
    draw();
  });
  $('#liftRange').addEventListener('input', e => {
    state.lift = +e.target.value;
    draw();
  });

  $('#gachaBtn').addEventListener('click', gacha);
  $('#driveBtn').addEventListener('click', () => {
    state.driving = !state.driving;
    if (state.driving) startDrive(); else stopDrive();
    updateUI();
  });
  $('#saveBtn').addEventListener('click', saveCurrent);
  $('#pngBtn').addEventListener('click', downloadPNG);

  $('#gallery').addEventListener('click', e => {
    const load = e.target.closest('[data-load]');
    const del = e.target.closest('[data-del]');
    if (load) loadSave(load.dataset.load);
    else if (del) {
      persistSaves(loadSaves().filter(x => x.id !== del.dataset.del));
      renderGallery();
    }
  });
}

/* ---------- 起動 ---------- */
async function init() {
  buildStaticChoices();
  updateUI();
  renderGallery();
  wire();
  await setScene(state.scene);
  draw();
  // 最初のおすすめ検索
  const first = QUICK_CARS[0];
  $('#searchInput').value = first.q;
  doSearch(first.q);
}

document.addEventListener('DOMContentLoaded', init);
