/* =========================================================
 * commons.js — Wikimedia Commons 画像検索クライアント
 * ブラウザから直接 Commons API を叩く（origin=* で匿名CORS）。
 * 開発用に ?mock=1 でローカル画像のダミー結果を返す。
 * ======================================================= */

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

const IS_MOCK = new URLSearchParams(location.search).has('mock');

/* ?mock=1 用のローカルフィクスチャ（リポジトリには含まれない） */
const MOCK_RESULTS = ['elegy2', 'banshee', 'comet2', 'adder', 'dominator', 'jester'].map(n => ({
  title: `テスト車両 ${n}`,
  mime: 'image/png',
  thumb: `test-fixtures/${n}.png`,
  large: `test-fixtures/${n}.png`,
  page: '#',
  artist: 'ローカルテスト画像',
  license: 'テスト用',
}));

function stripHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').trim();
}

/* 検索。pngOnly=true なら切り抜きに向いた透過PNGに絞る */
async function commonsSearch(term, { pngOnly = true, limit = 24 } = {}) {
  if (IS_MOCK) return MOCK_RESULTS;

  const q = pngOnly ? `${term} filemime:image/png` : term;
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: q,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1200',
  });

  const res = await fetch(`${COMMONS_API}?${params}`);
  if (!res.ok) throw new Error(`Commons API エラー (${res.status})`);
  const data = await res.json();
  const pages = Object.values(data.query?.pages || {});

  return pages
    .filter(p => p.imageinfo && p.imageinfo[0])
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map(p => {
      const ii = p.imageinfo[0];
      const em = ii.extmetadata || {};
      const large = ii.thumburl || ii.url;
      // グリッド表示には小さめのサムネイルを使う
      const thumb = /\/\d+px-/.test(large) ? large.replace(/\/\d+px-/, '/320px-') : large;
      return {
        title: p.title.replace(/^File:/, '').replace(/\.\w+$/, ''),
        mime: ii.mime,
        thumb,
        large,
        page: ii.descriptionurl,
        artist: stripHtml(em.Artist ? em.Artist.value : ''),
        license: em.LicenseShortName ? em.LicenseShortName.value : '',
      };
    });
}

/* 検索チップ: 日本語ラベル → Commonsで見つかりやすい英語クエリ */
const QUICK_CARS = [
  { label: 'GT-R', q: 'Nissan GT-R' },
  { label: 'スープラ', q: 'Toyota Supra' },
  { label: 'RX-7', q: 'Mazda RX-7' },
  { label: 'フェアレディZ', q: 'Nissan Fairlady Z' },
  { label: 'シビック タイプR', q: 'Honda Civic Type R' },
  { label: 'NSX', q: 'Honda NSX' },
  { label: '86 / BRZ', q: 'Toyota 86' },
  { label: 'ランエボ', q: 'Mitsubishi Lancer Evolution' },
  { label: 'インプレッサ', q: 'Subaru Impreza WRX' },
  { label: 'スカイライン', q: 'Nissan Skyline GT-R' },
  { label: 'ジムニー', q: 'Suzuki Jimny' },
  { label: 'ランクル', q: 'Toyota Land Cruiser' },
  { label: 'フェラーリ', q: 'Ferrari' },
  { label: 'ランボルギーニ', q: 'Lamborghini' },
  { label: 'ポルシェ 911', q: 'Porsche 911' },
  { label: 'ミニ', q: 'Mini Cooper' },
  { label: 'ビートル', q: 'Volkswagen Beetle' },
  { label: 'デロリアン', q: 'DeLorean DMC-12' },
];
