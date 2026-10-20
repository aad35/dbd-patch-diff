// パッチノートの段落列から「キャラ・パークごとの変更点」を取り出し、強化・弱体化を判定する（パターンA）。
import { B_CLOSE, B_OPEN, strip, toBlocks } from "./bbcode.mjs";

// ---- セクション分類 ----

function sectionMode(title) {
  if (/既知の問題|PTBからの変更点/.test(title)) return "skip";
  if (/問題の修正|不具合の修正|バグ修正/.test(title)) return "fix";
  return "content";
}

export function classifySection(title) {
  if (/殺人鬼パーク|キラーパーク/.test(title)) return { cat: "perk", role: "killer" };
  if (/生存者パーク|サバイバーパーク/.test(title)) return { cat: "perk", role: "survivor" };
  if (/パーク/.test(title)) return { cat: "perk", role: null };
  if (/殺人鬼|キラー/.test(title)) return { cat: "killer", role: null };
  if (/生存者|サバイバー/.test(title)) return { cat: "survivor", role: null };
  return { cat: "system", role: null };
}

// 新キャラ・新パークの紹介セクション（調整ではなく追加）
const NEW_SECTION = /^新(?:しい)?(?:殺人鬼|生存者|キラー|サバイバー|パーク|マップ|リフト)|^殺人鬼の能力|^(?:新|新しい).*パーク/;

// 段落がまるごと太字の短い文 = キャラ名・パーク名などの見出し
function entityName(block) {
  const m = block.text.match(/^\u0001([^\u0001\u0002]+)\u0002\s*[：:]?$/);
  if (!m) return null;
  const name = m[1].trim().replace(/^[“"「『](.+)[”"」』]$/, "$1");
  if (!name || name.length > 40 || /[。．]/.test(name)) return null;
  return name;
}

const isDevNote = (block) => block.italic || /^(開発チームより|開発者より|Dev Note)/.test(strip(block.text));

// ---- 1行の差分解析 ----

// （変更前：X） / 古い書式の（以前はX） / （新効果） / （削除）
const MARK = /[（(]\s*(?:(?:変更前|以前は|以前)\s*[：:]?\s*([^）)]*)|(新効果|新機能|新規|追加)|(削除))\s*[）)]/g;
// 古い書式の「6%→10%に変更しました」。名前の変更（「A」→「B」）は拾わないよう数字で始まるものだけ
const VALUE = String.raw`\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*\s*(?:%|％|m\/秒|メートル|秒|個|本減少|本|台|回|倍)?`;
const ARROW = new RegExp(`(${VALUE})\\s*(?:→|から)\\s*(${VALUE})(?=\\s*[にへ→]|\\s*$)`, "g");
// 「〜に減少しました」のような “変えた” という意味の動詞（効果量の動詞と区別する）
const CHANGE_VERB = /に(?:減少|増加|短縮|延長|上昇|低下|変更)(?:しました|させました|されました)/g;
const BOLD = new RegExp(`${B_OPEN}([^${B_CLOSE}]*)${B_CLOSE}(%|％|秒|個|台|回|倍|メートル|m(?![a-z]))?`, "g");
const NUM = /\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*/g;
// 数値が小さいほど持ち主に有利な項目（「クールダウンは30秒」のように値そのものがコストのとき）
const LOWER_IS_BETTER = /クールダウン|疲労|必要|かかる|待機|遅延|ペナルティ|消費|チャージ時間|溜め時間|再使用/;
// 「25%短くなる」「10%増加する」のように数値が効果量を表すときは、大きいほど有利
const MAGNITUDE_VERB = /短く|短縮|減少|低下|増加|延長|長く|上昇|速く|遅く|拡大|縮小/;
const DECREASE = /^\s*(?:%|％)?\s*(?:低下|減少)/;
const INCREASE = /上昇|増加/;

export function numbers(s, signed = false) {
  return [...(s ?? "").matchAll(NUM)].map((m) => {
    const tiers = m[0].split("/").map(Number);
    const avg = tiers.reduce((a, b) => a + b, 0) / tiers.length;
    return signed && DECREASE.test(s.slice(m.index + m[0].length)) ? -avg : avg;
  });
}

// 変更前と変更後の数値を後ろから並べて比べる（変更前の方が言葉を省略していることが多いため）
export function direction(before, after) {
  // 「40%低下 → 9%上昇」のように向きが逆になったときだけ、低下・減少を負の数として比べる
  const flip = /低下|減少/.test(before) && INCREASE.test(after ?? "");
  const b = numbers(before, flip), a = numbers(after);
  const n = Math.min(a.length, b.length);
  if (n === 0) return null;
  const signs = new Set();
  for (let i = 1; i <= n; i++) signs.add(Math.sign(a[a.length - i] - b[b.length - i]));
  signs.delete(0);
  if (signs.size !== 1) return null;
  return signs.has(1) ? "up" : "down";
}

const cleanText = (s) => strip(s).replace(/^[。、．，\s]+/, "").replace(/[。．\s]+$/, "").trim();

function judge(before, after, text) {
  const dir = direction(before, after);
  if (!dir) return "change";
  const up = dir === "up";
  const effectText = text.replace(CHANGE_VERB, "");
  const lowerIsBetter = LOWER_IS_BETTER.test(effectText) && !MAGNITUDE_VERB.test(effectText);
  return lowerIsBetter ? (up ? "nerf" : "buff") : (up ? "buff" : "nerf");
}

/** 1段落から差分（変更前マーカーごと）を取り出す。変更のない段落は [] */
export function diffsFromLine(text) {
  const diffs = [];
  let start = 0, m;
  MARK.lastIndex = 0;
  while ((m = MARK.exec(text))) {
    const seg = text.slice(start, m.index);
    start = MARK.lastIndex;
    const bolds = [...seg.matchAll(BOLD)].map((b) => (b[1] + (b[2] ?? "")).trim()).filter(Boolean);
    const after = bolds.length ? bolds.join(" / ") : null;
    const before = m[1] != null ? m[1].trim() : null;
    const isNew = Boolean(m[2]);
    const removed = Boolean(m[3]);
    const segText = cleanText(seg);

    let type = "change";
    if (isNew) type = "buff";
    else if (removed) type = "nerf";
    else if (before != null) type = judge(before, after ?? segText, segText);
    diffs.push({ text: segText, after, before, isNew, ...(removed ? { removed } : {}), type });
  }
  if (diffs.length) return diffs;

  // 古い書式: 「6%→10%に変更しました」
  const lineText = cleanText(text);
  for (const a of strip(text).matchAll(ARROW)) {
    const before = a[1].trim(), after = a[2].trim();
    diffs.push({ text: lineText, after, before, isNew: false, type: judge(before, after, lineText) });
  }
  return diffs;
}

export function overallType(diffs) {
  const dirs = new Set(diffs.map((d) => d.type).filter((t) => t === "buff" || t === "nerf"));
  return dirs.size === 1 ? [...dirs][0] : "change";
}

// ---- パッチ全体 ----

export function extractPatch(body) {
  const blocks = toBlocks(body);
  const changes = [];
  const fixes = [];
  let h2 = "", h3 = null, mode = "content", entity = null, fixGroup = null;

  const section = () => h3 ?? h2;
  // 「新機能」の下はキャラ調整ではなくシステムの話
  const classify = () => (/新機能|機能追加/.test(h2) ? { cat: "system", role: null } : classifySection(section()));
  const startEntity = (name, depth, implicit = false) => {
    entity = { entity: name, ...classify(), section: section(), depth, implicit, isNew: NEW_SECTION.test(section()) && !/変更|調整|アップデート|修正/.test(section()), rawLines: [], devNote: null };
    changes.push(entity);
  };
  // 見出しの無いセクションで「「千里眼」：…」のように1行ずつ名前が付いている書式
  const namedLine = (text) => {
    const m = text.match(/^[\u0001\u0002]*「([^」]{1,30})」[\u0001\u0002]*\s*[：:]\s*/);
    if (!m) return null;
    return { name: m[1], rest: text.slice(m[0].length) };
  };
  const addFix = (text) => {
    const group = fixGroup ?? section() ?? "その他";
    let g = fixes.find((f) => f.group === group);
    if (!g) fixes.push((g = { group, items: [] }));
    g.items.push(text);
  };

  for (const b of blocks) {
    if (b.type !== "p") {
      const title = strip(b.text);
      if (b.type === "h1" || b.type === "h2") { h2 = title; h3 = null; mode = sectionMode(title); }
      else { h3 = title; const sub = sectionMode(title); mode = sub === "content" ? sectionMode(h2) : sub; }
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
    if (name) { startEntity(name, b.depth); continue; }
    if (isDevNote(b)) {
      if (entity) entity.devNote = [entity.devNote, strip(b.text)].filter(Boolean).join("\n");
      continue;
    }
    // 「問題の修正」見出しが無いパッチでも、修正報告の文は不具合修正に回す
    if (/修正しました[。．]?$/.test(strip(b.text)) && !diffsFromLine(b.text).length) {
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
      let diffs = isNew ? [] : rawLines.flatMap(diffsFromLine);
      // 「〜を調整しました」のように変更前の値が書かれていないもの・新キャラの紹介は、文そのものを変更点として扱う
      if (!diffs.length) diffs = rawLines.map((t) => ({ text: cleanText(t), after: null, before: null, isNew, type: isNew ? "new" : "change" }));
      const out = { entity: c.entity, cat: c.cat };
      if (c.role) out.role = c.role;
      Object.assign(out, { section: c.section, type: isNew ? "new" : overallType(diffs), diffs, lines: rawLines.map(cleanText) });
      if (c.devNote) out.devNote = c.devNote;
      return out;
    });
  return { changes: result, fixes };
}
