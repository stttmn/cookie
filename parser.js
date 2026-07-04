// ============================================================
// parser.js — レシピ文字起こしエンジン
// SNS投稿文・ウェブページのテキストから材料/手順を構造化する
// ============================================================

const RecipeParser = (() => {

  // 全角数字→半角、記号ゆらぎの正規化
  function normalize(text) {
    return String(text || "")
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/％/g, "%")
      .replace(/／/g, "/")
      .replace(/．/g, ".")
      .replace(/\r\n?/g, "\n")
      .replace(/[〜～]/g, "~")
      .replace(/½/g, "1/2").replace(/⅓/g, "1/3").replace(/¼/g, "1/4").replace(/¾/g, "3/4");
  }

  // ---- URL からプラットフォーム判定 ----
  function detectPlatform(url) {
    try {
      const h = new URL(url).hostname.replace(/^www\./, "");
      if (/youtube\.com$|youtu\.be$/.test(h)) return "youtube";
      if (/instagram\.com$/.test(h)) return "instagram";
      if (/tiktok\.com$/.test(h)) return "tiktok";
      if (/twitter\.com$|x\.com$/.test(h)) return "x";
      return "web";
    } catch { return null; }
  }

  const PLATFORM_LABEL = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", x: "X (Twitter)", web: "ウェブサイト" };

  // ---- 分量の単位 ----
  const UNITS = "(?:kg|g|mg|ml|mL|cc|L|ℓ|カップ|合|個|本|枚|玉|束|房|片|丁|缶|袋|パック|尾|匹|切れ|切|かけ|株|節|杯|膳|柵|人分|人前|箱|串|台|皿|cm|センチ|かたまり|つまみ|摘み|振り|滴)";
  const NUM = "[0-9]+(?:[./][0-9]+)?(?:\\s*(?:と|・)\\s*[0-9]+/[0-9]+)?(?:\\s*~\\s*[0-9]+(?:[./][0-9]+)?)?";
  // 行末の分量表現
  const QTY_RE = new RegExp(
    "((?:大さじ|大匙|小さじ|小匙|おおさじ|こさじ)\\s*" + NUM +
    "|" + NUM + "\\s*" + UNITS + "(?:\\s*(?:分|くらい|ほど|程度|強|弱))?" +
    "|" + NUM +
    "|適量|適宜|少々|少量|ひとつまみ|一つまみ|ひとかけ|お好みで|お好み(?:の量)?|各適量|たっぷり|少し)" +
    "\\s*$"
  );

  const BULLET_RE = /^[\s・･•◦▪●○◎☆★✅✔️✔☑︎☑√※‣▶▷◆◇■□－\-–—*＊+＋>＞]+/;
  const ING_HEADER_RE = /^[\s【〈《〔[(（'"'"▼▽◆■●○☆★=＝\-〜~]*(材料|ざいりょう|用意する\s*もの|使う\s*もの|Ingredients?)/i;
  const STEP_HEADER_RE = /^[\s【〈《〔[(（'"'"▼▽◆■●○☆★=＝\-〜~]*(作り方|つくり方|作りかた|手順|工程|調理方法|調理手順|レシピ|下準備|Steps?|Instructions?|Directions?|How to make|Method)/i;
  const GROUP_RE = /^[【〈《〔[(（<＜]\s*(.+?)\s*[】〉》〕\])）>＞]\s*$/;

  function stripBullet(line) { return line.replace(BULLET_RE, "").trim(); }

  // 1行を材料としてパース → { name, qty } / null
  function parseIngredientLine(rawLine) {
    let line = stripBullet(rawLine).trim();
    if (!line) return null;
    // 「玉ねぎ…1個」「醤油：大さじ2」「豆腐 ─ 1丁」などの区切りを空白に
    line = line.replace(/[…‥⋯]+|[:：]|[─―ー…]{2,}|\t/g, " ").replace(/\s{2,}/g, " ").trim();
    const m = line.match(QTY_RE);
    if (m) {
      const name = line.slice(0, m.index).replace(/[、,．.\s]+$/, "").trim();
      const qty = m[1].replace(/\s+/g, "");
      if (name) return { name, qty };
      return null; // 分量だけの行
    }
    // 分量なし（「塩こしょう」など）
    if (line.length <= 20) return { name: line, qty: "" };
    return null;
  }

  // 手順行の先頭番号を除去
  function stripStepNumber(line) {
    return line
      .replace(/^[\s]*(?:STEP|Step|step)?\s*[0-9]+\s*[.)、．:：]\s*/, "")
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s*/, "")
      .replace(/^[\s]*[0-9]+\s+/, "")
      .trim();
  }

  const HASHTAG_RE = /#[^\s#　]+/g;

  // ---- メイン: フリーテキスト → レシピ構造 ----
  function parseText(text, opts = {}) {
    const norm = normalize(text);
    const lines = norm.split("\n").map((l) => l.trim());

    const recipe = {
      title: opts.title || "",
      servings: 0,
      ingredients: [],
      steps: [],
      tags: [],
      notes: "",
    };

    // ハッシュタグ収集（タグ化して本文からは除外扱い）
    const tagSet = new Set();
    for (const m of norm.matchAll(HASHTAG_RE)) {
      const t = m[0].slice(1);
      if (t.length <= 12 && !/レシピ|料理|簡単|cooking|recipe|ご飯|グルメ|おうち/i.test(t)) tagSet.add(t);
    }
    recipe.tags = [...tagSet].slice(0, 6);

    // 人数
    const sv = norm.match(/[（(]?\s*([0-9]+)\s*~?\s*[0-9]*\s*(人分|人前|servings?)/i);
    if (sv) recipe.servings = parseInt(sv[1], 10);

    // セクション検出をしながら走査
    let mode = "none"; // none | ing | step
    let sawIngHeader = false, sawStepHeader = false;
    const preLines = []; // 材料ヘッダー前の行（タイトル候補）

    for (let raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const noTags = line.replace(HASHTAG_RE, "").trim();

      if (ING_HEADER_RE.test(line) && line.length < 30) { mode = "ing"; sawIngHeader = true; continue; }
      if (STEP_HEADER_RE.test(line) && line.length < 30) { mode = "step"; sawStepHeader = true; continue; }
      if (!noTags) continue;

      if (mode === "ing") {
        // グループ見出し 【肉だね】 など
        const g = stripBullet(noTags).match(GROUP_RE);
        if (g && g[1].length <= 12) { recipe.ingredients.push({ name: g[1], qty: "", group: true }); continue; }
        const ing = parseIngredientLine(noTags);
        if (ing) recipe.ingredients.push(ing);
        else if (noTags.length > 25) { mode = "step-maybe"; } // 材料っぽくない長文が来たら材料終了
      } else if (mode === "step" || mode === "step-maybe") {
        const s = stripStepNumber(noTags);
        if (s && !/^(いいね|フォロー|チャンネル登録|Follow|Like|保存)/i.test(s)) recipe.steps.push(s);
      } else {
        preLines.push(noTags);
      }
    }

    // ヘッダーが無い投稿: 行ごとに材料/手順を推定
    if (!sawIngHeader && recipe.ingredients.length === 0) {
      for (const line of preLines.slice(recipe.title ? 0 : 1)) {
        const stripped = stripBullet(line);
        if (QTY_RE.test(stripped.replace(/[…‥⋯]+|[:：]/g, " ").trim()) && stripped.length <= 30) {
          const ing = parseIngredientLine(line);
          if (ing) recipe.ingredients.push(ing);
        } else if (/^[0-9①-⑮]/.test(stripped) || stripped.length > 25) {
          if (!sawStepHeader) {
            const s = stripStepNumber(stripped);
            if (s && s.length > 8) recipe.steps.push(s);
          }
        }
      }
    }

    // タイトル: 指定 > 最初の行
    if (!recipe.title) {
      const cand = preLines.find((l) => l.length >= 2 && l.length <= 60 && !QTY_RE.test(l) && !/^https?:/.test(l));
      recipe.title = (cand || "無題のレシピ").replace(/[【】\[\]「」]/g, "").trim();
    }
    if (!recipe.servings) recipe.servings = 2;

    return recipe;
  }

  // ---- HTML → JSON-LD (schema.org/Recipe) ----
  function parseJsonLd(html) {
    const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of scripts) {
      let data;
      try { data = JSON.parse(m[1].trim()); } catch { continue; }
      const nodes = [];
      const collect = (d) => {
        if (!d) return;
        if (Array.isArray(d)) d.forEach(collect);
        else if (typeof d === "object") {
          nodes.push(d);
          if (d["@graph"]) collect(d["@graph"]);
        }
      };
      collect(data);
      const r = nodes.find((n) => {
        const t = n["@type"];
        return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
      });
      if (!r) continue;

      const steps = [];
      const walkInst = (inst) => {
        if (!inst) return;
        if (typeof inst === "string") { const s = inst.trim(); if (s) steps.push(s); }
        else if (Array.isArray(inst)) inst.forEach(walkInst);
        else if (typeof inst === "object") {
          if (inst["@type"] === "HowToSection") walkInst(inst.itemListElement);
          else if (inst.text) steps.push(String(inst.text).trim());
          else if (inst.name) steps.push(String(inst.name).trim());
        }
      };
      walkInst(r.recipeInstructions);

      let servings = 0;
      const y = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
      if (y) { const ym = String(y).match(/[0-9０-９]+/); if (ym) servings = parseInt(normalize(ym[0]), 10); }

      let image = "";
      const img = r.image;
      if (typeof img === "string") image = img;
      else if (Array.isArray(img)) image = typeof img[0] === "string" ? img[0] : (img[0] && img[0].url) || "";
      else if (img && img.url) image = img.url;

      const ingredients = (r.recipeIngredient || r.ingredients || [])
        .map((s) => parseIngredientLine(normalize(String(s))))
        .filter(Boolean);

      let tags = [];
      if (r.keywords) {
        tags = (Array.isArray(r.keywords) ? r.keywords : String(r.keywords).split(/[,、]/))
          .map((t) => String(t).trim()).filter((t) => t && t.length <= 12).slice(0, 6);
      }

      return {
        title: decodeEntities(String(r.name || "")),
        servings: servings || 2,
        ingredients,
        steps: steps.map((s) => decodeEntities(stripHtml(s))),
        tags,
        image,
        notes: decodeEntities(stripHtml(String(r.description || ""))).slice(0, 200),
      };
    }
    return null;
  }

  function stripHtml(s) { return s.replace(/<[^>]*>/g, ""); }

  function decodeEntities(s) {
    const el = document.createElement("textarea");
    el.innerHTML = s;
    return el.value;
  }

  // ---- HTML → プレーンテキスト（JSON-LDが無いページ用）----
  function htmlToText(html) {
    let h = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td)[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, "");
    return decodeEntities(h).replace(/\n{3,}/g, "\n\n");
  }

  function htmlTitle(html) {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return "";
    return decodeEntities(m[1]).split(/[|｜«»\-–—]/)[0].trim();
  }

  // ============================================================
  // 分量の数値パース・スケーリング
  // ============================================================
  const AMT_RE = new RegExp("^(大さじ|大匙|小さじ|小匙|おおさじ|こさじ)?\\s*(" + NUM + ")\\s*(" + UNITS + ")?");

  function parseFraction(s) {
    s = s.trim();
    // "1と1/2" / "1・1/2"
    const mixed = s.match(/^([0-9]+)\s*(?:と|・)\s*([0-9]+)\/([0-9]+)$/);
    if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
    // 範囲 "1~2" → 平均
    const range = s.match(/^([0-9.\/]+)\s*~\s*([0-9.\/]+)$/);
    if (range) return (parseFraction(range[1]) + parseFraction(range[2])) / 2;
    const frac = s.match(/^([0-9]+)\/([0-9]+)$/);
    if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  // "大さじ2" "200g" "1/2個" → { value, unit, vague }
  function parseAmount(qty) {
    const q = normalize(qty).replace(/\s+/g, "");
    if (!q) return { value: null, unit: "", vague: true };
    if (/適量|適宜|少々|少量|ひとつまみ|一つまみ|お好み|たっぷり|少し|各適量/.test(q)) return { value: null, unit: q, vague: true };
    const m = q.match(AMT_RE);
    if (!m) return { value: null, unit: q, vague: true };
    const value = parseFraction(m[2]);
    if (value == null) return { value: null, unit: q, vague: true };
    let unit = "";
    if (m[1]) unit = /大/.test(m[1]) || /おお/.test(m[1]) ? "大さじ" : "小さじ";
    else if (m[3]) unit = m[3];
    return { value, unit, vague: false };
  }

  function fmtNum(n) {
    if (n == null) return "";
    const rounded = Math.round(n * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 0.01) return String(Math.round(rounded));
    // よく使う分数で表示
    const fr = [[0.25, "1/4"], [0.33, "1/3"], [0.5, "1/2"], [0.67, "2/3"], [0.75, "3/4"]];
    const int = Math.floor(rounded), dec = rounded - int;
    for (const [v, s] of fr) if (Math.abs(dec - v) < 0.05) return int ? `${int}と${s}` : s;
    return String(Math.round(rounded * 10) / 10);
  }

  // 分量文字列を factor 倍する（できなければそのまま返す）
  function scaleQty(qty, factor) {
    if (!qty || factor === 1) return qty;
    const a = parseAmount(qty);
    if (a.vague || a.value == null) return qty;
    const v = a.value * factor;
    if (a.unit === "大さじ" || a.unit === "小さじ") return a.unit + fmtNum(v);
    return fmtNum(v) + (a.unit || "");
  }

  // ============================================================
  // カロリー推定
  // ============================================================
  function findCalEntry(name) {
    let best = null, bestLen = 0;
    for (const e of CAL_DB) {
      for (const key of e.k) {
        if (name.includes(key) && key.length > bestLen) { best = e; bestLen = key.length; }
      }
    }
    return best;
  }

  // 材料1つの推定グラム数
  function toGrams(entry, amount) {
    const { value, unit } = amount;
    if (value == null) return null;
    if (unit === "g") return value;
    if (unit === "kg") return value * 1000;
    if (unit === "mg") return value / 1000;
    if (/^(ml|mL|cc)$/.test(unit)) return value;         // 密度≒1で近似
    if (unit === "L" || unit === "ℓ") return value * 1000;
    if (unit === "大さじ") return value * (entry.tbsp || 15);
    if (unit === "小さじ") return value * ((entry.tbsp || 15) / 3);
    if (unit === "カップ") return value * ((entry.units && entry.units["カップ"]) || 200);
    if (entry.units && entry.units[unit] != null) return value * entry.units[unit];
    if (!unit) {
      // 単位なしの数値: 個数系のデフォルト重量があれば使う
      const def = entry.units && (entry.units["個"] || entry.units["本"] || entry.units["枚"] || entry.units["玉"]);
      if (def) return value * def;
    }
    return null;
  }

  // レシピ全体の推定カロリー { total, perServing, coverage }
  function estimateCalories(recipe) {
    let total = 0, matched = 0, countable = 0;
    for (const ing of recipe.ingredients || []) {
      if (ing.group) continue;
      const entry = findCalEntry(ing.name);
      if (entry && entry.per100 === 0) { matched++; countable++; continue; }
      const amount = parseAmount(ing.qty || "");
      if (amount.vague) continue; // 適量・少々はカウント対象外
      countable++;
      if (!entry) continue;
      const g = toGrams(entry, amount);
      if (g == null) continue;
      total += (g * entry.per100) / 100;
      matched++;
    }
    const servings = Math.max(1, recipe.servings || 1);
    return {
      total: Math.round(total),
      perServing: Math.round(total / servings),
      coverage: countable ? matched / countable : 0,
    };
  }

  // ============================================================
  // 役割・ジャンル・買い物カテゴリの推定
  // ============================================================
  function guessRole(recipe) {
    const t = recipe.title || "";
    for (const { role, k } of ROLE_KEYWORDS) if (k.some((w) => t.includes(w))) return role;
    const ingText = (recipe.ingredients || []).map((i) => i.name).join(" ");
    if (/パスタ|スパゲ|ご飯|ごはん|米|うどん|中華麺|そば|食パン/.test(ingText)) return "主食";
    if (/肉|鶏|豚|牛|ひき|鮭|さば|ぶり|たら|えび|いか|魚|ハンバーグ/.test(t + ingText.slice(0, 40))) return "主菜";
    return "副菜";
  }

  function guessGenre(recipe) {
    const t = (recipe.title || "") + " " + (recipe.tags || []).join(" ");
    for (const { genre, k } of GENRE_KEYWORDS) if (k.some((w) => t.includes(w))) return genre;
    return "その他";
  }

  // マッチ判定の優先順位（「牛乳」が「牛」→肉、「鶏ガラ」が「鶏」→肉 と
  // 誤判定されないよう、固有性の高いカテゴリから先に判定する）
  const SHOP_MATCH_ORDER = ["卵・乳製品", "豆腐・大豆", "主食・麺・粉", "野菜・きのこ", "魚介", "調味料・その他", "肉"];
  function shopCategory(name) {
    for (const catName of SHOP_MATCH_ORDER) {
      const c = SHOP_CATEGORIES.find((x) => x.name === catName);
      if (c && c.k.some((w) => name.includes(w))) return c.name;
    }
    return "その他";
  }

  // 集計用に材料名を正規化（切り方などの注記を除去）
  function normalizeIngName(name) {
    return name
      .replace(/[（(][^）)]*[）)]/g, "")
      .replace(/(みじん切り|薄切り|細切り|乱切り|小口切り|すりおろし|千切り|ざく切り|くし切り)/g, "")
      .replace(/[・･\s]+$/g, "")
      .trim() || name;
  }

  return {
    normalize, detectPlatform, PLATFORM_LABEL,
    parseText, parseJsonLd, htmlToText, htmlTitle,
    parseAmount, scaleQty, fmtNum,
    estimateCalories, guessRole, guessGenre, shopCategory, normalizeIngName,
    parseIngredientLine,
  };
})();
