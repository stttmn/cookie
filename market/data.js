/* ===== 銘柄設定 & フォールバック用デモデータ =====
   MARKET.symbols … ダッシュボードに表示する指数・銘柄
   MARKET.demoSeries … ライブ取得に失敗したときだけ使う「デモ」データ。
   実在の市場価格ではなく、UIを成立させるための合成値（DEMOバッジ付きで表示）。 */

const MARKET = (() => {
  // group: 'index' | 'stock' | 'macro'
  // kpi:true … 上部のKPIカードに出す主要指標
  // cmp:true … 「指数を比較」に含める
  const symbols = [
    { sym: '^GSPC',  name: 'S&P 500',        group: 'index', kpi: true,  cmp: true,  unit: '',    base: 5500 },
    { sym: '^IXIC',  name: 'NASDAQ総合',     group: 'index', kpi: true,  cmp: true,  unit: '',    base: 18000 },
    { sym: '^DJI',   name: 'ダウ30種',       group: 'index', kpi: true,  cmp: true,  unit: '',    base: 40000 },
    { sym: '^N225',  name: '日経平均',       group: 'index', kpi: true,  cmp: true,  unit: '円',  base: 40000 },
    { sym: '^RUT',   name: 'ラッセル2000',   group: 'index', kpi: false, cmp: true,  unit: '',    base: 2200 },
    { sym: '^FTSE',  name: '英FTSE100',      group: 'index', kpi: false, cmp: false, unit: '',    base: 8200 },
    { sym: '^GDAXI', name: '独DAX',          group: 'index', kpi: false, cmp: false, unit: '',    base: 18500 },
    { sym: '^HSI',   name: '香港ハンセン',   group: 'index', kpi: false, cmp: false, unit: '',    base: 18000 },

    { sym: 'JPY=X',  name: 'ドル円',         group: 'macro', kpi: true,  cmp: false, unit: '円',  base: 156, dp: 2 },
    { sym: '^TNX',   name: '米10年債利回り', group: 'macro', kpi: false, cmp: false, unit: '%',   base: 4.3, dp: 2 },
    { sym: 'GC=F',   name: '金（NY先物）',   group: 'macro', kpi: false, cmp: false, unit: '$',   base: 2350 },
    { sym: 'CL=F',   name: '原油WTI',        group: 'macro', kpi: false, cmp: false, unit: '$',   base: 80, dp: 2 },
    { sym: 'BTC-USD',name: 'ビットコイン',   group: 'macro', kpi: false, cmp: false, unit: '$',   base: 64000 },
    { sym: '^VIX',   name: 'VIX恐怖指数',    group: 'macro', kpi: false, cmp: false, unit: '',    base: 15, dp: 2 },

    { sym: 'AAPL',   name: 'Apple',          group: 'stock', kpi: false, cmp: false, unit: '$',   base: 215, dp: 2 },
    { sym: 'MSFT',   name: 'Microsoft',      group: 'stock', kpi: false, cmp: false, unit: '$',   base: 440, dp: 2 },
    { sym: 'NVDA',   name: 'NVIDIA',         group: 'stock', kpi: false, cmp: false, unit: '$',   base: 120, dp: 2 },
    { sym: 'AMZN',   name: 'Amazon',         group: 'stock', kpi: false, cmp: false, unit: '$',   base: 185, dp: 2 },
    { sym: 'GOOGL',  name: 'Alphabet',       group: 'stock', kpi: false, cmp: false, unit: '$',   base: 180, dp: 2 },
    { sym: 'META',   name: 'Meta',           group: 'stock', kpi: false, cmp: false, unit: '$',   base: 500, dp: 2 },
    { sym: 'TSLA',   name: 'Tesla',          group: 'stock', kpi: false, cmp: false, unit: '$',   base: 250, dp: 2 },
  ];

  // 決定論的な擬似乱数（シード固定でリロードしても同じ形になる）
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 指定シンボル・日数の合成時系列（幾何ブラウン運動風）。営業日ベース。
  function demoSeries(cfg, days) {
    let seed = 0;
    for (const ch of cfg.sym) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    const rnd = mulberry32(seed >>> 0);
    const vol = cfg.group === 'macro' && cfg.sym === '^VIX' ? 0.035
              : cfg.group === 'stock' ? 0.018
              : cfg.sym === 'BTC-USD' ? 0.03
              : cfg.group === 'macro' ? 0.008 : 0.009;
    const drift = 0.0004 * (rnd() - 0.35); // 銘柄ごとに緩やかな上げ/下げ傾向
    const out = [];
    let price = cfg.base * (0.82 + rnd() * 0.12); // 期間始点は現在よりやや低めから
    const now = new Date();
    let d = new Date(now);
    // days 営業日ぶん過去にさかのぼって配列を作る
    const dates = [];
    let count = 0;
    while (count < days) {
      const wd = d.getDay();
      if (wd !== 0 && wd !== 6) { dates.push(new Date(d)); count++; }
      d.setDate(d.getDate() - 1);
    }
    dates.reverse();
    for (let i = 0; i < dates.length; i++) {
      const shock = (rnd() - 0.5) * 2 * vol;
      price = price * (1 + drift + shock);
      out.push({ t: Math.floor(dates[i].getTime() / 1000), c: price });
    }
    // 終値を base 近傍に寄せる（見栄えのため）
    const scale = cfg.base / out[out.length - 1].c;
    const adj = 1 + (scale - 1) * 0.6;
    for (const p of out) p.c *= adj;
    return out;
  }

  return { symbols, demoSeries };
})();
