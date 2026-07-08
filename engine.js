/* =========================================================
 * engine.js — canvas合成エンジン
 * 背景シーン（SVGをラスタライズ）＋実車写真（透過PNG）に
 * 色替え・質感・デカール・ネオンを合成して描画する。
 * ======================================================= */

const STAGE_W = 1120;
const STAGE_H = 600;
const GROUND = Math.round(STAGE_H * (252 / 300)); // シーンSVGの地面位置

/* ---------- SVG → bitmap ---------- */
function svgToBitmap(svgText, w, h) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('scene rasterize failed')); };
    img.src = url;
  });
}

/* シーンを {static, scroll, meta} のビットマップに変換してキャッシュ */
const sceneCache = {};
async function loadScene(id) {
  if (sceneCache[id]) return sceneCache[id];
  const sc = sceneSVG(id);
  const staticSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 300" width="${STAGE_W}" height="${STAGE_H}">
    ${sc.sky}
    <rect x="0" y="252" width="560" height="48" fill="${sc.groundColor}"/>
    ${sc.road
      ? '<rect x="0" y="252" width="560" height="4" fill="rgba(255,255,255,.25)"/>'
      : '<rect x="0" y="252" width="560" height="5" fill="rgba(0,0,0,.15)"/>'}
  </svg>`;
  const scrollSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 300" width="${STAGE_W}" height="${STAGE_H}">${sc.scroll}</svg>`;
  const [st, scr] = await Promise.all([
    svgToBitmap(staticSvg, STAGE_W, STAGE_H),
    svgToBitmap(scrollSvg, STAGE_W, STAGE_H),
  ]);
  const out = { static: st, scroll: scr, road: sc.road, dashColor: sc.dashColor };
  sceneCache[id] = out;
  return out;
}

/* ---------- 画像ロードと透過判定 ---------- */
function loadCarImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = url;
  });
}

/* 画像を1パスで解析する。
 * - hasAlpha: 透過画像（切り抜き）かどうか
 * - bbox: しっかり不透明な部分（焼き込み影を除く車体）の外接矩形
 * - mask: 色替え用の輝度マスク（タイヤ・窓・ハイライトは塗りを弱く）
 * - solid: デカール用の不透明マスク（半透明の影に貼らない）
 */
function analyzeImage(img) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const fallback = {
    hasAlpha: false,
    bbox: { x: 0, y: 0, w: iw, h: ih },
    mask: null, solid: null,
  };
  const scale = Math.min(1, 1400 / iw);
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cctx = c.getContext('2d', { willReadFrequently: true });
  cctx.drawImage(img, 0, 0, w, h);
  let d;
  try { d = cctx.getImageData(0, 0, w, h); }
  catch (e) { return fallback; } // CORSでピクセルが読めない → 不透明写真扱い
  const src = d.data;

  const maskData = cctx.createImageData(w, h);
  const solidData = cctx.createImageData(w, h);
  let minX = w, minY = h, maxX = -1, maxY = -1, transparent = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = src[i + 3];
      if (a <= 16) transparent++;
      if (a > 150) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        solidData.data[i + 3] = 255;
        solidData.data[i] = solidData.data[i + 1] = solidData.data[i + 2] = 255;
      }
      if (a > 0) {
        const L = (0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]) / 255;
        let wgt;
        if (L < 0.05) wgt = 0.12;                        // 真っ黒（タイヤ・窓の奥）
        else if (L < 0.16) wgt = 0.12 + (L - 0.05) * 8;  // 暗部→ボディへのランプ
        else if (L < 0.82) wgt = 1;                      // ボディ面
        else wgt = Math.max(0.35, 1 - (L - 0.82) * 3.6); // ハイライトは少し残す
        maskData.data[i] = maskData.data[i + 1] = maskData.data[i + 2] = 255;
        maskData.data[i + 3] = Math.round(a * Math.min(1, wgt));
      }
    }
  }

  const hasAlpha = transparent / (w * h) > 0.02 && maxX >= 0;
  if (!hasAlpha) return fallback;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w; maskCanvas.height = h;
  maskCanvas.getContext('2d').putImageData(maskData, 0, 0);
  const solidCanvas = document.createElement('canvas');
  solidCanvas.width = w; solidCanvas.height = h;
  solidCanvas.getContext('2d').putImageData(solidData, 0, 0);

  const inv = 1 / scale;
  return {
    hasAlpha,
    bbox: { x: minX * inv, y: minY * inv, w: (maxX - minX + 1) * inv, h: (maxY - minY + 1) * inv },
    mask: maskCanvas,
    solid: solidCanvas,
  };
}

/* ---------- デカール描画（切り抜きのbbox基準の絶対座標） ---------- */
function drawDecal(ctx, bbox, id, accent, zekkenNo) {
  const { x, y, w, h } = bbox;
  ctx.save();
  if (id === 'stripes') {
    ctx.fillStyle = accent;
    [[0.40, 0.05], [0.50, 0.075], [0.62, 0.05]].forEach(([px, pw], i) => {
      ctx.globalAlpha = i === 1 ? 0.95 : 0.8;
      ctx.beginPath();
      ctx.moveTo(x + w * px, y + h * 1.02);
      ctx.lineTo(x + w * (px + 0.10), y - h * 0.02);
      ctx.lineTo(x + w * (px + 0.10 + pw), y - h * 0.02);
      ctx.lineTo(x + w * (px + pw), y + h * 1.02);
      ctx.closePath();
      ctx.fill();
    });
  } else if (id === 'sideline') {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.95;
    ctx.fillRect(x - w * 0.05, y + h * 0.62, w * 1.1, h * 0.07);
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x - w * 0.05, y + h * 0.72, w * 1.1, h * 0.03);
  } else if (id === 'flame') {
    // 前方下部から後ろへ流れる炎。山(peak)と谷(valley)を交互に結ぶ
    const pts = [
      [0.02, 0.94], [0.05, 0.62], [0.10, 0.78], [0.15, 0.54],
      [0.20, 0.76], [0.26, 0.50], [0.31, 0.74], [0.37, 0.58],
      [0.42, 0.82], [0.46, 0.70], [0.50, 0.94],
    ];
    const drawFlame = (scaleY, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(x + w * pts[0][0], y + h * pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const [px, py] = pts[i];
        const [qx, qy] = pts[i - 1];
        const midX = (px + qx) / 2;
        // 山へは鋭く、谷へは丸く
        const ctrlY = py < qy ? py : qy;
        ctx.quadraticCurveTo(
          x + w * midX,
          y + h * (1 - (1 - ctrlY) * scaleY),
          x + w * px,
          y + h * (1 - (1 - py) * scaleY));
      }
      ctx.lineTo(x + w * 0.50, y + h * 1.05);
      ctx.lineTo(x + w * 0.02, y + h * 1.05);
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = accent;
    drawFlame(1, 0.92);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    drawFlame(0.72, 0.5);
  } else if (id === 'dots') {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    const r = Math.max(6, w * 0.022);
    for (let ix = 0; ix < 9; ix++) {
      for (let iy = 0; iy < 5; iy++) {
        const cx = x + w * (0.06 + ix * 0.11) + (iy % 2) * w * 0.055;
        const cy = y + h * (0.12 + iy * 0.19);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (id === 'bolt') {
    ctx.fillStyle = accent;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = Math.max(2, w * 0.006);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.40, y + h * 0.12);
    ctx.lineTo(x + w * 0.56, y + h * 0.12);
    ctx.lineTo(x + w * 0.47, y + h * 0.42);
    ctx.lineTo(x + w * 0.60, y + h * 0.42);
    ctx.lineTo(x + w * 0.36, y + h * 0.90);
    ctx.lineTo(x + w * 0.46, y + h * 0.52);
    ctx.lineTo(x + w * 0.33, y + h * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (id === 'zekken') {
    const cx = x + w * 0.45, cy = y + h * 0.58;
    const r = Math.min(w, h) * 0.16;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fdfdf8';
    ctx.fill();
    ctx.lineWidth = r * 0.14;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.fillStyle = '#20242c';
    ctx.font = `900 ${Math.round(r * 1.1)}px 'Arial Black', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(zekkenNo), cx, cy + r * 0.05);
  }
  ctx.restore();
}

/* ---------- スタイル済みの車ビットマップを作る ----------
 * flip → 色 → 質感 → デカール の順で焼き込む。
 */
function buildStyledCar(img, analysis, s) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const oc = document.createElement('canvas');
  oc.width = w; oc.height = h;
  const ctx = oc.getContext('2d');

  // 反転を最初に焼き込む（後続のデカール文字が裏返らないように）
  if (s.flip) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(img, -w, 0);
    ctx.restore();
  } else {
    ctx.drawImage(img, 0, 0);
  }
  const bbox = s.flip
    ? { ...analysis.bbox, x: w - analysis.bbox.x - analysis.bbox.w }
    : analysis.bbox;

  if (!analysis.hasAlpha) return { canvas: oc, bbox, hasAlpha: false };

  // 色替え: 'color'ブレンドで色相と彩度を差し替え、明暗（写真の陰影）は残す。
  // 輝度マスクがあればタイヤ・窓など暗部への塗りを抑える。
  if (s.color) {
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = s.strength;
    if (analysis.mask) {
      const tint = document.createElement('canvas');
      tint.width = w; tint.height = h;
      const tctx = tint.getContext('2d');
      tctx.fillStyle = s.color;
      tctx.fillRect(0, 0, w, h);
      tctx.globalCompositeOperation = 'destination-in';
      if (s.flip) { tctx.save(); tctx.scale(-1, 1); tctx.drawImage(analysis.mask, -w, 0, w, h); tctx.restore(); }
      else tctx.drawImage(analysis.mask, 0, 0, w, h);
      ctx.drawImage(tint, 0, 0);
    } else {
      ctx.fillStyle = s.color;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    if (s.flip) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(img, -w, 0); ctx.restore(); }
    else ctx.drawImage(img, 0, 0);
  }

  if (s.finish === 'matte') {
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    if (s.flip) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(img, -w, 0); ctx.restore(); }
    else ctx.drawImage(img, 0, 0);
  }

  // グロスとデカールは「しっかり不透明な部分」にだけ乗せる
  // （焼き込みの影など半透明ピクセルにはみ出さないようにレイヤーを分けてマスク）
  const wantGloss = s.finish === 'gloss';
  const wantDecal = s.decal && s.decal !== 'none';
  if (wantGloss || wantDecal) {
    const layer = document.createElement('canvas');
    layer.width = w; layer.height = h;
    const lctx = layer.getContext('2d');
    if (wantGloss) {
      const g = lctx.createLinearGradient(bbox.x, bbox.y, bbox.x + bbox.w * 0.6, bbox.y + bbox.h);
      g.addColorStop(0, 'rgba(255,255,255,.22)');
      g.addColorStop(0.45, 'rgba(255,255,255,0)');
      lctx.fillStyle = g;
      lctx.fillRect(0, 0, w, h);
    }
    if (wantDecal) drawDecal(lctx, bbox, s.decal, s.accent, s.zekkenNo);
    if (analysis.solid) {
      lctx.globalCompositeOperation = 'destination-in';
      if (s.flip) { lctx.save(); lctx.scale(-1, 1); lctx.drawImage(analysis.solid, -w, 0, w, h); lctx.restore(); }
      else lctx.drawImage(analysis.solid, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalCompositeOperation = 'source-atop';
    }
    ctx.drawImage(layer, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';
  return { canvas: oc, bbox, hasAlpha: analysis.hasAlpha };
}

/* ---------- ステージ描画 ---------- */
function composeStage(ctx, scene, styled, s, opts = {}) {
  const t = opts.t || 0;
  const offset = opts.offset || 0;

  ctx.clearRect(0, 0, STAGE_W, STAGE_H);
  ctx.drawImage(scene.static, 0, 0);
  const ox = -(offset % STAGE_W);
  ctx.drawImage(scene.scroll, ox, 0);
  ctx.drawImage(scene.scroll, ox + STAGE_W, 0);

  // 車線
  if (scene.road) {
    ctx.fillStyle = scene.dashColor;
    ctx.globalAlpha = 0.85;
    const dashOff = (offset * 3) % 160;
    for (let x = -160; x < STAGE_W + 160; x += 160) {
      const dx = x - dashOff;
      ctx.beginPath();
      ctx.roundRect(dx, GROUND + 44, 84, 12, 6);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (!styled) {
    // 車が未選択のときのプレースホルダ
    ctx.fillStyle = 'rgba(10,14,22,.55)';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.fillStyle = '#fff';
    ctx.font = `700 40px 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('🔍 上の検索から好きな車をえらんでね', STAGE_W / 2, STAGE_H / 2);
    return;
  }

  const { canvas: car, bbox, hasAlpha } = styled;

  if (!hasAlpha) {
    // 不透明写真モード: 写真をカバー表示して全体フィルタのみ
    const fit = Math.max(STAGE_W / car.width, STAGE_H / car.height);
    const dw = car.width * fit, dh = car.height * fit;
    ctx.save();
    if (s.photoFilter) ctx.filter = s.photoFilter;
    ctx.drawImage(car, (STAGE_W - dw) / 2, (STAGE_H - dh) / 2, dw, dh);
    ctx.restore();
    return;
  }

  // 切り抜きモード: 地面に接地させて配置
  const targetW = Math.min(760, STAGE_W * 0.62) * s.scale;
  const k = targetW / bbox.w;
  const dw = car.width * k, dh = car.height * k;
  const bounce = opts.driving ? Math.sin(t / 90) * 4 : 0;
  const cx = STAGE_W / 2;
  const dx = cx - (bbox.x + bbox.w / 2) * k;
  const dy = GROUND + s.lift - (bbox.y + bbox.h) * k + bounce;

  // 影
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  ctx.beginPath();
  ctx.ellipse(cx, GROUND + 16, (bbox.w * k) / 2 + 26, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ネオンアンダーグロウ
  if (s.neon) {
    const g = ctx.createRadialGradient(cx, GROUND + 8, 10, cx, GROUND + 8, bbox.w * k * 0.55);
    g.addColorStop(0, s.neon);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, GROUND + 8, bbox.w * k * 0.55, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  if (s.neon) {
    ctx.shadowColor = s.neon;
    ctx.shadowBlur = 34;
  }
  ctx.drawImage(car, dx, dy, dw, dh);
  ctx.restore();
}

/* PNG書き出し: クレジット入りで別キャンバスに描いてdataURLを返す */
function exportStagePNG(canvas, credit) {
  const out = document.createElement('canvas');
  out.width = STAGE_W; out.height = STAGE_H;
  const ctx = out.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  if (credit) {
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(STAGE_W - ctx.measureText(credit).width - 24, STAGE_H - 34, ctx.measureText(credit).width + 24, 34);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillText(credit, STAGE_W - 12, STAGE_H - 12);
  }
  return out.toDataURL('image/png');
}
