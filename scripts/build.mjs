// data/raw/<lang>/*.json（fetch.mjs の出力）を解析して、アプリが読む JSON を data/<lang>/ に作る。
// 形式は docs/data-format.md を参照。
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPatch } from "./lib/extract.mjs";

const DATA = fileURLToPath(new URL("../data/", import.meta.url));
const LANGS = ["ja", "en"];
// キラー名の辞書（日本語名と英語名の組）
const KILLER_PAIRS = JSON.parse(await readFile(join(DATA, "dict", "killers.json"), "utf8"));
// 自動判定を人の目で直したもの（言語ごとに "パッチid/名前": 種類）
const OVERRIDES = JSON.parse(await readFile(join(DATA, "dict", "overrides.json"), "utf8"));

const NAMES = {
  ja: {
    // 「現在の効果」には（変更前：…）（新効果）の注記はいらない
    marker: /\s*[（(]\s*(?:変更前|以前は?|新効果|新機能|新規|追加|削除)[^）)]*[）)]/g,
    // 「スラッシャーのアドオン」「シェイプ - ベースキット」「反対尋問（HF3で変更）」→ 本体の名前
    base: (n) => n.replace(/[（(][^）)]*[）)]$/, "").replace(/のアドオン$|\s*[-–—]\s*.+$/, "").trim(),
    quoted: /[『「]([^』」]+)[』」]/,
    newPerk: /^新しい(?:生存者の?|殺人鬼の?)?パーク[：:]\s*(.+)$/,
    notPerk: /パーク|HUD|^殺人鬼$|^生存者$/,
    killerPerkPrefix: /^(?:呪術|悶絶のフック)[：:]/,
    survivorPerkPrefix: /^(?:恵み|チームワーク)[：:]/,
  },
  en: {
    marker: /\s*\(\s*(?:was|previously|NEW|New Effect|Added|Removed)\b[^)]*\)/gi,
    // "The Shape's Add-ons" / "The Hillbilly - Base Kit" / "The Xenomorph (since PTB)" → 本体の名前
    base: (n) => n.replace(/\s*\([^)]*\)\s*:?$/, "").replace(/:$/, "").replace(/(?:'s)?\s+add-?ons?$/i, "").replace(/\s*[-–—]\s*.+$/, "").trim(),
    quoted: /\((The [^)]+)\)/,
    newPerk: /^New (?:Killer |Survivor )?Perk:\s*(.+)$/i,
    notPerk: /Perks?\b|HUD|^Killers?$|^Survivors?$/i,
    killerPerkPrefix: /^(?:Hex|Scourge Hook):/i,
    survivorPerkPrefix: /^(?:Boon|Teamwork):/i,
  },
};

const toDate = (posttime) => new Date(posttime * 1000).toISOString().slice(0, 10);
const write = (path, obj) => writeFile(path, JSON.stringify(obj, null, 1) + "\n");

// 見出しからは分類できなかったもの（「喰種」「スラッシャーのアドオン」など）を、
// 他のパッチで同じ名前がキラー・パークとして出てきたときの分類に合わせる
function reclassifyByName(changes, N) {
  const known = new Map();
  for (const c of changes) {
    if (c.cat === "system" || (c.cat === "perk" && !c.role)) continue;
    const key = N.base(c.entity);
    if (!known.has(key)) known.set(key, { cat: c.cat, role: c.role });
  }
  for (const c of changes) {
    if (c.cat !== "system" && !(c.cat === "perk" && !c.role)) continue;
    const k = known.get(N.base(c.entity));
    if (!k) continue;
    c.cat = k.cat;
    if (k.role) c.role = k.role;
  }
}

// 「新しいパーク：俊敏」→「俊敏」。「パークのHUD改善」のようなパーク全般の話はシステム扱い
function normalizePerk(c, N) {
  if (c.cat !== "perk") return;
  const m = c.entity.match(N.newPerk);
  if (m) { c.entity = m[1]; c.type = "new"; }
  if (N.notPerk.test(c.entity)) { c.cat = "system"; delete c.role; return; }
  if (!c.role && N.killerPerkPrefix.test(c.entity)) c.role = "killer";
  if (!c.role && N.survivorPerkPrefix.test(c.entity)) c.role = "survivor";
}

// キラー名辞書と照らして、変更がどのキラーのものかを決める。
// 「特殊アビリティ：…」のような小見出しは、同じセクションで直前に出てきたキラーのものとみなす。
function makeKillerOf(lang, N) {
  const byKey = new Map(KILLER_PAIRS.map((p) => [p[lang].toLowerCase(), p[lang]]));
  return (name) => {
    const hit = byKey.get(N.base(name).toLowerCase());
    if (hit) return hit;
    const q = name.match(N.quoted);
    return q ? byKey.get(q[1].toLowerCase()) ?? null : null;
  };
}

function assignCharacters(changes, killerOf) {
  let owner = null, section = null;
  for (const c of changes) {
    if (c.section !== section) { section = c.section; owner = killerOf(section); }
    if (c.cat !== "killer") continue;
    const k = killerOf(c.entity);
    if (k) owner = k;
    if (k ?? owner) c.character = k ?? owner;
  }
}

async function parseLang(lang) {
  const N = NAMES[lang];
  const dir = join(DATA, "raw", lang);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const raws = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(dir, f), "utf8"))));
  raws.sort((a, b) => b.posttime - a.posttime);

  const parsed = raws.map((raw) => ({ raw, ...extractPatch(raw.body, lang) }));
  const all = parsed.flatMap((p) => p.changes);
  for (const c of all) normalizePerk(c, N);
  reclassifyByName(all, N);
  const killerOf = makeKillerOf(lang, N);
  for (const p of parsed) assignCharacters(p.changes, killerOf);
  const overrides = OVERRIDES[lang] ?? {};
  for (const p of parsed) {
    for (const c of p.changes) {
      const type = overrides[`${p.raw.id}/${c.entity}`];
      if (type) { c.type = type; c.reviewed = true; }
    }
  }
  return parsed;
}

// 日本語版と英語版の同じパッチで、パークは同じ順番で並んでいるので、順番どうしで名前を対応づける
function alignPerkNames(byLang) {
  const votes = new Map();
  const en = new Map(byLang.en.map((p) => [p.raw.id, p]));
  for (const ja of byLang.ja) {
    const other = en.get(ja.raw.id);
    if (!other || ja.raw.kind !== "release") continue;
    for (const role of ["killer", "survivor"]) {
      const a = ja.changes.filter((c) => c.cat === "perk" && c.role === role);
      const b = other.changes.filter((c) => c.cat === "perk" && c.role === role);
      if (!a.length || a.length !== b.length) continue;
      a.forEach((c, i) => {
        const key = `${c.entity}\u0000${b[i].entity}`;
        votes.set(key, (votes.get(key) ?? 0) + 1);
      });
    }
  }
  const jaToEn = new Map(), best = new Map();
  for (const [key, n] of votes) {
    const [j, e] = key.split("\u0000");
    if (n > (best.get(j) ?? 0)) { best.set(j, n); jaToEn.set(j, e); }
  }
  return jaToEn;
}

async function writeLang(lang, parsed, altOf) {
  const N = NAMES[lang];
  const out = join(DATA, lang);
  await rm(join(out, "patches"), { recursive: true, force: true });
  await mkdir(join(out, "patches"), { recursive: true });

  const index = [];
  const entities = {};
  for (const { raw, changes, fixes } of parsed) {
    const meta = { id: raw.id, version: raw.version, kind: raw.kind, title: raw.title, date: toDate(raw.posttime), url: raw.url };
    const counts = { buff: 0, nerf: 0, change: 0, new: 0, fix: fixes.reduce((n, g) => n + g.items.length, 0) };
    for (const c of changes) counts[c.type]++;
    index.push({ ...meta, counts });
    await write(join(out, "patches", `${raw.id}.json`), { ...meta, changes, fixes });

    // 調整履歴は本番パッチだけ（parsed は新しい順なので、そのまま push すれば新しい順になる）
    if (raw.kind !== "release") continue;
    for (const c of changes) {
      // キャラ別に見られるのはキラーとパークだけ（サバイバーは個別の調整がなく、アイテムやクラスの話になるため）
      if (c.cat !== "killer" && c.cat !== "perk") continue;
      // キラーは辞書にある名前だけ（アドオンや能力の小見出しはキラー本人の履歴にまとめる）
      const key = c.cat === "killer" ? c.character : c.entity;
      if (!key) continue;
      const alt = altOf(key);
      const e = (entities[key] ??= {
        cat: c.cat, ...(c.role ? { role: c.role } : {}), ...(alt ? { alt } : {}),
        history: [], current: c.lines.map((l) => l.replace(N.marker, "").trim()),
      });
      e.history.push({ id: meta.id, version: meta.version, date: meta.date, type: c.type, ...(key !== c.entity ? { part: c.entity } : {}), diffs: c.diffs });
    }
  }

  // 実行時刻ではなく最新パッチの投稿時刻にする（中身が同じなら毎回同じファイルになり、無駄なコミットが出ない）
  const updatedAt = new Date((parsed[0]?.raw.posttime ?? 0) * 1000).toISOString();
  await write(join(out, "index.json"), { updatedAt, patches: index });
  await write(join(out, "entities.json"), entities);

  const total = index.reduce((n, p) => n + p.counts.buff + p.counts.nerf + p.counts.change + p.counts.new, 0);
  console.log(`[${lang}] patches: ${index.length}, changes: ${total}, entities: ${Object.keys(entities).length}`);
}

async function main() {
  const byLang = {};
  for (const lang of LANGS) byLang[lang] = await parseLang(lang);

  // 言語を切り替えたときに同じキャラ・パークのページを開けるよう、もう一方の言語での名前（alt）を持たせる
  const perkJaToEn = alignPerkNames(byLang);
  const perkEnToJa = new Map([...perkJaToEn].map(([j, e]) => [e, j]));
  const killer = (from, to) => (name) => KILLER_PAIRS.find((p) => p[from] === name)?.[to];
  const altOf = {
    ja: (name) => killer("ja", "en")(name) ?? perkJaToEn.get(name),
    en: (name) => killer("en", "ja")(name) ?? perkEnToJa.get(name),
  };
  for (const lang of LANGS) await writeLang(lang, byLang[lang], altOf[lang]);
}

main().catch((e) => { console.error(e); process.exit(1); });
