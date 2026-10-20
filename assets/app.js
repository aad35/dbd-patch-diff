// DbD パッチ速報: data/ の JSON（scripts/build.mjs の出力）を読んで表示する。
// 画面は URL の # で切り替える（スマホの戻るボタンが効くように）。
//   #/                     パッチ一覧        #/?ptb=1  PTB も表示
//   #/patch/<id>?tab=…     パッチの変更点一覧（カテゴリ別タブ）
//   #/change/<id>/<n>      変更前・後の比較カード
//   #/chars?tab=…&q=…      キャラ別一覧・名前検索
//   #/entity/<名前>        キラー・パークの現在の仕様と調整履歴

const TYPE = {
  buff: { label: "強化", icon: "▲" },
  nerf: { label: "弱体化", icon: "▼" },
  change: { label: "変更", icon: "●" },
  new: { label: "追加", icon: "＋" },
};
const PATCH_TABS = [
  { key: "all", label: "すべて" },
  { key: "killer", label: "キラー" },
  { key: "perk", label: "パーク" },
  { key: "survivor", label: "サバイバー" },
  { key: "system", label: "システム全般" },
  { key: "fix", label: "不具合修正" },
];
const CHAR_TABS = [
  { key: "killer", label: "キラー", match: (e) => e.cat === "killer" },
  { key: "perk-killer", label: "キラーパーク", match: (e) => e.cat === "perk" && e.role === "killer" },
  { key: "perk-survivor", label: "サバイバーパーク", match: (e) => e.cat === "perk" && e.role === "survivor" },
  { key: "perk-other", label: "その他パーク", match: (e) => e.cat === "perk" && !e.role },
];
const FRESH_DAYS = 7;

const $main = document.getElementById("main");
const $hdr = document.getElementById("hdr");

// ---- utils ----
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
const tag = (type, extra = "") => `<span class="tag ${type}">${TYPE[type].icon} ${TYPE[type].label}${extra}</span>`;

// 検索用の正規化: ひらがな→カタカナ、全角英数→半角、記号・空白を無視。
// 漢字の名前（呪術など）は読みのデータが無いので、ひらがなでは引けない
export function normalize(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・：:「」『』“”"'！!？?]/g, "");
}

const cache = new Map();
function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${path} を読み込めませんでした（${r.status}）`);
      return r.json();
    }).catch((e) => { cache.delete(path); throw e; }));
  }
  return cache.get(path);
}
const loadIndex = () => load("data/index.json");
const loadPatch = (id) => load(`data/patches/${enc(id)}.json`);
const loadEntities = () => load("data/entities.json");
const loadKillerDict = () => load("data/dict/killers.json");
const loadImages = () => load("assets/img/index.json").catch(() => ({ killers: {}, perks: {} }));

const latestRelease = (index) => index.patches.find((p) => p.kind === "release");
const isFresh = (date) => (Date.now() - new Date(date).getTime()) / 86400000 <= FRESH_DAYS;

function kindLabel(e) {
  if (e.cat === "killer") return "キラー";
  if (e.cat === "survivor") return "サバイバー";
  if (e.cat === "perk") return e.role === "killer" ? "キラーパーク" : e.role === "survivor" ? "サバイバーパーク" : "パーク";
  return "システム";
}
function iconClass(e) {
  if (e.cat === "perk") return e.role ? `perk-${e.role}` : "perk";
  return e.cat;
}

// 画像があれば画像、無ければ頭文字のタイル
function iconHtml(name, e, images) {
  const src = e.cat === "killer" ? images.killers[name] : e.cat === "perk" ? images.perks[name] : null;
  const fallback = e.cat === "system" ? "⚙️" : esc([...String(name).replace(/^(呪術|恵み|悶絶のフック|チームワーク)[：:]/, "")][0] ?? "?");
  return `<span class="icon ${iconClass(e)}">${fallback}${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>`;
}

// 変更点の1行要約（一覧用）
function summarize(change) {
  const d = change.diffs.find((x) => x.before && x.after) ?? change.diffs[0];
  if (!d) return "";
  if (d.before && d.after) return `${d.after}（変更前：${d.before}）`;
  return d.text;
}

// キラーの変更は、辞書で特定できたキラー名でまとめて履歴を見られる
const entityKeyOf = (c) => (c.cat === "killer" ? c.character : c.cat === "perk" ? c.entity : null);

// ---- header / nav ----
function header({ title, sub = "アプデ差分をサッと確認", back = null }) {
  $hdr.innerHTML = `${back ? `<a class="back" href="${esc(back)}" aria-label="戻る">‹</a>` : `<span class="logo">DbD</span>`}
    <div class="titles"><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div></div>`;
  document.title = back ? `${title} | DbD パッチ速報` : "DbD パッチ速報 | デッドバイデイライトの強化・弱体化まとめ";
}
function setNav(key) {
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === key));
}

// ---- 画面: パッチ一覧 ----
async function viewPatches(q) {
  setNav("patches");
  header({ title: "パッチ速報" });
  const index = await loadIndex();
  const showPtb = q.get("ptb") === "1";
  const patches = index.patches.filter((p) => showPtb || p.kind === "release");
  const latest = latestRelease(index);
  $main.innerHTML = `
    <div class="toolbar"><a class="chip ${showPtb ? "on" : ""}" href="#/${showPtb ? "" : "?ptb=1"}">PTB（テストサーバー）も表示</a></div>
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
          ${c.fix ? `<span class="tag muted">不具合修正 ${c.fix}</span>` : ""}
        </div>
      </a>`;
    }).join("")}
    <p class="src">データ元: Steam の Dead by Daylight 公式お知らせ（日本語版パッチノート）。強化・弱体化の判定はプログラムによる自動判定のため、正確でない場合があります。最終更新: ${esc(index.updatedAt.slice(0, 10))}<br>
      当サイトは非公式のファンサイトです。<a href="privacy.html">プライバシーポリシー・免責事項</a></p>`;
}

// ---- 画面: パッチ詳細（カテゴリ別タブ） ----
async function viewPatch(id, q) {
  setNav("patches");
  const p = await loadPatch(id);
  header({ title: `Ver ${p.version}${p.kind === "ptb" ? "（PTB）" : ""}`, sub: `${p.date} ・ ${p.title}`, back: "#/" });
  const tab = q.get("tab") ?? "all";
  const fixCount = p.fixes.reduce((n, g) => n + g.items.length, 0);
  const count = (key) => (key === "all" ? p.changes.length : key === "fix" ? fixCount : p.changes.filter((c) => c.cat === key).length);
  const tabs = PATCH_TABS.filter((t) => t.key === "all" || count(t.key) > 0)
    .map((t) => `<a class="${tab === t.key ? "on" : ""}" href="#/patch/${enc(id)}?tab=${t.key}">${t.label}<span class="n">${count(t.key)}</span></a>`).join("");

  let body;
  if (tab === "fix") {
    body = p.fixes.map((g) => `<div class="fix-group"><h3>${esc(g.group)}</h3><ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("");
  } else {
    const images = await loadImages();
    const list = p.changes.map((c, i) => [c, i]).filter(([c]) => tab === "all" || c.cat === tab);
    body = list.length ? list.map(([c, i]) => {
      const key = entityKeyOf(c);
      const sub = c.cat === "killer" && c.character && c.character !== c.entity ? `${c.character}・` : "";
      return `<a class="item ${c.type}" href="#/change/${enc(id)}/${i}">
        ${iconHtml(key ?? c.entity, c, images)}
        <div class="body">
          <div class="name">${esc(c.entity)} ${tag(c.type)}</div>
          <div class="summary">${esc(sub + summarize(c))}</div>
        </div>
        <span class="chev">›</span></a>`;
    }).join("") : `<div class="empty">このカテゴリの変更はありません</div>`;
  }
  $main.innerHTML = `<div class="tabs" role="tablist">${tabs}</div>${body || '<div class="empty">変更点を読み取れませんでした</div>'}
    <p class="src"><a href="${esc(p.url)}" target="_blank" rel="noopener">公式パッチノート（Steam）を開く</a></p>`;
}

// ---- 画面: 変更前・後の比較カード ----
async function viewChange(id, n) {
  setNav("patches");
  const p = await loadPatch(id);
  const c = p.changes[n];
  if (!c) throw new Error("この変更点は見つかりませんでした");
  header({ title: "変更前・後 比較", sub: `Ver ${p.version} ・ ${p.date}`, back: `#/patch/${enc(id)}?tab=${c.cat}` });
  const images = await loadImages();
  const key = entityKeyOf(c);

  const diffs = c.diffs.map((d) => {
    if (d.before || d.after) {
      return `<div class="diff">
        <div class="label">${esc(d.text)}</div>
        ${d.before ? `<div class="line"><span class="mark">❌</span><span class="before">変更前：${esc(d.before)}</span></div>` : ""}
        <div class="line"><span class="mark">⭕</span><span class="after">${d.isNew ? "新効果：" : "変更後："}${esc(d.after ?? d.text)}</span>${tag(d.type)}</div>
      </div>`;
    }
    if (d.isNew && c.type !== "new") {
      return `<div class="diff"><div class="line"><span class="mark">⭕</span><span class="after">新効果：${esc(d.text)}</span>${tag("buff")}</div></div>`;
    }
    return `<div class="diff"><div class="label">${esc(d.text)}</div></div>`;
  }).join("");

  // 変更のあった行以外も含めた説明全文（変更前・後の行と同じなら出さない）
  const showFull = c.lines.length > c.diffs.length;
  $main.innerHTML = `
    <div class="hero">
      ${iconHtml(key ?? c.entity, c, images)}
      <div><h2>${esc(c.entity)}</h2>
        <div class="meta">${esc(c.character && c.character !== c.entity ? `${c.character} ・ ` : "")}${esc(kindLabel(c))} ${tag(c.type)}</div></div>
    </div>
    ${diffs}
    ${c.devNote ? `<div class="note">💬 ${esc(c.devNote)}</div>` : ""}
    ${showFull ? `<details class="full"><summary>このパッチでの説明全文を見る</summary><ul>${c.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></details>` : ""}
    ${key ? `<a class="button" href="#/entity/${enc(key)}">📈 「${esc(key)}」の調整履歴を見る</a>` : ""}
    <p class="src">セクション: ${esc(c.section)}<br>出典: <a href="${esc(p.url)}" target="_blank" rel="noopener">公式パッチノート（Steam）</a> ・ 強化／弱体化は自動判定です</p>`;
}

// ---- 画面: キャラ別・検索 ----
async function allEntities() {
  const [entities, killers] = await Promise.all([loadEntities(), loadKillerDict()]);
  const list = Object.entries(entities).map(([name, e]) => ({ name, ...e }));
  // 辞書にあるが調整履歴が無いキラーも一覧に出す
  for (const k of killers) if (!entities[k]) list.push({ name: k, cat: "killer", history: [], current: [] });
  const lastDate = (e) => e.history[0]?.date ?? "";
  return list.sort((a, b) => lastDate(b).localeCompare(lastDate(a)) || a.name.localeCompare(b.name, "ja"));
}

function charRow(e, images, latestId) {
  const last = e.history[0];
  const dot = last && last.id === latestId ? '<span class="dot" title="最新パッチで調整あり"></span>' : "";
  if (e.cat === "killer") {
    return `<a class="tile" href="#/entity/${enc(e.name)}">${dot}
      ${iconHtml(e.name, e, images)}
      <div class="nm">${esc(e.name)}</div>
      ${last ? tag(last.type) : '<span class="tag muted">調整なし</span>'}</a>`;
  }
  return `<a class="item ${last?.type ?? ""}" href="#/entity/${enc(e.name)}">
    ${iconHtml(e.name, e, images)}
    <div class="body"><div class="name">${esc(e.name)} ${last ? tag(last.type) : ""}</div>
      <div class="summary">${esc(kindLabel(e))} ・ ${last ? `最終調整 Ver ${esc(last.version)}（${esc(last.date)}）` : "調整なし"}</div></div>
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
  header({ title: "キャラ別・検索", sub: "キラー・パークの今の仕様と調整履歴" });
  const [all, images, index] = await Promise.all([allEntities(), loadImages(), loadIndex()]);
  const latestId = latestRelease(index)?.id;
  const tab = CHAR_TABS.some((t) => t.key === q.get("tab")) ? q.get("tab") : "killer";

  $main.innerHTML = `
    <div class="search"><input id="q" type="search" placeholder="キャラ名・パーク名で検索" autocomplete="off" enterkeyhint="search" value="${esc(q.get("q") ?? "")}"></div>
    <div id="char-body"></div>`;
  const $q = document.getElementById("q");

  const renderBody = () => {
    const query = normalize($q.value);
    const hits = query ? all.filter((e) => normalize(e.name).includes(query)) : all;
    const groups = CHAR_TABS.map((t) => ({ ...t, list: hits.filter(t.match) })).filter((g) => g.list.length || (!query && g.key !== "perk-other"));
    let html;
    if (query) {
      // 検索中はカテゴリをまたいで全部出す
      html = groups.length
        ? groups.map((g) => `<div class="section-label">${g.label}（${g.list.length}）</div>${charGroup(g.key, g.list, images, latestId)}`).join("")
        : `<div class="empty">「${esc($q.value)}」に一致するキャラ・パークはありません</div>`;
    } else {
      const g = groups.find((x) => x.key === tab) ?? groups[0];
      html = `<div class="tabs">${groups.map((x) => `<a class="${x.key === g.key ? "on" : ""}" href="#/chars?tab=${x.key}">${x.label}<span class="n">${x.list.length}</span></a>`).join("")}</div>
        ${charGroup(g.key, g.list, images, latestId)}
        <p class="src">🔴 は最新パッチ（Ver ${esc(latestRelease(index)?.version ?? "")}）で調整があったもの。新しく調整された順に並んでいます。</p>`;
    }
    document.getElementById("char-body").innerHTML = html;
  };

  $q.addEventListener("input", () => {
    // 入力のたびに画面を作り直すとキーボードが閉じるので、URL だけ書き換えて一覧部分を描き直す
    const params = new URLSearchParams({ tab });
    if ($q.value) params.set("q", $q.value);
    history.replaceState(null, "", `#/chars?${params}`);
    renderBody();
  });
  renderBody();
}

// ---- 画面: キラー・パークの現在の仕様と調整履歴 ----
async function viewEntity(name) {
  setNav("chars");
  const all = await allEntities();
  const e = all.find((x) => x.name === name);
  if (!e) throw new Error(`「${name}」は見つかりませんでした`);
  const tabKey = CHAR_TABS.find((t) => t.match(e))?.key ?? "killer";
  header({ title: name, sub: `${kindLabel(e)} ・ 現在の仕様と調整履歴`, back: `#/chars?tab=${tabKey}` });
  const images = await loadImages();
  const last = e.history[0];

  const diffLine = (d) => d.before && d.after
    ? `<li>${esc(d.text)} <span class="ba">（${esc(d.before)} → <b>${esc(d.after)}</b>）</span></li>`
    : `<li>${d.isNew ? "【新効果】" : ""}${esc(d.text)}</li>`;

  $main.innerHTML = `
    <div class="hero">
      ${iconHtml(name, e, images)}
      <div><h2>${esc(name)}</h2>
        <div class="meta">${esc(kindLabel(e))} ・ 調整 ${e.history.length}回 ${last ? tag(last.type) : ""}</div></div>
    </div>
    ${e.cat === "perk" && e.current?.length ? `
      <div class="current"><h3>📍 現在の効果（Ver ${esc(last.version)} 時点）</h3>
        <ul>${e.current.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>` : ""}
    <div class="section-label">調整履歴（新しい順）</div>
    ${e.history.length ? `<div class="timeline">${e.history.map((h) => `
      <div class="tl ${h.type}">
        <div class="top"><a href="#/patch/${enc(h.id)}">Ver ${esc(h.version)}</a> ・ ${esc(h.date)} ${tag(h.type)}</div>
        ${h.part ? `<div class="part">${esc(h.part)}</div>` : ""}
        <ul>${h.diffs.map(diffLine).join("")}</ul>
      </div>`).join("")}</div>` : `<div class="empty">記録がある期間（2023年〜）に調整はありません</div>`}
    <p class="src">本番パッチの記録のみ（PTB は含みません）。強化・弱体化は自動判定です。</p>`;
}

// ---- router ----
async function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = hash.split("?");
  const [view, ...args] = path.split("/").map((s) => decodeURIComponent(s));
  const q = new URLSearchParams(query);
  $main.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    if (view === "patch" && args[0]) await viewPatch(args[0], q);
    else if (view === "change" && args[0]) await viewChange(args[0], Number(args[1]));
    else if (view === "chars") await viewChars(q);
    else if (view === "entity" && args[0]) await viewEntity(args[0]);
    else await viewPatches(q);
  } catch (err) {
    console.error(err);
    header({ title: "エラー", back: "#/" });
    $main.innerHTML = `<div class="error">${esc(err.message)}<br><a href="#/">パッチ一覧に戻る</a></div>`;
  }
  $main.scrollTop = 0;
}

window.addEventListener("hashchange", route);
route();
