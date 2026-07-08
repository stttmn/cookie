/* ===== マーケット・ダッシュボード 本体 ===== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const cfgOf = sym => MARKET.symbols.find(s => s.sym === sym);

  // range -> Yahoo パラメータ & デモ日数
  const RANGES = {
    '1mo': { interval: '1d',  demoDays: 22 },
    '3mo': { interval: '1d',  demoDays: 66 },
    '6mo': { interval: '1d',  demoDays: 128 },
    '1y':  { interval: '1d',  demoDays: 252 },
    '5y':  { interval: '1wk', demoDays: 260 },
  };
  const CMP_COLORS = ['--s1','--s2','--s3','--s4','--s5','--s6','--s7','--s8'];

  const store = {};            // `${sym}|${range}` -> {points, live}
  let mainSym = '^GSPC';
  let mainRange = '1y';
  let cmpRange = '1y';
  const cmpOff = new Set();     // 非表示にした比較銘柄
  let anyDemo = false, anyLive = false;
  let wlSort = { k: 'chg', asc: false };

  /* ---------- データ取得 ---------- */
  const PROXIES = [
    u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  ];

  function yahooUrl(sym, range) {
    const iv = RANGES[range].interval;
    return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${iv}`;
  }

  async function fetchJson(url, ms = 9000) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(to); }
  }

  function parseChart(json) {
    const res = json && json.chart && json.chart.result && json.chart.result[0];
    if (!res || !res.timestamp) throw new Error('no data');
    const ts = res.timestamp;
    const close = res.indicators.quote[0].close;
    const points = [];
    for (let i = 0; i < ts.length; i++) {
      const c = close[i];
      if (c != null && isFinite(c)) points.push({ t: ts[i], c });
    }
    if (points.length < 2) throw new Error('too few points');
    return points;
  }

  const CACHE_TTL = 10 * 60 * 1000;
  function cacheGet(key) {
    try {
      const raw = localStorage.getItem('mkt:' + key);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (Date.now() - o.ts > CACHE_TTL) return null;
      return o.points;
    } catch { return null; }
  }
  function cacheSet(key, points) {
    try { localStorage.setItem('mkt:' + key, JSON.stringify({ ts: Date.now(), points })); } catch {}
  }

  // 1シンボル×レンジを取得。成功→{points,live:true}／全滅→デモ{live:false}
  async function loadSeries(sym, range, { force = false } = {}) {
    const key = `${sym}|${range}`;
    if (store[key] && !force) return store[key];

    if (!force) {
      const cached = cacheGet(key);
      if (cached) { const v = { points: cached, live: true }; store[key] = v; anyLive = true; return v; }
    }

    const url = yahooUrl(sym, range);
    const attempts = [url, ...PROXIES.map(p => p(url))]; // 直アクセス→各プロキシ
    for (const a of attempts) {
      try {
        const json = await fetchJson(a);
        const points = parseChart(json);
        cacheSet(key, points);
        const v = { points, live: true };
        store[key] = v; anyLive = true;
        return v;
      } catch { /* 次の手段へ */ }
    }
    // フォールバック（デモ）
    const points = MARKET.demoSeries(cfgOf(sym), RANGES[range].demoDays);
    const v = { points, live: false };
    store[key] = v; anyDemo = true;
    return v;
  }

  /* ---------- 数値フォーマット ---------- */
  function fmtPrice(v, cfg) {
    const dp = cfg && cfg.dp != null ? cfg.dp : (Math.abs(v) < 20 ? 2 : 0);
    return v.toLocaleString('ja-JP', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  function fmtChg(v, cfg) {
    const dp = cfg && cfg.dp != null ? cfg.dp : (Math.abs(v) < 20 ? 2 : 0);
    return (v >= 0 ? '+' : '') + v.toLocaleString('ja-JP', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  const dirClass = v => v > 0.0001 ? 'up' : v < -0.0001 ? 'down' : 'flat';
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // 前日比・週間・スパーク用のクォート（1moデータから算出）
  function quoteOf(sym) {
    const s = store[`${sym}|1mo`];
    if (!s) return null;
    const p = s.points, n = p.length;
    const price = p[n - 1].c;
    const prev = p[n - 2].c;
    const chg = price - prev;
    const pct = (chg / prev) * 100;
    const wIdx = Math.max(0, n - 6);
    const wPct = ((price - p[wIdx].c) / p[wIdx].c) * 100;
    return { price, prev, chg, pct, wPct, spark: p.slice(-30), live: s.live };
  }

  /* ---------- SVG チャート ---------- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = (n, a = {}) => { const e = document.createElementNS(SVGNS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

  function niceTicks(min, max, count = 5) {
    const span = max - min || 1;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    const start = Math.ceil(min / step) * step;
    const ticks = [];
    for (let v = start; v <= max + step * 0.001; v += step) ticks.push(v);
    return ticks;
  }

  function sparkPath(points, w, h, pad = 2) {
    const cs = points.map(p => p.c);
    const lo = Math.min(...cs), hi = Math.max(...cs), span = hi - lo || 1;
    const n = points.length;
    return points.map((p, i) => {
      const x = pad + (i / (n - 1)) * (w - pad * 2);
      const y = pad + (1 - (p.c - lo) / span) * (h - pad * 2);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
  }

  function makeSparkSVG(points, w, h, color) {
    const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    svg.appendChild(el('path', { d: sparkPath(points, w, h), fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return svg;
  }

  // 汎用ラインチャート。series=[{name,color,points,cfg}]
  // mode: 'single' | 'compare'（compareは始点=100で基準化）
  function renderChart(host, tt, series, mode) {
    host.querySelectorAll('svg').forEach(s => s.remove());
    if (!series.length) return;

    const W = 860, H = mode === 'compare' ? 340 : 320;
    const padL = 52, padR = mode === 'compare' ? 70 : 16, padT = 12, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    // 各系列を {t, v} に整形（compareは基準化）
    const norm = mode === 'compare';
    const prepared = series.map(s => {
      const base = s.points[0].c;
      return { ...s, data: s.points.map(p => ({ t: p.t, v: norm ? (p.c / base) * 100 : p.c })) };
    });

    let tMin = Infinity, tMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const s of prepared) for (const d of s.data) {
      if (d.t < tMin) tMin = d.t; if (d.t > tMax) tMax = d.t;
      if (d.v < vMin) vMin = d.v; if (d.v > vMax) vMax = d.v;
    }
    const vpad = (vMax - vMin || 1) * 0.08;
    vMin -= vpad; vMax += vpad;
    const X = t => padL + ((t - tMin) / (tMax - tMin || 1)) * plotW;
    const Y = v => padT + (1 - (v - vMin) / (vMax - vMin || 1)) * plotH;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
    const gridC = cssVar('--grid'), axisC = cssVar('--axis'), mutedC = cssVar('--muted');

    // 横グリッド + Y ラベル
    const ticks = niceTicks(vMin + vpad * .5, vMax - vpad * .5, 5);
    for (const tk of ticks) {
      const y = Y(tk);
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: gridC, 'stroke-width': 1 }));
      const lbl = el('text', { x: padL - 8, y: y + 3.5, 'text-anchor': 'end', fill: mutedC, 'font-size': 11 });
      lbl.textContent = norm ? tk.toFixed(0) : fmtPrice(tk, series[0].cfg);
      svg.appendChild(lbl);
    }
    // 基準線（compare=100）
    if (norm) {
      const y = Y(100);
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: axisC, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    }
    // X 日付ラベル
    const xt = 5;
    for (let i = 0; i <= xt; i++) {
      const t = tMin + (i / xt) * (tMax - tMin);
      const x = X(t);
      const d = new Date(t * 1000);
      const label = (tMax - tMin) > 200 * 86400
        ? `${d.getFullYear()}/${d.getMonth() + 1}`
        : `${d.getMonth() + 1}/${d.getDate()}`;
      const tx = el('text', { x, y: H - 8, 'text-anchor': i === 0 ? 'start' : i === xt ? 'end' : 'middle', fill: mutedC, 'font-size': 11 });
      tx.textContent = label;
      svg.appendChild(tx);
    }

    // 系列描画
    prepared.forEach((s, si) => {
      const col = cssVar(s.color);
      const dPath = s.data.map((d, i) => (i ? 'L' : 'M') + X(d.t).toFixed(1) + ' ' + Y(d.v).toFixed(1)).join(' ');

      if (mode === 'single') {
        // エリア塗り（下方向グラデ）
        const gid = 'g-area';
        const grad = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
        grad.appendChild(el('stop', { offset: '0%', 'stop-color': col, 'stop-opacity': .22 }));
        grad.appendChild(el('stop', { offset: '100%', 'stop-color': col, 'stop-opacity': 0 }));
        const defs = el('defs'); defs.appendChild(grad); svg.appendChild(defs);
        const area = `${dPath} L ${X(s.data[s.data.length - 1].t).toFixed(1)} ${Y(vMin).toFixed(1)} L ${X(s.data[0].t).toFixed(1)} ${Y(vMin).toFixed(1)} Z`;
        svg.appendChild(el('path', { d: area, fill: `url(#${gid})`, stroke: 'none' }));
      }
      svg.appendChild(el('path', { d: dPath, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

      // 終点マーカー
      const last = s.data[s.data.length - 1];
      svg.appendChild(el('circle', { cx: X(last.t), cy: Y(last.v), r: 3.5, fill: col, stroke: cssVar('--surface-1'), 'stroke-width': 2 }));

      // compare は直接ラベル（凡例色に依存しない二次エンコーディング）
      if (mode === 'compare') {
        const ly = Math.max(padT + 8, Math.min(H - padB - 2, Y(last.v)));
        const t = el('text', { x: W - padR + 6, y: ly + 3.5, fill: col, 'font-size': 11, 'font-weight': 700 });
        t.textContent = s.name;
        svg.appendChild(t);
      }
    });

    // ---- ホバー層（クロスヘア + ツールチップ） ----
    const cross = el('line', { x1: 0, y1: padT, x2: 0, y2: padT + plotH, stroke: axisC, 'stroke-width': 1, opacity: 0 });
    svg.appendChild(cross);
    const dots = prepared.map(s => { const c = el('circle', { r: 4, fill: cssVar(s.color), stroke: cssVar('--surface-1'), 'stroke-width': 2, opacity: 0 }); svg.appendChild(c); return c; });
    const hit = el('rect', { x: padL, y: padT, width: plotW, height: plotH, fill: 'transparent', style: 'cursor:crosshair' });
    svg.appendChild(hit);

    function nearestIdx(data, t) {
      let lo = 0, hi = data.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (data[m].t < t) lo = m; else hi = m; }
      return (t - data[lo].t) < (data[hi].t - t) ? lo : hi;
    }
    function move(ev) {
      const r = svg.getBoundingClientRect();
      const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const t = tMin + Math.min(1, Math.max(0, (px / r.width * W - padL) / plotW)) * (tMax - tMin);
      cross.setAttribute('opacity', 1);
      const primIdx = nearestIdx(prepared[0].data, t);
      const cx = X(prepared[0].data[primIdx].t);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
      const d0 = new Date(prepared[0].data[primIdx].t * 1000);
      let rows = '';
      prepared.forEach((s, i) => {
        const idx = Math.min(nearestIdx(s.data, t), s.data.length - 1);
        const pt = s.data[idx];
        dots[i].setAttribute('cx', X(pt.t)); dots[i].setAttribute('cy', Y(pt.v)); dots[i].setAttribute('opacity', 1);
        const orig = s.points[idx].c;
        const val = mode === 'compare'
          ? `<b class="tt-val">${pt.v.toFixed(1)}</b> <span style="color:var(--muted)">(${fmtPrice(orig, s.cfg)})</span>`
          : `<b class="tt-val">${fmtPrice(orig, s.cfg)}</b>`;
        rows += `<div class="tt-row"><span class="tt-sw" style="background:${cssVar(s.color)}"></span>${mode === 'compare' ? s.name + ' ' : ''}${val}</div>`;
      });
      tt.innerHTML = `<div class="tt-date">${d0.getFullYear()}/${d0.getMonth() + 1}/${d0.getDate()}</div>${rows}`;
      tt.style.opacity = 1;
      const hostW = host.clientWidth;
      let left = (cx / W) * hostW + 12;
      if (left + tt.offsetWidth > hostW) left = (cx / W) * hostW - tt.offsetWidth - 12;
      tt.style.left = Math.max(0, left) + 'px';
      tt.style.top = '6px';
    }
    function leave() { cross.setAttribute('opacity', 0); dots.forEach(d => d.setAttribute('opacity', 0)); tt.style.opacity = 0; }
    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', leave);
    hit.addEventListener('touchmove', move, { passive: true });
    hit.addEventListener('touchend', leave);

    host.appendChild(svg);
  }

  /* ---------- レンダリング ---------- */
  function renderStatus() {
    const dot = $('#status-dot'), txt = $('#status-text'), upd = $('#status-updated');
    const banner = $('#banner'), bt = $('#banner-text');
    document.body.classList.toggle('is-demo', anyDemo && !anyLive);
    if (anyLive && !anyDemo) {
      dot.className = 'dot live'; txt.textContent = 'ライブデータ（Yahoo Finance）';
      banner.classList.remove('show');
    } else if (anyLive && anyDemo) {
      dot.className = 'dot demo'; txt.textContent = '一部ライブ / 一部デモ';
      bt.innerHTML = '<b>一部の銘柄はライブ取得できず、デモ値を表示しています。</b> 通信環境やCORSプロキシの状態によります。「↻ 更新」で再試行できます。';
      banner.classList.add('show');
    } else if (anyDemo) {
      dot.className = 'dot demo'; txt.textContent = 'デモデータ表示中';
      bt.innerHTML = '<b>ライブデータを取得できませんでした。デモ値を表示しています。</b> ネットワーク接続、またはCORSプロキシへのアクセスをご確認のうえ「↻ 更新」をお試しください（実際の市場価格ではありません）。';
      banner.classList.add('show');
    } else {
      dot.className = 'dot'; txt.textContent = '読み込み中…';
    }
    upd.textContent = '更新: ' + new Date().toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' });
  }

  function renderKPIs() {
    const grid = $('#kpi-grid');
    grid.innerHTML = '';
    MARKET.symbols.filter(s => s.kpi).forEach(cfg => {
      const q = quoteOf(cfg.sym);
      const card = document.createElement('div');
      card.className = 'kpi' + (cfg.sym === mainSym ? ' active' : '');
      card.dataset.sym = cfg.sym;
      if (!q) {
        card.className += ' skeleton';
        card.innerHTML = `<div class="name">${cfg.name}</div><div class="price">–</div><div class="chg">–</div><svg class="spark"></svg>`;
      } else {
        const col = cssVar(q.pct >= 0 ? '--up' : '--down');
        card.innerHTML =
          `<span class="demo-badge">DEMO</span>` +
          `<div class="name">${cfg.name}<span class="ticker">${cfg.sym.replace('=X','').replace('^','')}</span></div>` +
          `<div class="price">${fmtPrice(q.price, cfg)}${cfg.unit && cfg.unit.length === 1 ? '' : ''}</div>` +
          `<div class="chg ${dirClass(q.pct)}">${fmtChg(q.chg, cfg)} (${fmtPct(q.pct)})</div>`;
        const sp = makeSparkSVG(q.spark, 200, 40, col);
        sp.setAttribute('class', 'spark');
        card.appendChild(sp);
      }
      card.addEventListener('click', () => { mainSym = cfg.sym; loadMain(); });
      grid.appendChild(card);
    });
  }

  async function loadMain() {
    $$('#kpi-grid .kpi').forEach(k => k.classList.toggle('active', k.dataset.sym === mainSym));
    $$('#wl-body tr').forEach(r => r.classList.toggle('active', r.dataset.sym === mainSym));
    const cfg = cfgOf(mainSym);
    $('#chart-name').textContent = cfg.name;
    $('#chart-price').textContent = '';
    $('#chart-chg').textContent = '';
    const host = $('#main-host');
    host.querySelectorAll('svg').forEach(s => s.remove());
    const s = await loadSeries(mainSym, mainRange);
    const pts = s.points;
    const rangePct = ((pts[pts.length - 1].c - pts[0].c) / pts[0].c) * 100;
    $('#chart-price').textContent = fmtPrice(pts[pts.length - 1].c, cfg);
    const rl = { '1mo': '1ヶ月', '3mo': '3ヶ月', '6mo': '6ヶ月', '1y': '1年', '5y': '5年' }[mainRange];
    const chgEl = $('#chart-chg');
    chgEl.textContent = `${rl} ${fmtPct(rangePct)}`;
    chgEl.className = 'cur-chg ' + dirClass(rangePct);
    renderChart(host, $('#main-tt'), [{ name: cfg.name, color: rangePct >= 0 ? '--up' : '--down', points: pts, cfg }], 'single');
  }

  async function loadCompare() {
    const host = $('#cmp-host');
    host.querySelectorAll('svg').forEach(s => s.remove());
    const cmpSyms = MARKET.symbols.filter(s => s.cmp);
    await Promise.all(cmpSyms.map(c => loadSeries(c.sym, cmpRange)));
    renderCmpLegend(cmpSyms);
    const series = cmpSyms
      .filter(c => !cmpOff.has(c.sym))
      .map((c, i) => ({ name: c.name, color: CMP_COLORS[MARKET.symbols.filter(s => s.cmp).indexOf(c) % CMP_COLORS.length], points: store[`${c.sym}|${cmpRange}`].points, cfg: c }));
    renderChart(host, $('#cmp-tt'), series, 'compare');
  }

  function renderCmpLegend(cmpSyms) {
    const leg = $('#cmp-legend');
    leg.innerHTML = '';
    cmpSyms.forEach((c, i) => {
      const color = CMP_COLORS[i % CMP_COLORS.length];
      const chip = document.createElement('span');
      chip.className = 'chip' + (cmpOff.has(c.sym) ? ' off' : '');
      chip.innerHTML = `<span class="sw" style="background:${cssVar(color)}"></span>${c.name}`;
      chip.addEventListener('click', () => {
        if (cmpOff.has(c.sym)) cmpOff.delete(c.sym); else cmpOff.add(c.sym);
        loadCompare();
      });
      leg.appendChild(chip);
    });
  }

  function renderWatchlist() {
    const body = $('#wl-body');
    const rows = MARKET.symbols.map(cfg => ({ cfg, q: quoteOf(cfg.sym) })).filter(r => r.q);
    const k = wlSort.k, mul = wlSort.asc ? 1 : -1;
    const val = r => k === 'name' ? r.cfg.name : k === 'price' ? r.q.price : k === 'chg' ? r.q.chg : k === 'pct' ? r.q.pct : k === 'w' ? r.q.wPct : 0;
    rows.sort((a, b) => k === 'name' ? a.cfg.name.localeCompare(b.cfg.name, 'ja') * mul : (val(a) - val(b)) * mul);
    body.innerHTML = '';
    rows.forEach(({ cfg, q }) => {
      const tr = document.createElement('tr');
      tr.dataset.sym = cfg.sym;
      if (cfg.sym === mainSym) tr.classList.add('active');
      const col = cssVar(q.pct >= 0 ? '--up' : '--down');
      tr.innerHTML =
        `<td class="name">${cfg.name}<span class="tk">${cfg.sym.replace('=X','').replace('^','')}</span></td>` +
        `<td class="num">${fmtPrice(q.price, cfg)}</td>` +
        `<td class="num ${dirClass(q.chg)}">${fmtChg(q.chg, cfg)}</td>` +
        `<td class="num ${dirClass(q.pct)}">${fmtPct(q.pct)}</td>` +
        `<td class="num ${dirClass(q.wPct)}">${fmtPct(q.wPct)}</td>` +
        `<td class="spark"></td>`;
      const sp = makeSparkSVG(q.spark, 110, 26, col);
      tr.querySelector('.spark').appendChild(sp);
      tr.addEventListener('click', () => { mainSym = cfg.sym; loadMain(); window.scrollTo({ top: $('#chart-name').getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' }); });
      body.appendChild(tr);
    });
    $$('#wl-table th').forEach(th => {
      th.classList.toggle('sorted', th.dataset.k === (wlSort.k === 'pct' ? 'pct' : wlSort.k === 'w' ? 'w' : wlSort.k));
      th.classList.toggle('asc', wlSort.asc);
    });
  }

  /* ---------- 初期化 & イベント ---------- */
  async function boot() {
    renderStatus();
    // 1mo をまとめて取得（KPI・ウォッチリスト・スパーク用）
    const all = MARKET.symbols.map(s => loadSeries(s.sym, '1mo'));
    // 逐次的に描画更新
    let done = 0;
    all.forEach(p => p.then(() => { done++; renderKPIs(); renderWatchlist(); }));
    await Promise.all(all);
    renderStatus();
    renderKPIs();
    renderWatchlist();
    await Promise.all([loadMain(), loadCompare()]);
    renderStatus();
  }

  function bindEvents() {
    $('#ranges').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$('#ranges button').forEach(x => x.classList.toggle('on', x === b));
      mainRange = b.dataset.r; loadMain();
    });
    $('#ranges-cmp').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$('#ranges-cmp button').forEach(x => x.classList.toggle('on', x === b));
      cmpRange = b.dataset.r; loadCompare();
    });
    $('#wl-table thead').addEventListener('click', e => {
      const th = e.target.closest('th'); if (!th) return;
      const k = th.dataset.k;
      if (wlSort.k === k) wlSort.asc = !wlSort.asc;
      else { wlSort.k = k; wlSort.asc = k === 'name'; }
      renderWatchlist();
    });
    $('#btn-refresh').addEventListener('click', async () => {
      const btn = $('#btn-refresh'); btn.disabled = true; btn.textContent = '更新中…';
      anyDemo = anyLive = false;
      for (const kk in store) delete store[kk];
      try { localStorage.clear(); } catch {}
      const all = MARKET.symbols.map(s => loadSeries(s.sym, '1mo', { force: true }));
      await Promise.all(all);
      renderKPIs(); renderWatchlist();
      await Promise.all([loadMain(), loadCompare()]);
      renderStatus();
      btn.disabled = false; btn.textContent = '↻ 更新';
    });
    $('#btn-theme').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const isDark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('mkt:theme', next); } catch {}
      // 色が変わるのでチャート再描画
      renderKPIs(); renderWatchlist(); loadMain(); loadCompare();
    });
  }

  // 保存済みテーマ
  try { const t = localStorage.getItem('mkt:theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch {}

  bindEvents();
  boot();
})();
