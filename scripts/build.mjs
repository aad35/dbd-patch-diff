// data/raw/*.json（fetch.mjs の出力）を解析して、アプリが読む JSON を作る。
// 形式は docs/data-format.md を参照。
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPatch } from "./lib/extract.mjs";

const DATA = fileURLToPath(new URL("../data/", import.meta.url));
const RAW = join(DATA, "raw");
const PATCHES = join(DATA, "patches");
const KILLERS = new Set(JSON.parse(await readFile(join(DATA, "dict", "killers.json"), "utf8")));

// 「現在の効果」には（変更前：…）（新効果）の注記はいらない
const withoutMarkers = (line) => line.replace(/\s*[（(]\s*(?:変更前|以前は?|新効果|新機能|新規|追加|削除)[^）)]*[）)]/g, "").trim();
const toDate =(posttime) => new Date(posttime * 1000).toISOString().slice(0, 10);
const write = (path, obj) => writeFile(path, JSON.stringify(obj, null, 1) + "\n");

// 「喰種」「スラッシャーのアドオン」「反対尋問（HF3で変更）」のように見出しからは分類できなかったものを、
// 他のパッチで同じ名前がキラー・パークとして出てきたときの分類に合わせる
const baseName = (name) => name.replace(/[（(][^）)]*[）)]$/, "").replace(/のアドオン$|\s*[-–—]\s*.+$/, "").trim();

function reclassifyByName(changes) {
  const known = new Map();
  for (const c of changes) {
    if (c.cat === "system" || (c.cat === "perk" && !c.role)) continue;
    const key = baseName(c.entity);
    if (!known.has(key)) known.set(key, { cat: c.cat, role: c.role });
  }
  for (const c of changes) {
    if (c.cat !== "system" && !(c.cat === "perk" && !c.role)) continue;
    const k = known.get(baseName(c.entity));
    if (!k) continue;
    c.cat = k.cat;
    if (k.role) c.role = k.role;
  }
}

// 「新しいパーク：俊敏」→「俊敏」。「パークのHUD改善」のようなパーク全般の話はシステム扱い
function normalizePerk(c) {
  if (c.cat !== "perk") return;
  const m = c.entity.match(/^新しい(?:生存者の?|殺人鬼の?)?パーク[：:]\s*(.+)$/);
  if (m) { c.entity = m[1]; c.type = "new"; }
  if (/パーク|HUD|^殺人鬼$|^生存者$/.test(c.entity)) { c.cat = "system"; delete c.role; return; }
  if (!c.role && /^(?:呪術|悶絶のフック)[：:]/.test(c.entity)) c.role = "killer";
  if (!c.role && /^(?:恵み|チームワーク)[：:]/.test(c.entity)) c.role = "survivor";
}

// キラー名辞書と照らして、変更がどのキラーのものかを決める。
// 「特殊アビリティ：…」のような小見出しは、同じセクションで直前に出てきたキラーのものとみなす。
function killerOf(name) {
  const base = baseName(name);
  if (KILLERS.has(base)) return base;
  const quoted = name.match(/[『「]([^』」]+)[』」]/);
  return quoted && KILLERS.has(quoted[1]) ? quoted[1] : null;
}

function assignCharacters(changes) {
  let owner = null, section = null;
  for (const c of changes) {
    if (c.section !== section) { section = c.section; owner = killerOf(section); }
    if (c.cat !== "killer") continue;
    const k = killerOf(c.entity);
    if (k) owner = k;
    if (k ?? owner) c.character = k ?? owner;
  }
}

async function main() {
  const files = (await readdir(RAW)).filter((f) => f.endsWith(".json"));
  const raws = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(RAW, f), "utf8"))));
  raws.sort((a, b) => b.posttime - a.posttime);

  await rm(PATCHES, { recursive: true, force: true });
  await mkdir(PATCHES, { recursive: true });

  const parsed = raws.map((raw) => ({ raw, ...extractPatch(raw.body) }));
  for (const c of parsed.flatMap((p) => p.changes)) normalizePerk(c);
  reclassifyByName(parsed.flatMap((p) => p.changes));
  for (const p of parsed) assignCharacters(p.changes);

  const index = [];
  const entities = {};
  for (const { raw, changes, fixes } of parsed) {
    const meta = { id: raw.id, version: raw.version, kind: raw.kind, title: raw.title, date: toDate(raw.posttime), url: raw.url };
    const counts = { buff: 0, nerf: 0, change: 0, new: 0, fix: fixes.reduce((n, g) => n + g.items.length, 0) };
    for (const c of changes) counts[c.type]++;
    index.push({ ...meta, counts });
    await write(join(PATCHES, `${raw.id}.json`), { ...meta, changes, fixes });

    // 調整履歴は本番パッチだけ（raws は新しい順なので、そのまま push すれば新しい順になる）
    if (raw.kind !== "release") continue;
    for (const c of changes) {
      // キャラ別に見られるのはキラーとパークだけ（サバイバーは個別の調整がなく、アイテムやクラスの話になるため）
      if (c.cat !== "killer" && c.cat !== "perk") continue;
      // キラーは辞書にある名前だけ（アドオンや能力の小見出しはキラー本人の履歴にまとめる）
      const key = c.cat === "killer" ? c.character : c.entity;
      if (!key) continue;
      const e = (entities[key] ??= { cat: c.cat, ...(c.role ? { role: c.role } : {}), history: [], current: c.lines.map(withoutMarkers) });
      e.history.push({ id: meta.id, version: meta.version, date: meta.date, type: c.type, ...(key !== c.entity ? { part: c.entity } : {}), diffs: c.diffs });
    }
  }

  // 実行時刻ではなく最新パッチの投稿時刻にする（中身が同じなら毎回同じファイルになり、無駄なコミットが出ない）
  const updatedAt = new Date((raws[0]?.posttime ?? 0) * 1000).toISOString();
  await write(join(DATA, "index.json"), { updatedAt, patches: index });
  await write(join(DATA, "entities.json"), entities);

  const total = index.reduce((n, p) => n + p.counts.buff + p.counts.nerf + p.counts.change + p.counts.new, 0);
  console.log(`patches: ${index.length}, changes: ${total}, entities: ${Object.keys(entities).length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
