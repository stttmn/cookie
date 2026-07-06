// ============================================================
// app.js — クックノート本体
// レシピ保存 / SNS・ウェブ取り込み / 献立提案 / 買い物メモ
// ============================================================

/* global RecipeParser, SAMPLE_RECIPES, RICE_KCAL_PER_SERVING */

const P = RecipeParser;
const LS_KEYS = { recipes: "cooknote.recipes", plan: "cooknote.plan", shopping: "cooknote.shopping", init: "cooknote.initialized" };

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- 状態 ----
let recipes = load(LS_KEYS.recipes, []);
let plan = load(LS_KEYS.plan, null);
let shopping = load(LS_KEYS.shopping, []);

// 初回はサンプルレシピを投入
if (!localStorage.getItem(LS_KEYS.init)) {
  if (recipes.length === 0) {
    recipes = SAMPLE_RECIPES.map((r) => ({ ...r, id: uid(), source: "サンプル", url: "", image: "", createdAt: Date.now() }));
    save(LS_KEYS.recipes, recipes);
  }
  localStorage.setItem(LS_KEYS.init, "1");
}

function persistRecipes() { save(LS_KEYS.recipes, recipes); }
function persistPlan() { save(LS_KEYS.plan, plan); }
function persistShopping() { save(LS_KEYS.shopping, shopping); }

// ---- toast ----
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// ---- タブ ----
function switchTab(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  window.scrollTo(0, 0);
}
document.querySelectorAll("nav.tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

// ============================================================
// レシピ一覧
// ============================================================
let filterCat = "すべて";

function recipeKcalLabel(r) {
  const est = P.estimateCalories(r);
  if (!est.perServing || est.coverage < 0.3) return "";
  return `約${est.perServing}kcal/人`;
}

function renderRecipes() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const grid = document.getElementById("recipe-grid");
  const list = recipes
    .filter((r) => filterCat === "すべて" || r.category === filterCat)
    .filter((r) => {
      if (!q) return true;
      const hay = (r.title + " " + (r.tags || []).join(" ") + " " + (r.ingredients || []).map((i) => i.name).join(" ")).toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  document.getElementById("recipe-count").textContent = `${recipes.length}件保存中`;

  if (list.length === 0) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="big">🍳</span>レシピがありません。<br>「取り込み」タブからSNSやウェブサイトのレシピを追加できます。</div>`;
    return;
  }
  grid.innerHTML = list.map((r) => {
    const kcal = recipeKcalLabel(r);
    return `<div class="recipe-card" data-id="${r.id}">
      ${r.image ? `<img class="thumb" src="${esc(r.image)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
      <h3>${esc(r.title)}</h3>
      <div class="meta">
        <span class="chip cat-${esc(r.category)}">${esc(r.category)}</span>
        ${r.genre && r.genre !== "その他" ? `<span class="chip tag">${esc(r.genre)}</span>` : ""}
        ${r.source && r.source !== "手入力" ? `<span class="chip src">${esc(r.source)}</span>` : ""}
        ${(r.tags || []).slice(0, 2).map((t) => `<span class="chip tag">#${esc(t)}</span>`).join("")}
        ${kcal ? `<span class="kcal">🔥 ${kcal}</span>` : ""}
      </div>
    </div>`;
  }).join("");

  grid.querySelectorAll(".recipe-card").forEach((c) => c.addEventListener("click", () => openDetail(c.dataset.id)));
}

document.getElementById("search").addEventListener("input", renderRecipes);
document.querySelectorAll("#cat-filter button").forEach((b) =>
  b.addEventListener("click", () => {
    filterCat = b.dataset.cat;
    document.querySelectorAll("#cat-filter button").forEach((x) => x.classList.toggle("on", x === b));
    renderRecipes();
  })
);

// ============================================================
// レシピ詳細モーダル
// ============================================================
let detailServings = 2;

function openDetail(id) {
  const r = recipes.find((x) => x.id === id);
  if (!r) return;
  detailServings = r.servings || 2;
  renderDetail(r);
  document.getElementById("modal-detail").classList.add("open");
}

function renderDetail(r) {
  const factor = detailServings / (r.servings || detailServings || 1);
  const est = P.estimateCalories(r);
  const kcalTxt = est.perServing && est.coverage >= 0.3 ? `🔥 1人あたり 約${est.perServing}kcal（推定）` : "";

  document.getElementById("detail-body").innerHTML = `
    <h3>${esc(r.title)}</h3>
    <div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
      <span class="chip cat-${esc(r.category)}">${esc(r.category)}</span>
      ${r.genre && r.genre !== "その他" ? `<span class="chip tag">${esc(r.genre)}</span>` : ""}
      ${r.source ? `<span class="chip src">${esc(r.source)}</span>` : ""}
      ${(r.tags || []).map((t) => `<span class="chip tag">#${esc(t)}</span>`).join("")}
    </div>
    ${r.image ? `<img class="detail-thumb" src="${esc(r.image)}" alt="" onerror="this.remove()">` : ""}
    <p class="hint" style="margin-top:8px">${kcalTxt}</p>

    <div style="display:flex;align-items:center;gap:10px;margin:14px 0 4px">
      <strong style="font-size:0.9rem">材料</strong>
      <div class="serv-ctrl">
        <button id="serv-minus">−</button>
        <span>${detailServings}人分</span>
        <button id="serv-plus">＋</button>
      </div>
    </div>
    <table class="ing-table">
      ${(r.ingredients || []).map((i) => i.group
        ? `<tr class="grp"><td colspan="2">▼ ${esc(i.name)}</td></tr>`
        : `<tr><td>${esc(i.name)}</td><td class="qty">${esc(P.scaleQty(i.qty, factor))}</td></tr>`).join("")}
    </table>

    <strong style="font-size:0.9rem;display:block;margin-top:14px">作り方</strong>
    <ol class="steps-list">${(r.steps || []).map((s) => `<li><span>${esc(s)}</span></li>`).join("")}</ol>

    ${r.notes ? `<div class="mono-note">${esc(r.notes)}</div>` : ""}
    ${r.url ? `<p style="margin-top:10px;font-size:0.8rem">元の投稿: <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a></p>` : ""}

    <div class="row" style="margin-top:18px">
      <button class="btn green" id="d-shop">🛒 買い物リストへ</button>
      <button class="btn ghost" id="d-edit">✏️ 編集</button>
      <button class="btn danger" id="d-del">削除</button>
    </div>`;

  document.getElementById("serv-minus").onclick = () => { if (detailServings > 1) { detailServings--; renderDetail(r); } };
  document.getElementById("serv-plus").onclick = () => { if (detailServings < 20) { detailServings++; renderDetail(r); } };
  document.getElementById("d-edit").onclick = () => { closeModals(); openEditor(r); };
  document.getElementById("d-del").onclick = () => {
    if (confirm(`「${r.title}」を削除しますか？`)) {
      recipes = recipes.filter((x) => x.id !== r.id);
      persistRecipes(); renderRecipes(); closeModals();
      toast("削除しました");
    }
  };
  document.getElementById("d-shop").onclick = () => {
    addRecipeToShopping(r, detailServings);
    toast(`「${r.title}」(${detailServings}人分)の材料を買い物リストに追加しました`);
  };
}

// ============================================================
// エディタ（新規・編集・取り込みプレビュー共通）
// ============================================================
function openEditor(r) {
  const isNew = !r || !r.id;
  document.getElementById("editor-title").textContent = isNew ? (r && r.title ? "取り込み結果の確認" : "レシピを手入力") : "レシピを編集";
  document.getElementById("e-id").value = r && r.id ? r.id : "";
  document.getElementById("e-title").value = (r && r.title) || "";
  document.getElementById("e-cat").value = (r && r.category) || "主菜";
  document.getElementById("e-genre").value = (r && r.genre) || "その他";
  document.getElementById("e-serv").value = (r && r.servings) || 2;
  document.getElementById("e-tags").value = ((r && r.tags) || []).join(", ");
  document.getElementById("e-url").value = (r && r.url) || "";
  document.getElementById("e-source").value = (r && r.source) || "手入力";
  document.getElementById("e-image").value = (r && r.image) || "";
  document.getElementById("e-notes").value = (r && r.notes) || "";
  document.getElementById("e-ings").value = ((r && r.ingredients) || [])
    .map((i) => (i.group ? `【${i.name}】` : `${i.name} ${i.qty || ""}`.trim())).join("\n");
  document.getElementById("e-steps").value = ((r && r.steps) || []).join("\n");
  document.getElementById("modal-editor").classList.add("open");
}

document.getElementById("editor-save").addEventListener("click", () => {
  const title = document.getElementById("e-title").value.trim();
  if (!title) { toast("料理名を入力してください"); return; }

  const ingredients = document.getElementById("e-ings").value.split("\n")
    .map((l) => l.trim()).filter(Boolean)
    .map((l) => {
      const g = l.match(/^[【\[]\s*(.+?)\s*[】\]]$/);
      if (g) return { name: g[1], qty: "", group: true };
      return P.parseIngredientLine(P.normalize(l)) || { name: l, qty: "" };
    });
  const steps = document.getElementById("e-steps").value.split("\n").map((l) => l.trim()).filter(Boolean);
  const tags = document.getElementById("e-tags").value.split(/[,、]/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean);

  const data = {
    title,
    category: document.getElementById("e-cat").value,
    genre: document.getElementById("e-genre").value,
    servings: Math.max(1, parseInt(document.getElementById("e-serv").value, 10) || 2),
    tags, ingredients, steps,
    url: document.getElementById("e-url").value.trim(),
    source: document.getElementById("e-source").value.trim() || "手入力",
    image: document.getElementById("e-image").value.trim(),
    notes: document.getElementById("e-notes").value.trim(),
  };

  const id = document.getElementById("e-id").value;
  if (id) {
    const idx = recipes.findIndex((x) => x.id === id);
    if (idx >= 0) recipes[idx] = { ...recipes[idx], ...data };
    toast("更新しました");
  } else {
    recipes.push({ ...data, id: uid(), createdAt: Date.now() });
    toast("レシピを保存しました 🎉");
  }
  persistRecipes(); renderRecipes(); closeModals();
  switchTab("recipes");
});

document.getElementById("btn-new-recipe").addEventListener("click", () => openEditor(null));

// ============================================================
// 取り込み（SNS / ウェブサイト）
// ============================================================
const importStatus = document.getElementById("import-status");
function setStatus(msg, cls) {
  importStatus.textContent = msg;
  importStatus.className = "import-status" + (cls ? " " + cls : "");
}

function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

// 直接fetch → CORS回避プロキシ → テキスト抽出サービスの順で試す
async function fetchPage(url, opts = {}) {
  const attempts = [
    { u: url, kind: "html" },
    { u: "https://api.allorigins.win/raw?url=" + encodeURIComponent(url), kind: "html" },
  ];
  if (opts.jina !== false) attempts.push({ u: "https://r.jina.ai/" + url, kind: "text" });
  let lastErr;
  for (const a of attempts) {
    try {
      const res = await fetchWithTimeout(a.u);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const body = await res.text();
      if (body && body.length > (opts.minLength ?? 50)) return { body, kind: a.kind };
      throw new Error("empty");
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("fetch failed");
}

async function fetchOEmbed(url) {
  try {
    const res = await fetchWithTimeout("https://noembed.com/embed?url=" + encodeURIComponent(url), 8000);
    if (!res.ok) return null;
    const j = await res.json();
    if (j && !j.error && j.title) return j;
  } catch { /* offline等は無視 */ }
  return null;
}

function youtubeId(url) {
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

let pendingMeta = null; // URL取得で得たメタ情報（貼り付け解析時に合成）

document.getElementById("btn-import-url").addEventListener("click", async () => {
  const url = document.getElementById("import-url").value.trim();
  if (!url) { setStatus("URLを入力してください", "err"); return; }
  const platform = P.detectPlatform(url);
  if (!platform) { setStatus("URLの形式が正しくありません", "err"); return; }

  const btn = document.getElementById("btn-import-url");
  btn.disabled = true;
  pendingMeta = { url, platform, source: P.PLATFORM_LABEL[platform] };
  setStatus(`${P.PLATFORM_LABEL[platform]} から取得中…`);

  try {
    if (platform === "web") {
      const { body, kind } = await fetchPage(url);
      let recipe = null;
      if (kind === "html" && body.includes("ld+json")) recipe = P.parseJsonLd(body);
      if (recipe && recipe.ingredients.length) {
        setStatus("✅ レシピデータ(構造化データ)を検出しました。内容を確認して保存してください。", "ok");
        finishImport(recipe);
      } else {
        const text = kind === "html" ? P.htmlToText(body) : body;
        const title = kind === "html" ? P.htmlTitle(body) : "";
        recipe = P.parseText(text, { title });
        if (recipe.ingredients.length >= 2) {
          setStatus("✅ ページ本文からレシピを抽出しました。内容を確認して保存してください。", "ok");
          finishImport(recipe);
        } else {
          setStatus("⚠️ ページからレシピを自動抽出できませんでした。\nページのレシピ部分をコピーして、下の貼り付け欄で文字起こしできます。", "err");
        }
      }
    } else if (platform === "youtube") {
      await importYouTube(url);
    } else if (platform === "tiktok") {
      await importTikTok(url);
    } else {
      await importInstagramOrX(url, platform);
    }
  } catch (e) {
    setStatus("⚠️ ページを取得できませんでした（ネットワーク制限またはサイト側の制限）。\nレシピのテキストをコピーして、下の貼り付け欄をご利用ください。", "err");
  } finally {
    btn.disabled = false;
  }
});

// --- YouTube: 概要欄+字幕(=動画音声の文字起こし)を自動取得 ---
async function importYouTube(url) {
  const vid = youtubeId(url);
  if (vid) pendingMeta.image = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
  setStatus("YouTubeから動画情報を取得中…");

  let yt = null;
  try {
    const watchUrl = vid ? "https://www.youtube.com/watch?v=" + vid : url;
    const { body } = await fetchPage(watchUrl, { jina: false, minLength: 5000 });
    yt = P.youtubeFromWatchHtml(body);
  } catch { /* 下のフォールバックへ */ }

  if (!yt) {
    const meta = await fetchOEmbed(url);
    if (meta) {
      pendingMeta.title = meta.title || "";
      pendingMeta.image = meta.thumbnail_url || pendingMeta.image || "";
      pendingMeta.author = meta.author_name || "";
    }
    setStatus("⚠️ 動画ページを自動取得できませんでした（通信環境やYouTube側の制限の可能性があります）。\n概要欄のテキストを下の欄に貼り付けてもらえれば文字起こしします。", "err");
    document.getElementById("import-text").focus();
    return;
  }

  pendingMeta.title = yt.title || "";
  pendingMeta.author = yt.author || "";

  // 1) 概要欄にレシピが書かれていれば、それが最も正確
  if (yt.description) {
    const fromDesc = P.parseText(yt.description, { title: yt.title });
    if (fromDesc.ingredients.filter((i) => !i.group).length >= 2) {
      setStatus(`✅ 「${yt.title}」の概要欄からレシピを自動抽出しました。内容を確認して保存してください。`, "ok");
      finishImport(fromDesc);
      return;
    }
  }

  // 2) 字幕データ = 動画音声の文字起こしを取得
  setStatus("概要欄にレシピが見つからないため、動画音声の文字起こし（字幕）を取得中…");
  let transcript = "";
  const track = P.pickCaptionTrack(yt.captionTracks);
  if (track) {
    try {
      const capUrl = track.baseUrl + (track.baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
      const { body } = await fetchPage(capUrl, { jina: false, minLength: 20 });
      try { transcript = P.transcriptFromJson3(JSON.parse(body)); }
      catch { transcript = P.transcriptFromXml(body); }
    } catch { /* 字幕なしとして続行 */ }
  }

  if (!transcript && !yt.description) {
    setStatus("⚠️ この動画には概要欄のテキストも字幕もありませんでした。\nお手数ですが、レシピのテキストを下の欄に貼り付けてください。", "err");
    return;
  }

  // 文字起こし全文をテキスト欄に表示（ユーザーが確認・編集できるように）
  const combined = [
    transcript ? "【動画音声の文字起こし】\n" + transcript : "",
    yt.description ? "【概要欄】\n" + yt.description : "",
  ].filter(Boolean).join("\n\n");
  document.getElementById("import-text").value = combined;

  const parsed = P.parseText([yt.description, transcript].filter(Boolean).join("\n\n"), { title: yt.title });
  if (parsed.ingredients.filter((i) => !i.group).length >= 2) {
    setStatus("✅ 動画の文字起こしからレシピを抽出しました。内容を確認して保存してください。", "ok");
    finishImport(parsed);
  } else {
    setStatus("✅ 動画音声の文字起こしを取得し、下の欄に入れました。\n話し言葉のため材料の自動抽出はできませんでした。分量部分を残すように整えて「文字起こしする」を押してください。", "ok");
    document.getElementById("import-text").focus();
  }
}

// --- TikTok: oEmbedでキャプション(タイトル欄に全文が入る)を自動取得 ---
async function importTikTok(url) {
  setStatus("TikTokから投稿情報を取得中…");
  let meta = null;
  try {
    const { body } = await fetchPage("https://www.tiktok.com/oembed?url=" + encodeURIComponent(url), { jina: false, minLength: 20 });
    meta = JSON.parse(body);
  } catch { /* noembedへ */ }
  if (!meta || !meta.title) meta = await fetchOEmbed(url);

  if (!meta || !meta.title) {
    setStatus("⚠️ TikTokから投稿を自動取得できませんでした。\n投稿のキャプションをコピーして下の欄に貼り付けてください。文字起こしします。", "err");
    document.getElementById("import-text").focus();
    return;
  }

  pendingMeta.image = meta.thumbnail_url || "";
  pendingMeta.author = meta.author_name || "";
  const caption = meta.title;
  document.getElementById("import-text").value = caption;

  const parsed = P.parseText(caption);
  if (parsed.ingredients.filter((i) => !i.group).length >= 2) {
    setStatus("✅ キャプションからレシピを自動抽出しました。内容を確認して保存してください。", "ok");
    finishImport(parsed);
  } else {
    setStatus("✅ キャプションを取得しました（下の欄）。材料が動画内にしか出てこない投稿のようです。\nTikTokは音声データを外部提供していないため、動画を見ながら下の欄に材料を書き足して「文字起こしする」を押してください。", "ok");
    document.getElementById("import-text").focus();
  }
}

// --- Instagram / X: 公開投稿ならテキスト抽出を試みる ---
async function importInstagramOrX(url, platform) {
  const label = P.PLATFORM_LABEL[platform];
  setStatus(`${label}から投稿を取得中…`);
  let text = "";
  try {
    const { body, kind } = await fetchPage(url, { minLength: 200 });
    text = kind === "html" ? P.htmlToText(body) : body;
  } catch { /* 取得失敗 */ }

  // ログイン壁のページは除外
  if (text && /ログインが必要|Log in to|Sign up|ログインして/i.test(text.slice(0, 600))) text = "";

  if (text) {
    const parsed = P.parseText(text.slice(0, 6000));
    if (parsed.ingredients.filter((i) => !i.group).length >= 2) {
      setStatus(`✅ ${label}の投稿からレシピを自動抽出しました。内容を確認して保存してください。`, "ok");
      finishImport(parsed);
      return;
    }
  }
  setStatus(`⚠️ ${label}は外部からの自動取得を制限しているため、投稿を取得できませんでした。\nアプリでキャプションをコピー（︙メニュー→リンクをコピーの近くにあります）して、下の欄に貼り付けてください。自動で文字起こしします。`, "err");
  document.getElementById("import-text").focus();
}

document.getElementById("btn-import-text").addEventListener("click", () => {
  const text = document.getElementById("import-text").value;
  if (!text.trim()) { setStatus("テキストを貼り付けてください", "err"); return; }
  const recipe = P.parseText(text, { title: pendingMeta && pendingMeta.title });
  if (!recipe.ingredients.length && !recipe.steps.length) {
    setStatus("⚠️ 材料・手順を検出できませんでした。「材料」「作り方」の見出しを含めて貼り付けると精度が上がります。", "err");
    return;
  }
  setStatus(`✅ 文字起こし完了: 材料${recipe.ingredients.filter((i) => !i.group).length}件・手順${recipe.steps.length}件を検出しました。`, "ok");
  finishImport(recipe);
});

function finishImport(recipe) {
  const meta = pendingMeta || {};
  const merged = {
    ...recipe,
    url: meta.url || "",
    source: meta.source || "ウェブサイト",
    image: recipe.image || meta.image || "",
    category: P.guessRole(recipe),
    genre: P.guessGenre(recipe),
  };
  if (meta.author && merged.tags.length < 6) merged.tags.push(meta.author);
  openEditor(merged);
}

// ============================================================
// 献立提案
// ============================================================
const TARGET_KCAL = { light: 500, normal: 700, hearty: 900 };

document.getElementById("plan-target").addEventListener("change", (e) => {
  document.getElementById("plan-custom-wrap").style.display = e.target.value === "custom" ? "" : "none";
});

function recipesByRole() {
  const map = { 主菜: [], 副菜: [], 汁物: [], 主食: [] };
  for (const r of recipes) if (map[r.category]) map[r.category].push(r);
  return map;
}

function prefScore(r, prefs) {
  let s = 0;
  if (prefs.genres.length && prefs.genres.includes(r.genre)) s += 30;
  const ingText = (r.ingredients || []).map((i) => i.name).join(" ") + r.title;
  if (prefs.focus === "meat" && /肉|鶏|豚|牛|ひき/.test(ingText)) s += 25;
  if (prefs.focus === "fish" && /鮭|さば|サバ|ぶり|たら|まぐろ|えび|いか|あさり|ツナ|魚|さんま/.test(ingText)) s += 25;
  if (prefs.focus === "veg") {
    const vegCount = (r.ingredients || []).filter((i) => P.shopCategory(i.name) === "野菜・きのこ").length;
    s += Math.min(25, vegCount * 6);
  }
  return s;
}

function kcalOf(r) {
  const e = P.estimateCalories(r);
  // 推定できない場合はカテゴリ別の一般的な目安を使う
  if (!e.perServing || e.coverage < 0.3) {
    return { 主菜: 350, 副菜: 90, 汁物: 60, 主食: 500 }[r.category] || 200;
  }
  return e.perServing;
}

// 重み付きランダム選択（スコア上位ほど選ばれやすい）
function pickWeighted(cands, used) {
  const pool = cands.filter((c) => !used.has(c.r.id));
  const list = pool.length ? pool : cands;
  if (!list.length) return null;
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, Math.min(4, list.length));
  const total = top.reduce((s, c) => s + Math.max(1, c.score), 0);
  let x = Math.random() * total;
  for (const c of top) { x -= Math.max(1, c.score); if (x <= 0) return c.r; }
  return top[0].r;
}

function buildMeal(target, prefs, byRole, used, withRice) {
  const meal = { dishes: [], kcal: 0 };
  let remaining = target;

  if (withRice) { meal.kcal += RICE_KCAL_PER_SERVING; remaining -= RICE_KCAL_PER_SERVING; }

  const wantRoles = withRice ? ["主菜", "副菜", "汁物"] : (byRole["主食"].length ? ["主食", "副菜", "汁物"] : ["主菜", "副菜", "汁物"]);
  const budget = { 主菜: 0.65, 主食: 0.75, 副菜: 0.2, 汁物: 0.15 };

  for (const role of wantRoles) {
    const cands = byRole[role];
    if (!cands || !cands.length) continue;
    const roleTarget = remaining * budget[role];
    const scored = cands.map((r) => {
      const k = kcalOf(r);
      return { r, k, score: 100 - Math.min(90, Math.abs(k - roleTarget) / 4) + prefScore(r, prefs) + Math.random() * 12 };
    });
    const pick = pickWeighted(scored, used);
    if (pick) {
      used.add(pick.id);
      const k = kcalOf(pick);
      meal.dishes.push({ id: pick.id, kcal: k });
      meal.kcal += k;
      remaining -= k;
    }
  }
  meal.withRice = withRice;
  meal.kcal = Math.round(meal.kcal);
  return meal;
}

function generatePlan() {
  const people = Math.max(1, parseInt(document.getElementById("plan-people").value, 10) || 2);
  const targetSel = document.getElementById("plan-target").value;
  const target = targetSel === "custom"
    ? Math.max(200, parseInt(document.getElementById("plan-custom").value, 10) || 700)
    : TARGET_KCAL[targetSel];
  const meals = parseInt(document.getElementById("plan-meals").value, 10);
  const withRice = document.getElementById("plan-rice").checked;
  const genres = [...document.querySelectorAll("#plan-genres input:checked")].map((c) => c.value);
  const focus = document.querySelector("#plan-focus input:checked")?.value || "";

  const byRole = recipesByRole();
  if (!byRole["主菜"].length && !byRole["主食"].length) {
    toast("主菜または主食のレシピを先に保存してください");
    return;
  }

  const prefs = { genres, focus };
  const used = new Set();
  const mealList = [];
  for (let i = 0; i < meals; i++) {
    // レシピが少ないときは繰り返し使えるように定期的にリセット
    if (used.size > recipes.length - 3) used.clear();
    mealList.push(buildMeal(target, prefs, byRole, used, withRice));
  }

  plan = { people, target, withRice, prefs, meals: mealList, createdAt: Date.now() };
  persistPlan();
  renderPlan();
  toast(`${meals}食分の献立を提案しました 🍽️`);
}

document.getElementById("btn-generate-plan").addEventListener("click", generatePlan);

function renderPlan() {
  const box = document.getElementById("plan-result");
  if (!plan || !plan.meals || !plan.meals.length) {
    box.innerHTML = `<div class="empty"><span class="big">🍽️</span>条件を設定して「献立を提案」を押すと、<br>保存済みレシピから献立を組み立てます。</div>`;
    return;
  }
  const mealNames = plan.meals.length <= 3 ? ["1食目", "2食目", "3食目"] : null;

  box.innerHTML = `
    <div class="card" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      <strong style="font-size:0.9rem">🍽️ ${plan.people}人分 × ${plan.meals.length}食</strong>
      <span class="chip tag">目標 ${plan.target}kcal/人・食</span>
      ${plan.withRice ? `<span class="chip tag">ご飯付き</span>` : ""}
      <button class="btn sm green" id="plan-to-shop" style="margin-left:auto">🛒 この献立で買い物リスト作成</button>
    </div>
    ${plan.meals.map((meal, mi) => {
      const diff = meal.kcal - plan.target;
      const badge = Math.abs(diff) <= plan.target * 0.15
        ? `<span class="kcal-badge">約${meal.kcal}kcal/人 ✓</span>`
        : `<span class="kcal-badge ${diff > 0 ? "over" : ""}">約${meal.kcal}kcal/人</span>`;
      return `<div class="meal-card">
        <div class="meal-head">
          <h3>${mealNames ? mealNames[mi] : `${Math.floor(mi / 3) + 1}日目・${["朝", "昼", "夜"][mi % 3]}`}</h3>
          ${badge}
          <button class="btn sm gray" data-remix="${mi}">↺ 再提案</button>
        </div>
        ${meal.withRice ? `<div class="dish-row"><span class="chip cat-主食">主食</span> 白ご飯 <span class="d-kcal">約${RICE_KCAL_PER_SERVING}kcal</span></div>` : ""}
        ${meal.dishes.map((d) => {
          const r = recipes.find((x) => x.id === d.id);
          if (!r) return "";
          return `<div class="dish-row" data-open="${r.id}">
            <span class="chip cat-${esc(r.category)}">${esc(r.category)}</span>
            <span>${esc(r.title)}</span>
            <span class="d-kcal">約${d.kcal}kcal</span>
          </div>`;
        }).join("")}
      </div>`;
    }).join("")}`;

  box.querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", () => openDetail(el.dataset.open)));
  box.querySelectorAll("[data-remix]").forEach((el) =>
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const mi = parseInt(el.dataset.remix, 10);
      const used = new Set(plan.meals.flatMap((m, i) => (i === mi ? [] : m.dishes.map((d) => d.id))));
      plan.meals[mi] = buildMeal(plan.target, plan.prefs, recipesByRole(), used, plan.withRice);
      persistPlan(); renderPlan();
    })
  );
  const toShop = document.getElementById("plan-to-shop");
  if (toShop) toShop.addEventListener("click", planToShopping);
}

// ============================================================
// 買い物リスト
// ============================================================
function addIngredientsToShopping(ingredients, factor, fromLabel) {
  for (const ing of ingredients) {
    if (ing.group) continue;
    const name = P.normalizeIngName(ing.name);
    const qty = P.scaleQty(ing.qty || "", factor);
    // 同名・同単位ならマージ（数量を合算）
    const existing = shopping.find((s) => !s.done && s.name === name);
    if (existing) {
      const a = P.parseAmount(existing.qty), b = P.parseAmount(qty);
      if (!a.vague && !b.vague && a.unit === b.unit) {
        existing.qty = (a.unit === "大さじ" || a.unit === "小さじ")
          ? a.unit + P.fmtNum(a.value + b.value)
          : P.fmtNum(a.value + b.value) + (a.unit || "");
      } else if (qty && !existing.qty.split(" + ").includes(qty)) {
        existing.qty = [existing.qty, qty].filter(Boolean).join(" + ");
      }
      continue;
    }
    shopping.push({ id: uid(), name, qty, cat: P.shopCategory(name), done: false, from: fromLabel || "" });
  }
  persistShopping();
  renderShopping();
}

function addRecipeToShopping(r, servings) {
  const factor = (servings || r.servings || 1) / (r.servings || 1);
  addIngredientsToShopping(r.ingredients || [], factor, r.title);
}

function planToShopping() {
  if (!plan) return;
  let count = 0;
  for (const meal of plan.meals) {
    for (const d of meal.dishes) {
      const r = recipes.find((x) => x.id === d.id);
      if (!r) continue;
      addRecipeToShopping(r, plan.people);
      count++;
    }
  }
  toast(`献立${plan.meals.length}食分(${count}品)の材料を買い物リストに追加しました`);
  switchTab("shopping");
}

function renderShopping() {
  const box = document.getElementById("shop-list");
  const remaining = shopping.filter((s) => !s.done).length;
  document.getElementById("shop-count").textContent = shopping.length ? `残り${remaining}件 / 全${shopping.length}件` : "";

  if (!shopping.length) {
    box.innerHTML = `<div class="empty"><span class="big">🛒</span>買い物リストは空です。<br>レシピ詳細や献立から材料を追加できます。</div>`;
    return;
  }

  const cats = [...SHOP_CATEGORIES.map((c) => c.name), "その他"];
  box.innerHTML = cats.map((cat) => {
    const items = shopping.filter((s) => s.cat === cat);
    if (!items.length) return "";
    return `<div class="shop-cat">${esc(cat)}</div>` + items.map((s) => `
      <div class="shop-item ${s.done ? "done" : ""}">
        <input type="checkbox" ${s.done ? "checked" : ""} data-check="${s.id}">
        <span class="s-name">${esc(s.name)}</span>
        <span class="s-qty">${esc(s.qty || "")}</span>
        <button class="s-del" data-del="${s.id}" title="削除">✕</button>
      </div>`).join("");
  }).join("");

  box.querySelectorAll("[data-check]").forEach((el) =>
    el.addEventListener("change", () => {
      const s = shopping.find((x) => x.id === el.dataset.check);
      if (s) { s.done = el.checked; persistShopping(); renderShopping(); }
    })
  );
  box.querySelectorAll("[data-del]").forEach((el) =>
    el.addEventListener("click", () => {
      shopping = shopping.filter((x) => x.id !== el.dataset.del);
      persistShopping(); renderShopping();
    })
  );
}

document.getElementById("btn-shop-add").addEventListener("click", () => {
  const name = document.getElementById("shop-name").value.trim();
  if (!name) return;
  const qty = document.getElementById("shop-qty").value.trim();
  shopping.push({ id: uid(), name, qty, cat: P.shopCategory(name), done: false, from: "手入力" });
  persistShopping(); renderShopping();
  document.getElementById("shop-name").value = "";
  document.getElementById("shop-qty").value = "";
});
document.getElementById("shop-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btn-shop-add").click();
});

document.getElementById("btn-shop-clear-done").addEventListener("click", () => {
  shopping = shopping.filter((s) => !s.done);
  persistShopping(); renderShopping();
  toast("チェック済みを削除しました");
});

document.getElementById("btn-shop-clear").addEventListener("click", () => {
  if (!shopping.length) return;
  if (confirm("買い物リストを全て削除しますか？")) {
    shopping = [];
    persistShopping(); renderShopping();
  }
});

document.getElementById("btn-shop-copy").addEventListener("click", async () => {
  if (!shopping.length) return;
  const cats = [...SHOP_CATEGORIES.map((c) => c.name), "その他"];
  const lines = ["🛒 買い物メモ"];
  for (const cat of cats) {
    const items = shopping.filter((s) => s.cat === cat && !s.done);
    if (!items.length) continue;
    lines.push("", `■ ${cat}`);
    for (const s of items) lines.push(`・${s.name}${s.qty ? ` ${s.qty}` : ""}`);
  }
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    toast("買い物メモをコピーしました 📋");
  } catch {
    prompt("以下をコピーしてください", text);
  }
});

// ============================================================
// モーダル共通
// ============================================================
function closeModals() {
  document.querySelectorAll(".modal-back").forEach((m) => m.classList.remove("open"));
}
document.querySelectorAll(".modal-back").forEach((m) => {
  m.addEventListener("click", (e) => { if (e.target === m) closeModals(); });
});
document.querySelectorAll(".close-x").forEach((b) => b.addEventListener("click", closeModals));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModals(); });

// ---- 初期描画 ----
renderRecipes();
renderPlan();
renderShopping();
