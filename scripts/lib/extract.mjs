// パッチノートの段落列から「キャラ・パークごとの変更点」を取り出し、強化・弱体化を判定する（パターンA）。
// 言語ごとに違うのは言葉のルール（RULES）だけで、処理の流れは共通。
import { B_CLOSE, B_OPEN, strip, toBlocks } from "./bbcode.mjs";

const VALUE_JA = String.raw`\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*\s*(?:%|％|m\/秒|メートル|秒|個|本減少|本|台|回|倍)?`;
const VALUE_EN = String.raw`\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*\s*(?:%|m\/s|meters?|m\b|seconds?|s\b|tokens?|times)?`;

const RULES = {
  ja: {
    skipSection: /既知の問題|PTBからの変更点|PTB）?からの調整点/,
    // 太字の見出しだが、キャラ名ではなく「生存者パーク」のようなまとまりの名前（小見出しとして扱う）
    groupHeader: /^(?:殺人鬼|生存者|キラー|サバイバー)?パーク$|^(?:殺人鬼|生存者)$/,
    fixSection: /問題の修正|不具合の修正|バグ修正/,
    killerPerk: /殺人鬼パーク|キラーパーク/,
    survivorPerk: /生存者パーク|サバイバーパーク/,
    perk: /パーク/,
    killer: /殺人鬼|キラー/,
    survivor: /生存者|サバイバー/,
    featureH2: /新機能|機能追加/,
    // 新キャラ・新パークの紹介セクション（調整ではなく追加）
    newSection: /^新(?:しい)?(?:殺人鬼|生存者|キラー|サバイバー|パーク|マップ|リフト)|^殺人鬼の能力|^(?:新|新しい).*パーク/,
    notNewSection: /変更|調整|アップデート|修正/,
    devNote: /^(開発チームより|開発者より|Dev Note)/,
    fixLine: /修正しました[。．]?$/,
    // 見出しの無いセクションで「「千里眼」：…」のように1行ずつ名前が付いている書式
    namedLine: /^[\u0001\u0002]*「([^」]{1,30})」[\u0001\u0002]*\s*[：:]\s*/,
    // （変更前：X） / 古い書式の（以前はX） / （新効果） / （削除）
    mark: /[（(]\s*(?:(?:変更前|以前は|以前)\s*[：:]?\s*([^）)]*)|(新効果|新機能|新規|追加)|(削除))\s*[）)]/g,
    // 古い書式の「6%→10%に変更しました」「16メートルから14メートルに」。名前の変更（「A」→「B」）は拾わないよう数字で始まるものだけ
    arrow: new RegExp(`(${VALUE_JA})\\s*(?:→|から)\\s*(${VALUE_JA})(?=\\s*[にへ→]|\\s*$)`, "g"),
    // 「〜に減少しました」のような “変えた” という意味の動詞（効果量の動詞と区別する）
    changeVerb: /に(?:減少|増加|短縮|延長|上昇|低下|変更)(?:しました|させました|されました)/g,
    boldUnit: String.raw`(?:%|％|秒|個|台|回|倍|メートル|m(?![a-z]))?`,
    // 数値が小さいほど持ち主に有利な項目（「クールダウンは30秒」のように値そのものがコストのとき）
    lowerIsBetter: /クールダウン|疲労|必要|かかる|待機|遅延|ペナルティ|消費|チャージ時間|溜め時間|再使用/,
    // 「25%短くなる」「10%増加する」のように数値が効果量を表すときは、大きいほど有利
    magnitudeVerb: /短く|短縮|減少|低下|増加|延長|長く|上昇|速く|遅く|拡大|縮小/,
    decreaseAfterNumber: /^\s*(?:%|％)?\s*(?:低下|減少)/,
    decreaseWord: /低下|減少/,
    increaseWord: /上昇|増加/,
    trimStart: /^[。、．，\s]+/,
    trimEnd: /[。．\s]+$/,
    otherGroup: "その他",
  },
  en: {
    skipSection: /Known Issues|PTB to Live|Changes from (the )?PTB|Public Test Build \(PTB\) Adjustments|PTB Adjustments|Release Schedule|^Important$/i,
    groupHeader: /^(?:Killer|Survivor)?\s*Perks?$|^Killers?$|^Survivors?$/i,
    fixSection: /Bug ?Fix|^Fixes$/i,
    killerPerk: /Killer Perk/i,
    survivorPerk: /Survivor Perk/i,
    perk: /Perk/i,
    killer: /Killer|^The [A-Z]/,
    survivor: /Survivor/i,
    featureH2: /^(Gameplay )?Features?$/i,
    newSection: /^New (Killer|Survivor|Perk|Map|Content|Chapter)|^Killer Power/i,
    notNewSection: /Update|Change|Tweak|Fix/i,
    devNote: /^(Dev(eloper)? Note|Design Note)/i,
    fixLine: /^Fixed (an |a |the )?(issue|bug)/i,
    namedLine: /^[\u0001\u0002]*[“"]([^”"]{1,40})[”"][\u0001\u0002]*\s*:\s*/,
    // (was X) / (previously X) / (NEW) / (Removed)
    mark: /\(\s*(?:(?:was|previously)\s*:?\s+([^)]*)|(NEW|New Effect|Added)|(Removed))\s*\)/gi,
    // "Increased … from 6% to 10%" / "6% → 10%"
    arrow: new RegExp(`(?:from\\s+)?(${VALUE_EN})\\s*(?:→|->|\\bto\\b)\\s*(${VALUE_EN})`, "gi"),
    changeVerb: /^(?:Increased|Decreased|Reduced|Lowered|Raised|Changed|Adjusted|Extended|Shortened)\b/gi,
    boldUnit: String.raw`(?:%|\s?seconds?\b|\s?meters?\b|m\/s\b|m\b|s\b)?`,
    lowerIsBetter: /cooldown|fatigue|exhaust|required|it takes|delay|penalty|consum|charge time|recharge/i,
    magnitudeVerb: /faster|slower|shorter|longer|increase|decrease|reduc|larger|smaller|boost|bonus|more|less/i,
    decreaseAfterNumber: /^\s*%?\s*(?:slower|reduction|less|decrease)/i,
    decreaseWord: /slower|reduc|decreas|less/i,
    increaseWord: /faster|increas|more|bonus/i,
    trimStart: /^[.,;\s]+/,
    trimEnd: /[.\s]+$/,
    otherGroup: "Other",
  },
};

const NUM = /\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*/g;

// ---- セクション分類 ----

function sectionMode(title, R) {
  if (R.skipSection.test(title)) return "skip";
  if (R.fixSection.test(title)) return "fix";
  return "content";
}

export function classifySection(title, lang = "ja") {
  const R = RULES[lang];
  if (R.killerPerk.test(title)) return { cat: "perk", role: "killer" };
  if (R.survivorPerk.test(title)) return { cat: "perk", role: "survivor" };
  if (R.perk.test(title)) return { cat: "perk", role: null };
  if (R.killer.test(title)) return { cat: "killer", role: null };
  if (R.survivor.test(title)) return { cat: "survivor", role: null };
  return { cat: "system", role: null };
}

// 段落がまるごと太字の短い文 = キャラ名・パーク名などの見出し
function entityName(block) {
  const m = block.text.match(/^\u0001([^\u0001\u0002]+)\u0002\s*[：:]?$/);
  if (!m) return null;
  const name = m[1].trim().replace(/\s*\\$/, "").replace(/\s*[:：]$/, "").replace(/^[“"「『](.+)[”"」』]$/, "$1");
  if (!name || name.length > 40 || /[。．]|\.\s/.test(name)) return null;
  return name;
}

// ---- 1行の差分解析 ----

export function numbers(s, signed = false, R = RULES.ja) {
  return [...(s ?? "").matchAll(NUM)].map((m) => {
    const tiers = m[0].split("/").map(Number);
    const avg = tiers.reduce((a, b) => a + b, 0) / tiers.length;
    return signed && R.decreaseAfterNumber.test(s.slice(m.index + m[0].length)) ? -avg : avg;
  });
}

// 変更前と変更後の数値を後ろから並べて比べる（変更前の方が言葉を省略していることが多いため）
export function direction(before, after, lang = "ja", context = "") {
  const R = RULES[lang];
  // 「40%低下 → 9%上昇」のように向きが逆になったときだけ、低下・減少を負の数として比べる
  // （英語版は "faster" が太字の外にあるので、文全体 context も見る）
  const flip = R.decreaseWord.test(before) && (R.increaseWord.test(after ?? "") || (R.increaseWord.test(context) && !R.decreaseWord.test(context)));
  const b = numbers(before, flip, R), a = numbers(after, false, R);
  const n = Math.min(a.length, b.length);
  if (n === 0) return null;
  const signs = new Set();
  for (let i = 1; i <= n; i++) signs.add(Math.sign(a[a.length - i] - b[b.length - i]));
  signs.delete(0);
  if (signs.size !== 1) return null;
  return signs.has(1) ? "up" : "down";
}

const cleanText = (s, R) => strip(s).replace(R.trimStart, "").replace(R.trimEnd, "").trim();

function judge(before, after, text, lang) {
  const R = RULES[lang];
  const dir = direction(before, after, lang, text);
  if (!dir) return "change";
  const up = dir === "up";
  const effectText = text.replace(R.changeVerb, "");
  const lowerIsBetter = R.lowerIsBetter.test(effectText) && !R.magnitudeVerb.test(effectText);
  return lowerIsBetter ? (up ? "nerf" : "buff") : (up ? "buff" : "nerf");
}

/** 1段落から差分（変更前マーカーごと）を取り出す。変更のない段落は [] */
export function diffsFromLine(text, lang = "ja") {
  const R = RULES[lang];
  // 太字の直後に続く「/18%」「 seconds」も値の一部として拾う（英語版は [b]14/16[/b]/18% のような書き方がある）
  const bold = new RegExp(`${B_OPEN}([^${B_CLOSE}]*)${B_CLOSE}((?:\\/[\\d.]+)*${R.boldUnit})`, "g");
  const mark = new RegExp(R.mark.source, R.mark.flags);
  const diffs = [];
  let start = 0, m;
  while ((m = mark.exec(text))) {
    const seg = text.slice(start, m.index);
    start = mark.lastIndex;
    const bolds = [...seg.matchAll(bold)].map((b) => (b[1] + (b[2] ?? "")).trim()).filter((b) => /[\p{L}\p{N}]/u.test(b));
    const after = bolds.length ? bolds.join(" / ") : null;
    const before = m[1] != null ? m[1].trim() : null;
    const isNew = Boolean(m[2]);
    const removed = Boolean(m[3]);
    const segText = cleanText(seg, R);

    let type = "change";
    if (isNew) type = "buff";
    else if (removed) type = "nerf";
    else if (before != null) type = judge(before, after ?? segText, segText, lang);
    diffs.push({ text: segText, after, before, isNew, ...(removed ? { removed } : {}), type });
  }
  if (diffs.length) return diffs;

  // 古い書式: 「6%→10%に変更しました」 / "from 6% to 10%"
  const lineText = cleanText(text, R);
  for (const a of strip(text).matchAll(new RegExp(R.arrow.source, R.arrow.flags))) {
    const before = a[1].trim(), after = a[2].trim();
    diffs.push({ text: lineText, after, before, isNew: false, type: judge(before, after, lineText, lang) });
  }
  return diffs;
}

export function overallType(diffs) {
  const dirs = new Set(diffs.map((d) => d.type).filter((t) => t === "buff" || t === "nerf"));
  return dirs.size === 1 ? [...dirs][0] : "change";
}

// ---- パッチ全体 ----

export function extractPatch(body, lang = "ja") {
  const R = RULES[lang];
  const blocks = toBlocks(body);
  const changes = [];
  const fixes = [];
  let h2 = "", h3 = null, mode = "content", entity = null, fixGroup = null;

  const section = () => h3 ?? h2;
  // 「新機能」の下はキャラ調整ではなくシステムの話
  const classify = () => (R.featureH2.test(h2) ? { cat: "system", role: null } : classifySection(section(), lang));
  const startEntity = (name, depth, implicit = false) => {
    const isNew = R.newSection.test(section()) && !R.notNewSection.test(section());
    entity = { entity: name, ...classify(), section: section(), depth, implicit, isNew, rawLines: [], devNote: null };
    changes.push(entity);
  };
  const namedLine = (text) => {
    const m = text.match(R.namedLine);
    if (m) return { name: m[1], rest: text.slice(m[0].length) };
    // 「[b]Babysitter:[/b] Increased …」のように、行頭の太字＋コロンが名前になっている書式
    const b = text.match(/^\u0001([^\u0001\u0002]{1,50})\u0002\s*([:：])?\s*/);
    if (!b || !(b[2] || /[:：]\s*$/.test(b[1]))) return null;
    const rest = text.slice(b[0].length);
    return rest.trim() ? { name: b[1].trim().replace(/\s*[:：]$/, ""), rest } : null;
  };
  const addFix = (text) => {
    const group = fixGroup ?? section() ?? R.otherGroup;
    let g = fixes.find((f) => f.group === group);
    if (!g) fixes.push((g = { group, items: [] }));
    g.items.push(text);
  };

  for (const b of blocks) {
    if (b.type !== "p") {
      const title = strip(b.text);
      if (b.type === "h1" || b.type === "h2") { h2 = title; h3 = null; mode = sectionMode(title, R); }
      else { h3 = title; const sub = sectionMode(title, R); mode = sub === "content" ? sectionMode(h2, R) : sub; }
      entity = null;
      fixGroup = null;
      continue;
    }
    if (mode === "skip") continue;

    const name = entityName(b);
    if (mode === "fix") {
      if (name) fixGroup = name;
      else addFix(strip(b.text));
      continue;
    }
    if (name && R.groupHeader.test(name)) { h3 = name; entity = null; continue; }
    if (name) { startEntity(name, b.depth); continue; }
    if (b.italic || R.devNote.test(strip(b.text))) {
      if (entity) entity.devNote = [entity.devNote, strip(b.text)].filter(Boolean).join("\n");
      continue;
    }
    // 「問題の修正」見出しが無いパッチでも、修正報告の文は不具合修正に回す
    if (R.fixLine.test(strip(b.text)) && !diffsFromLine(b.text, lang).length) {
      fixGroup = entity?.entity ?? fixGroup;
      addFix(strip(b.text));
      continue;
    }
    if (!entity || entity.implicit) {
      const named = namedLine(b.text);
      if (named) {
        const sec = section();
        entity = changes.find((c) => c.implicit && c.entity === named.name && c.section === sec) ?? null;
        if (!entity) startEntity(named.name, b.depth, true);
        entity.rawLines.push(named.rest);
        continue;
      }
    }
    if (!entity) {
      if (!section()) continue; // 見出し前の前置き文
      startEntity(section(), -1, true);
    }
    entity.rawLines.push(b.text);
  }

  const result = changes
    .filter((c) => c.rawLines.length)
    .map(({ depth, implicit, isNew, rawLines, ...c }) => {
      let diffs = isNew ? [] : rawLines.flatMap((t) => diffsFromLine(t, lang));
      // 「〜を調整しました」のように変更前の値が書かれていないもの・新キャラの紹介は、文そのものを変更点として扱う
      if (!diffs.length) diffs = rawLines.map((t) => ({ text: cleanText(t, R), after: null, before: null, isNew, type: isNew ? "new" : "change" }));
      const out = { entity: c.entity, cat: c.cat };
      if (c.role) out.role = c.role;
      Object.assign(out, { section: c.section, type: isNew ? "new" : overallType(diffs), diffs, lines: rawLines.map((t) => cleanText(t, R)) });
      if (c.devNote) out.devNote = c.devNote;
      return out;
    });
  return { changes: result, fixes };
}
