/* ダーツの旅 — アプリ本体 */
"use strict";

/* ========== 陸地データのデコード ========== */
function decodeLandmask(lm) {
  const cells = []; // {c, r}
  let cur = 0, idx = 0;
  for (const tok of lm.rle.split(",")) {
    const run = parseInt(tok, 36);
    if (cur === 1) {
      for (let k = 0; k < run; k++) {
        const i = idx + k;
        cells.push({ c: i % lm.cols, r: Math.floor(i / lm.cols) });
      }
    }
    idx += run;
    cur ^= 1;
  }
  return cells;
}
const LAND_CELLS = decodeLandmask(LANDMASK);

/* ========== 座標ヘルパー ========== */
const mapX = lon => (lon + 180) / 360;   // 0..1
const mapY = lat => (90 - lat) / 180;    // 0..1

/* ========== DOM ========== */
const $ = s => document.querySelector(s);
const wrap = $("#map-wrap");
const canvas = $("#map");
const ctx = canvas.getContext("2d");
const dartEl = $("#dart");
const hintEl = $("#map-hint");
const btnThrow = $("#btn-throw");
const scopeChips = $("#scope-chips");
const countrySelect = $("#country-select");
const scopeNote = $("#scope-note");
const resultEl = $("#result");
const historyWrap = $("#history-wrap");
const historyEl = $("#history");

/* ========== 状態 ========== */
let scope = "world";               // "world" または国名
let throwing = false;
let currentDest = null;
const cam = { x: 0.5, y: 0.5, scale: 1 };  // マップ正規化座標でのカメラ中心と倍率
let camAnim = null;                         // {t0,dur,from,to}
let pulse = null;                           // {mx,my,start} 着弾後のパルス
let roulette = null;                        // {mx,my} ルーレット中のハイライト
let W = 0, H = 0, DPR = 1;
let baseMap = null;                         // 事前描画した陸地ドット

/* ========== スコープ ========== */
function scopedDests() {
  return scope === "world" ? DESTINATIONS : DESTINATIONS.filter(d => d.country === scope);
}
function updateScopeNote() {
  const n = scopedDests().length;
  scopeNote.textContent = scope === "world"
    ? `対象: 世界のすべての行き先(${n}ヶ所)`
    : `対象: ${scope}の${n}ヶ所`;
}
function setScope(next) {
  scope = next;
  scopeChips.querySelectorAll(".chip").forEach(ch =>
    ch.classList.toggle("on", ch.dataset.scope === next));
  const inChips = [...scopeChips.querySelectorAll(".chip")].some(ch => ch.dataset.scope === next);
  countrySelect.classList.toggle("on", !inChips);
  if (inChips) countrySelect.value = "";
  updateScopeNote();
}

function initScopeUI() {
  // 国ごとの件数を集計してセレクトに並べる
  const counts = new Map();
  for (const d of DESTINATIONS) counts.set(d.country, (counts.get(d.country) || 0) + 1);
  const countries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));
  for (const [name, n] of countries) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = `${name}(${n}ヶ所)`;
    countrySelect.appendChild(opt);
  }
  scopeChips.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (chip && !throwing) setScope(chip.dataset.scope);
  });
  countrySelect.addEventListener("change", () => {
    if (throwing) { countrySelect.value = ""; return; }
    if (countrySelect.value) setScope(countrySelect.value);
  });
  $("#stat-count").textContent = DESTINATIONS.length;
  updateScopeNote();
}

/* ========== 地図描画 ========== */
function resize() {
  const w = wrap.clientWidth;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = w;
  H = Math.round(w / 2);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.height = H + "px";
  renderBaseMap();
}

function renderBaseMap() {
  // 陸地ドットを高解像度で事前描画(ズームしてもきれいに見えるよう2倍で)
  const S = 2 * DPR;
  baseMap = document.createElement("canvas");
  baseMap.width = Math.round(W * S);
  baseMap.height = Math.round(H * S);
  const b = baseMap.getContext("2d");
  const cw = baseMap.width / LANDMASK.cols;
  const chh = baseMap.height / LANDMASK.rows;
  const rad = Math.min(cw, chh) * 0.34;
  b.fillStyle = "#8fb6e4";
  for (const { c, r } of LAND_CELLS) {
    b.beginPath();
    b.arc((c + 0.5) * cw, (r + 0.5) * chh, rad, 0, Math.PI * 2);
    b.fill();
  }
}

// マップ正規化座標 → 画面(CSS px)
function toScreen(mx, my) {
  return {
    x: W / 2 + (mx - cam.x) * W * cam.scale,
    y: H / 2 + (my - cam.y) * H * cam.scale,
  };
}

function clampCam() {
  const half = 0.5 / cam.scale;
  cam.x = Math.min(1 - half, Math.max(half, cam.x));
  cam.y = Math.min(1 - half, Math.max(half, cam.y));
}

const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function animateCamTo(x, y, scale, dur) {
  camAnim = { t0: performance.now(), dur, from: { ...cam }, to: { x, y, scale } };
}

function draw(now) {
  requestAnimationFrame(draw);
  if (!baseMap) return;

  if (camAnim) {
    const t = Math.min(1, (now - camAnim.t0) / camAnim.dur);
    const e = easeInOut(t);
    cam.x = camAnim.from.x + (camAnim.to.x - camAnim.from.x) * e;
    cam.y = camAnim.from.y + (camAnim.to.y - camAnim.from.y) * e;
    cam.scale = camAnim.from.scale + (camAnim.to.scale - camAnim.from.scale) * e;
    clampCam();
    if (t >= 1) camAnim = null;
  }

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // 陸地(事前描画をカメラ変換して転写)
  const dw = W * cam.scale;
  const dh = H * cam.scale;
  const dx = W / 2 - cam.x * dw;
  const dy = H / 2 - cam.y * dh;
  ctx.drawImage(baseMap, dx, dy, dw, dh);

  // スコープ内の行き先を淡く点灯
  const dests = scopedDests();
  ctx.fillStyle = "rgba(255, 134, 174, .75)";
  for (const d of dests) {
    const p = toScreen(mapX(d.lon), mapY(d.lat));
    if (p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.6, 1.2 * cam.scale), 0, Math.PI * 2);
    ctx.fill();
  }

  // ルーレット中のターゲットリング
  if (roulette) {
    const p = toScreen(roulette.mx, roulette.my);
    ctx.strokeStyle = "#f75d92";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 22, p.y); ctx.lineTo(p.x - 8, p.y);
    ctx.moveTo(p.x + 8, p.y); ctx.lineTo(p.x + 22, p.y);
    ctx.moveTo(p.x, p.y - 22); ctx.lineTo(p.x, p.y - 8);
    ctx.moveTo(p.x, p.y + 8); ctx.lineTo(p.x, p.y + 22);
    ctx.stroke();
  }

  // 着弾後のパルス
  if (pulse) {
    const p = toScreen(pulse.mx, pulse.my);
    const t = ((now - pulse.start) % 1600) / 1600;
    for (const off of [0, 0.5]) {
      const tt = (t + off) % 1;
      ctx.strokeStyle = `rgba(247, 93, 146, ${0.8 * (1 - tt)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 + tt * 34, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#f75d92";
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
  }
}

/* ========== ダーツを投げる演出 ========== */
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ストップが押されるまで、候補地の間をターゲットが飛び回り続ける
let stopRequested = false;

async function spinUntilStop(cands) {
  stopRequested = false;
  let cur = cands[Math.floor(Math.random() * cands.length)];
  roulette = { mx: mapX(cur.lon), my: mapY(cur.lat) };
  const GLIDE = 110, DWELL = 80;
  while (true) {
    let next = cur;
    if (cands.length > 1) {
      while (next === cur) next = cands[Math.floor(Math.random() * cands.length)];
    }
    // ストップ後もいま向かっている場所までは滑らかに移動して、そこで確定
    const from = { mx: mapX(cur.lon), my: mapY(cur.lat) };
    const to = { mx: mapX(next.lon), my: mapY(next.lat) };
    const t0 = performance.now();
    while (true) {
      const t = Math.min(1, (performance.now() - t0) / GLIDE);
      roulette = { mx: from.mx + (to.mx - from.mx) * t, my: from.my + (to.my - from.my) * t };
      if (t >= 1) break;
      await sleep(16);
    }
    cur = next;
    if (stopRequested) return cur;
    await sleep(DWELL);
    if (stopRequested) return cur;
  }
}

async function flyDart(targetPx) {
  // ダーツの先端は要素中心から(-22.6, +22.6)の位置(SVG内で45°回転済み)
  const TIP = { x: -22.6, y: 22.6 };
  const rect = wrap.getBoundingClientRect();
  const cx = targetPx.x - TIP.x - 32;  // style.left(要素左上)換算
  const cy = targetPx.y - TIP.y - 32;
  const sx = rect.width + 80;          // 画面右上の外からスタート
  const sy = -120;
  dartEl.hidden = false;
  const dur = 550;
  const t0 = performance.now();
  return new Promise(resolve => {
    (function step(now) {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3); // ease-out
      const x = sx + (cx - sx) * e;
      const y = sy + (cy - sy) * e;
      const arc = Math.sin(t * Math.PI) * -40;   // ふわっと山なりに
      dartEl.style.left = x + "px";
      dartEl.style.top = (y + arc) + "px";
      dartEl.style.transform = `scale(${1.5 - 0.5 * e}) rotate(${(1 - e) * 40}deg)`;
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    })(t0);
  });
}

let spinning = false;

async function throwDart() {
  // スピン中にもう一度押されたら「ストップ!」
  if (spinning) { stopRequested = true; return; }
  if (throwing) return;
  const cands = scopedDests();
  if (!cands.length) return;
  throwing = true;
  resultEl.hidden = true;
  pulse = null;

  // 全体表示に戻す
  hintEl.classList.remove("hide");
  hintEl.textContent = "🎯 いいところで「ストップ!」を押してね";
  animateCamTo(0.5, 0.5, 1, 450);
  await sleep(470);

  // ストップが押されるまで回し続ける
  spinning = true;
  btnThrow.textContent = "✋ ストップ!";
  btnThrow.classList.add("stop");
  currentDest = await spinUntilStop(cands);
  spinning = false;
  btnThrow.textContent = "🎯 ダーツを投げる!";
  btnThrow.classList.remove("stop");
  btnThrow.disabled = true;

  // ダーツ発射!
  const tx = mapX(currentDest.lon), ty = mapY(currentDest.lat);
  const target = toScreen(tx, ty);
  await flyDart(target);
  roulette = null;
  wrap.classList.add("shake");
  pulse = { mx: tx, my: ty, start: performance.now() };
  hintEl.textContent = `📍 ${currentDest.name} に刺さった!`;
  setTimeout(() => wrap.classList.remove("shake"), 400);
  await sleep(500);

  // ズームイン(ダーツはフェードアウト)
  dartEl.style.transition = "opacity .4s";
  dartEl.style.opacity = "0";
  animateCamTo(tx, ty, 2.6, 900);
  await sleep(950);
  dartEl.hidden = true;
  dartEl.style.transition = "";
  dartEl.style.opacity = "1";

  showResult(currentDest);
  pushHistory(currentDest);
  hintEl.classList.add("hide");
  throwing = false;
  btnThrow.disabled = false;
}

/* ========== 結果カード ========== */
function fillList(el, items) {
  el.innerHTML = "";
  for (const it of items) {
    const li = document.createElement("li");
    li.textContent = it;
    el.appendChild(li);
  }
}

function showResult(d) {
  $("#r-emoji").textContent = d.emoji;
  $("#r-catch").textContent = d.catch;
  $("#r-name").textContent = d.name;
  $("#r-where").textContent = d.country === "日本"
    ? `日本・${d.region}地方`
    : `${d.country}(${d.region})`;
  $("#r-desc").textContent = d.desc;
  fillList($("#r-spots"), d.spots);
  fillList($("#r-food"), d.food);
  $("#r-season").textContent = d.season;
  $("#r-tip").textContent = d.tip;
  $("#r-map-link").href =
    `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lon}`;
  $("#r-search-link").href =
    `https://www.google.com/search?q=${encodeURIComponent(d.name + " 観光")}`;
  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ========== 履歴 ========== */
const HISTORY_KEY = "darts-travel-history";
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function pushHistory(d) {
  let h = loadHistory().filter(x => x !== d.name);
  h.unshift(d.name);
  h = h.slice(0, 8);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {}
  renderHistory();
}
function renderHistory() {
  const h = loadHistory();
  historyWrap.hidden = h.length === 0;
  historyEl.innerHTML = "";
  for (const name of h) {
    const d = DESTINATIONS.find(x => x.name === name);
    if (!d) continue;
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = `${d.emoji} ${d.name}`;
    b.addEventListener("click", () => {
      if (throwing) return;
      currentDest = d;
      const tx = mapX(d.lon), ty = mapY(d.lat);
      pulse = { mx: tx, my: ty, start: performance.now() };
      animateCamTo(tx, ty, 2.6, 700);
      showResult(d);
    });
    historyEl.appendChild(b);
  }
}

/* ========== 起動 ========== */
initScopeUI();
renderHistory();
resize();
window.addEventListener("resize", resize);
btnThrow.addEventListener("click", throwDart);
$("#btn-rethrow").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  throwDart();
});
requestAnimationFrame(draw);
