// Steam の公式お知らせ（日本語）からパッチノートを取得し、data/raw/<id>.json に保存する。
// 本文が変わっていないファイルは書き換えない（GitHub Actions で無駄なコミットを出さないため）。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ID = 381210;
const PAGE_SIZE = 100;
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 3);
const RAW_DIR = fileURLToPath(new URL("../data/raw/", import.meta.url));

// "10.2.0 | パッチノート" / "PTB 10.2.0 | …" / "9.1.0 PTB | …" / "9.0.0 | PTB" / "10.1.2a | …"
const PATCH_TITLE = /^(?:PTB\s*)?(\d+\.\d+\.\d+[a-z]?)(?:\s*PTB)?\s*\|/i;
const PTB_WORDS = /PTB|パブリックテスト/i;

export function parsePatchTitle(title) {
  const m = title.trim().match(PATCH_TITLE);
  if (!m) return null;
  const ptb = PTB_WORDS.test(title);
  return { version: m[1], kind: ptb ? "ptb" : "release", id: (ptb ? "ptb-" : "") + m[1] };
}

async function fetchPage(offset) {
  const url = `https://store.steampowered.com/events/ajaxgetpartnereventspageable/?clan_accountid=0&appid=${APP_ID}&offset=${offset}&count=${PAGE_SIZE}&l=japanese`;
  const res = await fetch(url, { headers: { "User-Agent": "dbd-patch-diff (+https://github.com/)" } });
  if (!res.ok) throw new Error(`Steam API ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error("Steam API returned success=false");
  return json.events ?? [];
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  let written = 0;
  const seen = new Set();
  for (let page = 0; page < MAX_PAGES; page++) {
    const events = await fetchPage(page * PAGE_SIZE);
    for (const ev of events) {
      const body = ev.announcement_body;
      const info = parsePatchTitle(ev.event_name ?? "");
      if (!info || !body?.body) continue;
      // 日本語版が無く英語のままのお知らせは解析ルールが合わないので除外
      if (!/[぀-ヿ]/.test(body.body)) continue;
      // 同じ id が複数あるときは新しい方（先に来る方）を採用
      if (seen.has(info.id)) continue;
      seen.add(info.id);
      const raw = {
        ...info,
        title: ev.event_name,
        gid: ev.gid,
        posttime: body.posttime,
        url: `https://store.steampowered.com/news/app/${APP_ID}/view/${ev.gid}`,
        body: body.body,
      };
      const path = join(RAW_DIR, `${info.id}.json`);
      const old = await readJson(path);
      if (old && old.body === raw.body && old.title === raw.title) continue;
      await writeFile(path, JSON.stringify(raw, null, 1) + "\n");
      written++;
      console.log(`saved ${info.id}  (${ev.event_name})`);
    }
    if (events.length < PAGE_SIZE) break;
  }
  console.log(`patch notes found: ${seen.size}, new/updated: ${written}`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
