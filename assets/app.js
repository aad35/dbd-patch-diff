// DbD パッチ速報: data/<lang>/ の JSON（scripts/build.mjs の出力）を読んで表示する。
// 画面は URL の # で切り替える（スマホの戻るボタンが効くように）。
//   #/                     パッチ一覧        #/?ptb=1  PTB も表示
//   #/patch/<id>?tab=…     パッチの変更点一覧（カテゴリ別タブ）
//   #/change/<id>/<n>      変更前・後の比較カード
//   #/chars?tab=…&q=…      キャラ別一覧・名前検索
//   #/entity/<名前>        キラー・パークの現在の仕様と調整履歴
// 言語は ?lang=ja|en（共有用）→ 前回選んだ言語 → ブラウザの言語 の順で決める。

const STR = {
  ja: {
    htmlLang: "ja",
    siteTitle: "DbD パッチ速報 | デッドバイデイライトの強化・弱体化まとめ",
    siteShort: "DbD パッチ速報",
    tagline: "アプデ差分をサッと確認",
    type: { buff: "強化", nerf: "弱体化", change: "変更", new: "追加" },
    patchTabs: { all: "すべて", killer: "キラー", perk: "パーク", survivor: "サバイバー", system: "システム全般", fix: "不具合修正" },
    charTabs: { killer: "キラー", "perk-killer": "キラーパーク", "perk-survivor": "サバイバーパーク", "perk-other": "その他パーク" },
    kind: { killer: "キラー", survivor: "サバイバー", perk: "パーク", "perk-killer": "キラーパーク", "perk-survivor": "サバイバーパーク", system: "システム" },
    navPatches: "パッチ", navChars: "キャラ別・検索",
    back: "戻る", loading: "読み込み中…", error: "エラー", backToList: "パッチ一覧に戻る",
    loadFailed: (p, s) => `${p} を読み込めませんでした（${s}）`,
    showPtb: "PTB（テストサーバー）も表示",
    fixes: "不具合修正",
    listNote: (d) => `データ元: Steam の Dead by Daylight 公式お知らせ（日本語版パッチノート）。強化・弱体化の判定はプログラムによる自動判定のため、正確でない場合があります。最終更新: ${d}`,
    fanSite: "当サイトは非公式のファンサイトです。", privacy: "プライバシーポリシー・免責事項", privacyHref: "privacy.html",
    patchTitle: (v, ptb) => `Ver ${v}${ptb ? "（PTB）" : ""}`,
    patchMissing: (id) => `Ver ${id} の日本語版パッチノートはありません（英語版のみ公開されています）`,
    noChangesInTab: "このカテゴリの変更はありません", noChanges: "変更点を読み取れませんでした",
    openOfficial: "公式パッチノート（Steam）を開く",
    compareTitle: "変更前・後 比較", notFoundChange: "この変更点は見つかりませんでした",
    before: "変更前", after: "変更後", newEffect: "新効果", sep: "：",
    summary: (after, before) => `${after}（変更前：${before}）`,
    fullText: "このパッチでの説明全文を見る",
    historyLink: (k) => `📈 「${k}」の調整履歴を見る`,
    section: "セクション", source: "出典", officialNotes: "公式パッチノート（Steam）", autoJudged: "強化／弱体化は自動判定です",
    charsTitle: "キャラ別・検索", charsSub: "キラー・パークの今の仕様と調整履歴",
    searchPlaceholder: "キャラ名・パーク名で検索",
    noMatch: (q) => `「${q}」に一致するキャラ・パークはありません`,
    latestDot: "最新パッチで調整あり",
    charsNote: (v) => `🔴 は最新パッチ（Ver ${v}）で調整があったもの。新しく調整された順に並んでいます。`,
    noAdjust: "調整なし",
    lastAdjusted: (v, d) => `最終調整 Ver ${v}（${d}）`,
    notFoundEntity: (n) => `「${n}」は見つかりませんでした`,
    entitySub: (k) => `${k} ・ 現在の仕様と調整履歴`,
    adjustCount: (n) => `調整 ${n}回`,
    currentEffect: (v) => `📍 現在の効果（Ver ${v} 時点）`,
    historyLabel: "調整履歴（新しい順）",
    noHistory: "記録がある期間（2023年〜）に調整はありません",
    historyNote: "本番パッチの記録のみ（PTB は含みません）。強化・弱体化は自動判定です。",
    newEffectPrefix: "【新効果】",
    count: (label, n) => `${label}（${n}）`,
    open: "（", close: "）",
    switchTo: "EN", switchLabel: "Switch to English",
  },
  en: {
    htmlLang: "en",
    siteTitle: "DbD Patch Tracker | Dead by Daylight buffs & nerfs at a glance",
    siteShort: "DbD Patch Tracker",
    tagline: "Patch changes at a glance",
    type: { buff: "Buff", nerf: "Nerf", change: "Change", new: "New" },
    patchTabs: { all: "All", killer: "Killers", perk: "Perks", survivor: "Survivors", system: "General", fix: "Bug fixes" },
    charTabs: { killer: "Killers", "perk-killer": "Killer perks", "perk-survivor": "Survivor perks", "perk-other": "Other perks" },
    kind: { killer: "Killer", survivor: "Survivor", perk: "Perk", "perk-killer": "Killer perk", "perk-survivor": "Survivor perk", system: "General" },
    navPatches: "Patches", navChars: "Characters & search",
    back: "Back", loading: "Loading…", error: "Error", backToList: "Back to patch list",
    loadFailed: (p, s) => `Could not load ${p} (${s})`,
    showPtb: "Show PTB (test server)",
    fixes: "Bug fixes",
    listNote: (d) => `Source: official Dead by Daylight announcements on Steam (English patch notes). Buffs and nerfs are labeled automatically by a program and may be inaccurate. Last updated: ${d}`,
    fanSite: "This is an unofficial fan site.", privacy: "Privacy policy & disclaimer", privacyHref: "privacy.html#en",
    patchTitle: (v, ptb) => `Ver ${v}${ptb ? " (PTB)" : ""}`,
    patchMissing: (id) => `There are no English patch notes for Ver ${id} (only the Japanese version was published).`,
    noChangesInTab: "No changes in this category", noChanges: "No changes could be read from this patch",
    openOfficial: "Open the official patch notes (Steam)",
    compareTitle: "Before / after", notFoundChange: "This change was not found",
    before: "Before", after: "After", newEffect: "New", sep: ": ",
    summary: (after, before) => `${after} (was ${before})`,
    fullText: "Show the full text from this patch",
    historyLink: (k) => `📈 See the change history of ${k}`,
    section: "Section", source: "Source", officialNotes: "official patch notes (Steam)", autoJudged: "buffs/nerfs are labeled automatically",
    charsTitle: "Characters & search", charsSub: "Current values and change history for killers and perks",
    searchPlaceholder: "Search killers and perks",
    noMatch: (q) => `No killers or perks match "${q}"`,
    latestDot: "Changed in the latest patch",
    charsNote: (v) => `🔴 = changed in the latest patch (Ver ${v}). Sorted by most recently changed.`,
    noAdjust: "No changes",
    lastAdjusted: (v, d) => `Last changed in Ver ${v} (${d})`,
    notFoundEntity: (n) => `"${n}" was not found`,
    entitySub: (k) => `${k} · Current values and change history`,
    adjustCount: (n) => `${n} change${n === 1 ? "" : "s"}`,
    currentEffect: (v) => `📍 Current effect (as of Ver ${v})`,
    historyLabel: "Change history (newest first)",
    noHistory: "No changes in the recorded period (2023 onward)",
    historyNote: "Live patches only (PTB not included). Buffs/nerfs are labeled automatically.",
    newEffectPrefix: "[New] ",
    count: (label, n) => `${label} (${n})`,
    open: " (", close: ")",
    switchTo: "日本語", switchLabel: "日本語に切り替える",
  },
};
const TYPE_ICON = { buff: "▲", nerf: "▼", change: "●", new: "＋" };
const PATCH_TAB_KEYS = ["all", "killer", "perk", "survivor", "system", "fix"];
const CHAR_TABS = [
  { key: "killer", match: (e) => e.cat === "killer" },
  { key: "perk-killer", match: (e) => e.cat === "perk" && e.role === "killer" },
  { key: "perk-survivor", match: (e) => e.cat === "perk" && e.role === "survivor" },
  { key: "perk-other", match: (e) => e.cat === "perk" && !e.role },
];
const FRESH_DAYS = 7;
const LANG_KEY = "dbd-lang";

const $main = document.getElementById("main");
const $hdr = document.getElementById("hdr");

// ---- 言語 ----
function initialLang() {
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (fromUrl === "ja" || fromUrl === "en") return fromUrl;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "ja" || saved === "en") return saved;
  } catch {}
  return /^ja\b/i.test(navigator.language ?? "") ? "ja" : "en";
}
let lang = initialLang();
let T = STR[lang];

function applyLangToShell() {
  document.documentElement.lang = T.htmlLang;
  document.querySelector('[data-nav="patches"] .label').textContent = T.navPatches;
  document.querySelector('[data-nav="chars"] .label').textContent = T.navChars;
}

// ---- utils ----
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
const tag = (type, extra = "") => `<span class="tag ${type}">${TYPE_ICON[type]} ${T.type[type]}${extra}</span>`;

// 検索用の正規化: ひらがな→カタカナ、全角英数→半角、大文字→小文字、記号・空白を無視。
// 漢字の名前（呪術など）は読みのデータが無いので、ひらがなでは引けない
export function normalize(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・：:「」『』“”"'’！!？?]/g, "");
}

const cache = new Map();
function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => {
      if (!r.ok) throw new Error(T.loadFailed(path, r.status));
      return r.json();
    }).catch((e) => { cache.delete(path); throw e; }));
  }
  return cache.get(path);
}
const loadIndex = () => load(`data/${lang}/index.json`);
const loadPatch = (id) => load(`data/${lang}/patches/${enc(id)}.json`);
const loadEntities = () => load(`data/${lang}/entities.json`);
const loadKillerPairs = () => load("data/dict/killers.json");
const loadImages = () => load("assets/img/index.json").catch(() => ({ killers: {}, perks: {} }));

const latestRelease = (index) => index.patches.find((p) => p.kind === "release");
const isFresh = (date) => (Date.now() - new Date(date).getTime()) / 86400000 <= FRESH_DAYS;

function kindLabel(e) {
  if (e.cat === "perk") return T.kind[e.role ? `perk-${e.role}` : "perk"];
  return T.kind[e.cat] ?? T.kind.system;
}
function iconClass(e) {
  if (e.cat === "perk") return e.role ? `perk-${e.role}` : "perk";
  return e.cat;
}

// 画像があれば画像、無ければ頭文字のタイル。画像のファイル名は日本語名なので、英語表示では日本語名（jaName）で探す
function iconHtml(name, e, images, jaName = name) {
  const pool = e.cat === "killer" ? images.killers : e.cat === "perk" ? images.perks : {};
  const src = pool[jaName] ?? pool[name];
  const shown = String(name).replace(/^(呪術|恵み|悶絶のフック|チームワーク|Hex|Boon|Scourge Hook|Teamwork)[：:]\s*/i, "").replace(/^The /, "");
  const fallback = e.cat === "system" ? "⚙️" : esc([...shown][0] ?? "?");
  return `<span class="icon ${iconClass(e)}">${fallback}${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>`;
}
// 英語名 → 画像を探すための日本語名（キラーは辞書、パークは entities の alt）
async function jaNameResolver() {
  if (lang === "ja") return (n) => n;
  const [pairs, entities] = await Promise.all([loadKillerPairs(), loadEntities()]);
  const killers = new Map(pairs.map((p) => [p.en, p.ja]));
  return (n) => killers.get(n) ?? entities[n]?.alt ?? n;
}

// 変更点の1行要約（一覧用）
function summarize(change) {
  const d = change.diffs.find((x) => x.before && x.after) ?? change.diffs[0];
  if (!d) return "";
  if (d.before && d.after) return T.summary(d.after, d.before);
  return d.text;
}

// キラーの変更は、辞書で特定できたキラー名でまとめて履歴を見られる
const entityKeyOf = (c) => (c.cat === "killer" ? c.character : c.cat === "perk" ? c.entity : null);

// ---- header / nav ----
function header({ title, sub = T.tagline, back = null }) {
  $hdr.innerHTML = `${back ? `<a class="back" href="${esc(back)}" aria-label="${esc(T.back)}">‹</a>` : `<span class="logo">DbD</span>`}
    <div class="titles"><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div></div>
    <button class="lang-switch" type="button" id="lang-switch" aria-label="${esc(T.switchLabel)}">${esc(T.switchTo)}</button>`;
  document.getElementById("lang-switch").addEventListener("click", switchLang);
  document.title = back ? `${title} | ${T.siteShort}` : T.siteTitle;
}
function setNav(key) {
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === key));
}

// ---- 画面: パッチ一覧 ----
async function viewPatches(q) {
  setNav("patches");
  header({ title: T.siteShort });
  const index = await loadIndex();
  const showPtb = q.get("ptb") === "1";
  const patches = index.patches.filter((p) => showPtb || p.kind === "release");
  const latest = latestRelease(index);
  $main.innerHTML = `
    <div class="toolbar"><a class="chip ${showPtb ? "on" : ""}" href="#/${showPtb ? "" : "?ptb=1"}">${esc(T.showPtb)}</a></div>
    ${patches.map((p) => {
      const c = p.counts;
      return `<a class="card patch" href="#/patch/${enc(p.id)}">
        <div class="row">
          <div class="ver">Ver ${esc(p.version)}
            ${p.kind === "ptb" ? '<span class="tag ptb">PTB</span>' : ""}
            ${p === latest && isFresh(p.date) ? '<span class="tag fresh">NEW</span>' : ""}</div>
          <div class="date">${esc(p.date)}</div>
        </div>
        <div class="title">${esc(p.title)}</div>
        <div class="tags">
          ${c.buff ? tag("buff", ` ${c.buff}`) : ""}
          ${c.nerf ? tag("nerf", ` ${c.nerf}`) : ""}
          ${c.change ? tag("change", ` ${c.change}`) : ""}
          ${c.new ? tag("new", ` ${c.new}`) : ""}
          ${c.fix ? `<span class="tag muted">${esc(T.fixes)} ${c.fix}</span>` : ""}
        </div>
      </a>`;
    }).join("")}
    <p class="src">${esc(T.listNote(index.updatedAt.slice(0, 10)))}<br>
      ${esc(T.fanSite)}<a href="${T.privacyHref}">${esc(T.privacy)}</a></p>`;
}

// ---- 画面: パッチ詳細（カテゴリ別タブ） ----
async function viewPatch(id, q) {
  setNav("patches");
  // パッチは言語によって無いことがある（片方の言語でしか公開されなかったパッチノートなど）
  if (!(await loadIndex()).patches.some((x) => x.id === id)) throw new Error(T.patchMissing(id));
  const p = await loadPatch(id);
  header({ title: T.patchTitle(p.version, p.kind === "ptb"), sub: `${p.date} · ${p.title}`, back: "#/" });
  const tab = q.get("tab") ?? "all";
  const fixCount = p.fixes.reduce((n, g) => n + g.items.length, 0);
  const count = (key) => (key === "all" ? p.changes.length : key === "fix" ? fixCount : p.changes.filter((c) => c.cat === key).length);
  const tabs = PATCH_TAB_KEYS.filter((k) => k === "all" || count(k) > 0)
    .map((k) => `<a class="${tab === k ? "on" : ""}" href="#/patch/${enc(id)}?tab=${k}">${esc(T.patchTabs[k])}<span class="n">${count(k)}</span></a>`).join("");

  let body;
  if (tab === "fix") {
    body = p.fixes.map((g) => `<div class="fix-group"><h3>${esc(g.group)}</h3><ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("");
  } else {
    const [images, jaName] = await Promise.all([loadImages(), jaNameResolver()]);
    const list = p.changes.map((c, i) => [c, i]).filter(([c]) => tab === "all" || c.cat === tab);
    body = list.length ? list.map(([c, i]) => {
      const key = entityKeyOf(c);
      const sub = c.cat === "killer" && c.character && c.character !== c.entity ? `${c.character} · ` : "";
      return `<a class="item ${c.type}" href="#/change/${enc(id)}/${i}">
        ${iconHtml(key ?? c.entity, c, images, jaName(key ?? c.entity))}
        <div class="body">
          <div class="name">${esc(c.entity)} ${tag(c.type)}</div>
          <div class="summary">${esc(sub + summarize(c))}</div>
        </div>
        <span class="chev">›</span></a>`;
    }).join("") : `<div class="empty">${esc(T.noChangesInTab)}</div>`;
  }
  $main.innerHTML = `<div class="tabs" role="tablist">${tabs}</div>${body || `<div class="empty">${esc(T.noChanges)}</div>`}
    <p class="src"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(T.openOfficial)}</a></p>`;
}

// ---- 画面: 変更前・後の比較カード ----
async function viewChange(id, n) {
  setNav("patches");
  const p = await loadPatch(id);
  const c = p.changes[n];
  if (!c) throw new Error(T.notFoundChange);
  header({ title: T.compareTitle, sub: `Ver ${p.version} · ${p.date}`, back: `#/patch/${enc(id)}?tab=${c.cat}` });
  const [images, jaName] = await Promise.all([loadImages(), jaNameResolver()]);
  const key = entityKeyOf(c);

  const diffs = c.diffs.map((d) => {
    if (d.before || d.after) {
      return `<div class="diff">
        <div class="label">${esc(d.text)}</div>
        ${d.before ? `<div class="line"><span class="mark">❌</span><span class="before">${esc(T.before + T.sep + d.before)}</span></div>` : ""}
        <div class="line"><span class="mark">⭕</span><span class="after">${esc((d.isNew ? T.newEffect : T.after) + T.sep + (d.after ?? d.text))}</span>${tag(d.type)}</div>
      </div>`;
    }
    if (d.isNew && c.type !== "new") {
      return `<div class="diff"><div class="line"><span class="mark">⭕</span><span class="after">${esc(T.newEffect + T.sep + d.text)}</span>${tag("buff")}</div></div>`;
    }
    return `<div class="diff"><div class="label">${esc(d.text)}</div></div>`;
  }).join("");

  // 変更のあった行以外も含めた説明全文（変更前・後の行と同じなら出さない）
  const showFull = c.lines.length > c.diffs.length;
  $main.innerHTML = `
    <div class="hero">
      ${iconHtml(key ?? c.entity, c, images, jaName(key ?? c.entity))}
      <div><h2>${esc(c.entity)}</h2>
        <div class="meta">${esc(c.character && c.character !== c.entity ? `${c.character} · ` : "")}${esc(kindLabel(c))} ${tag(c.type)}</div></div>
    </div>
    ${diffs}
    ${c.devNote ? `<div class="note">💬 ${esc(c.devNote)}</div>` : ""}
    ${showFull ? `<details class="full"><summary>${esc(T.fullText)}</summary><ul>${c.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></details>` : ""}
    ${key ? `<a class="button" href="#/entity/${enc(key)}">${esc(T.historyLink(key))}</a>` : ""}
    <p class="src">${esc(T.section)}: ${esc(c.section)}<br>${esc(T.source)}: <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(T.officialNotes)}</a> · ${esc(T.autoJudged)}</p>`;
}

// ---- 画面: キャラ別・検索 ----
async function allEntities() {
  const [entities, pairs] = await Promise.all([loadEntities(), loadKillerPairs()]);
  const list = Object.entries(entities).map(([name, e]) => ({ name, ...e }));
  // 辞書にあるが調整履歴が無いキラーも一覧に出す
  for (const p of pairs) {
    const k = p[lang];
    if (!entities[k]) list.push({ name: k, cat: "killer", alt: p[lang === "ja" ? "en" : "ja"], history: [], current: [] });
  }
  const lastDate = (e) => e.history[0]?.date ?? "";
  return list.sort((a, b) => lastDate(b).localeCompare(lastDate(a)) || a.name.localeCompare(b.name, lang));
}

function charRow(e, images, latestId) {
  const last = e.history[0];
  const jaName = lang === "ja" ? e.name : e.alt ?? e.name;
  const dot = last && last.id === latestId ? `<span class="dot" title="${esc(T.latestDot)}"></span>` : "";
  if (e.cat === "killer") {
    return `<a class="tile" href="#/entity/${enc(e.name)}">${dot}
      ${iconHtml(e.name, e, images, jaName)}
      <div class="nm">${esc(e.name)}</div>
      ${last ? tag(last.type) : `<span class="tag muted">${esc(T.noAdjust)}</span>`}</a>`;
  }
  return `<a class="item ${last?.type ?? ""}" href="#/entity/${enc(e.name)}">
    ${iconHtml(e.name, e, images, jaName)}
    <div class="body"><div class="name">${esc(e.name)} ${last ? tag(last.type) : ""}</div>
      <div class="summary">${esc(kindLabel(e))} · ${esc(last ? T.lastAdjusted(last.version, last.date) : T.noAdjust)}</div></div>
    ${dot}<span class="chev">›</span></a>`;
}

function charGroup(tabKey, list, images, latestId) {
  if (!list.length) return "";
  return tabKey === "killer"
    ? `<div class="grid">${list.map((e) => charRow(e, images, latestId)).join("")}</div>`
    : list.map((e) => charRow(e, images, latestId)).join("");
}

async function viewChars(q) {
  setNav("chars");
  header({ title: T.charsTitle, sub: T.charsSub });
  const [all, images, index] = await Promise.all([allEntities(), loadImages(), loadIndex()]);
  const latestId = latestRelease(index)?.id;
  const tab = CHAR_TABS.some((t) => t.key === q.get("tab")) ? q.get("tab") : "killer";

  $main.innerHTML = `
    <div class="search"><input id="q" type="search" placeholder="${esc(T.searchPlaceholder)}" autocomplete="off" enterkeyhint="search" value="${esc(q.get("q") ?? "")}"></div>
    <div id="char-body"></div>`;
  const $q = document.getElementById("q");

  const renderBody = () => {
    const query = normalize($q.value);
    const hits = query ? all.filter((e) => normalize(e.name).includes(query)) : all;
    const groups = CHAR_TABS.map((t) => ({ ...t, label: T.charTabs[t.key], list: hits.filter(t.match) }))
      .filter((g) => g.list.length || (!query && g.key !== "perk-other"));
    let html;
    if (query) {
      // 検索中はカテゴリをまたいで全部出す
      html = groups.length
        ? groups.map((g) => `<div class="section-label">${esc(T.count(g.label, g.list.length))}</div>${charGroup(g.key, g.list, images, latestId)}`).join("")
        : `<div class="empty">${esc(T.noMatch($q.value))}</div>`;
    } else {
      const g = groups.find((x) => x.key === tab) ?? groups[0];
      html = `<div class="tabs">${groups.map((x) => `<a class="${x.key === g.key ? "on" : ""}" href="#/chars?tab=${x.key}">${esc(x.label)}<span class="n">${x.list.length}</span></a>`).join("")}</div>
        ${charGroup(g.key, g.list, images, latestId)}
        <p class="src">${esc(T.charsNote(latestRelease(index)?.version ?? ""))}</p>`;
    }
    document.getElementById("char-body").innerHTML = html;
  };

  $q.addEventListener("input", () => {
    // 入力のたびに画面を作り直すとキーボードが閉じるので、URL だけ書き換えて一覧部分を描き直す
    const params = new URLSearchParams({ tab });
    if ($q.value) params.set("q", $q.value);
    history.replaceState(null, "", `${location.pathname}${location.search}#/chars?${params}`);
    renderBody();
  });
  renderBody();
}

// ---- 画面: キラー・パークの現在の仕様と調整履歴 ----
async function viewEntity(name) {
  setNav("chars");
  const all = await allEntities();
  const e = all.find((x) => x.name === name);
  if (!e) throw new Error(T.notFoundEntity(name));
  const tabKey = CHAR_TABS.find((t) => t.match(e))?.key ?? "killer";
  header({ title: name, sub: T.entitySub(kindLabel(e)), back: `#/chars?tab=${tabKey}` });
  const images = await loadImages();
  const last = e.history[0];

  const diffLine = (d) => d.before && d.after
    ? `<li>${esc(d.text)} <span class="ba">${T.open}${esc(d.before)} → <b>${esc(d.after)}</b>${T.close}</span></li>`
    : `<li>${d.isNew ? esc(T.newEffectPrefix) : ""}${esc(d.text)}</li>`;

  $main.innerHTML = `
    <div class="hero">
      ${iconHtml(name, e, images, lang === "ja" ? name : e.alt ?? name)}
      <div><h2>${esc(name)}</h2>
        <div class="meta">${esc(kindLabel(e))} · ${esc(T.adjustCount(e.history.length))} ${last ? tag(last.type) : ""}</div></div>
    </div>
    ${e.cat === "perk" && e.current?.length ? `
      <div class="current"><h3>${esc(T.currentEffect(last.version))}</h3>
        <ul>${e.current.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>` : ""}
    <div class="section-label">${esc(T.historyLabel)}</div>
    ${e.history.length ? `<div class="timeline">${e.history.map((h) => `
      <div class="tl ${h.type}">
        <div class="top"><a href="#/patch/${enc(h.id)}">Ver ${esc(h.version)}</a> · ${esc(h.date)} ${tag(h.type)}</div>
        ${h.part ? `<div class="part">${esc(h.part)}</div>` : ""}
        <ul>${h.diffs.map(diffLine).join("")}</ul>
      </div>`).join("")}</div>` : `<div class="empty">${esc(T.noHistory)}</div>`}
    <p class="src">${esc(T.historyNote)}</p>`;
}

// ---- 言語の切り替え ----
// 同じ内容のページに留まれるよう、表示中の画面を切り替え先の言語のものに置き換える
async function switchLang() {
  const to = lang === "ja" ? "en" : "ja";
  const { view, args, q } = parseHash();
  let next = "#/";
  try {
    if (view === "entity" && args[0]) {
      const e = (await allEntities()).find((x) => x.name === args[0]);
      next = e?.alt ? `#/entity/${enc(e.alt)}` : `#/chars?tab=${CHAR_TABS.find((t) => e && t.match(e))?.key ?? "killer"}`;
    } else if (view === "chars") {
      next = `#/chars?tab=${q.get("tab") ?? "killer"}`;
    } else if ((view === "patch" || view === "change") && args[0]) {
      // 変更点の並びは言語で違うので、比較カードからはパッチの一覧に戻す
      next = `#/patch/${enc(args[0])}`;
    } else if (q.get("ptb") === "1") {
      next = "#/?ptb=1";
    }
  } catch {}
  lang = to;
  T = STR[lang];
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  const params = new URLSearchParams(location.search);
  params.set("lang", lang);
  history.replaceState(null, "", `${location.pathname}?${params}${next}`);
  applyLangToShell();
  // パッチは言語によって無いことがある（英語版だけにある修正パッチなど）
  if (next.startsWith("#/patch/")) {
    const exists = (await loadIndex().catch(() => null))?.patches.some((p) => `#/patch/${enc(p.id)}` === next);
    if (!exists) history.replaceState(null, "", `${location.pathname}?${params}#/`);
  }
  route();
}

// ---- router ----
function parseHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = hash.split("?");
  const [view, ...args] = path.split("/").map((s) => decodeURIComponent(s));
  return { view, args, q: new URLSearchParams(query) };
}

async function route() {
  const { view, args, q } = parseHash();
  $main.innerHTML = `<div class="loading">${esc(T.loading)}</div>`;
  try {
    if (view === "patch" && args[0]) await viewPatch(args[0], q);
    else if (view === "change" && args[0]) await viewChange(args[0], Number(args[1]));
    else if (view === "chars") await viewChars(q);
    else if (view === "entity" && args[0]) await viewEntity(args[0]);
    else await viewPatches(q);
  } catch (err) {
    console.error(err);
    header({ title: T.error, back: "#/" });
    $main.innerHTML = `<div class="error">${esc(err.message)}<br><a href="#/">${esc(T.backToList)}</a></div>`;
  }
  $main.scrollTop = 0;
}

applyLangToShell();
window.addEventListener("hashchange", route);
route();
