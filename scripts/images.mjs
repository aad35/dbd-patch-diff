// assets/img/killers/ と assets/img/perks/ にある画像の一覧を assets/img/index.json に書き出す。
// アプリはこの一覧にある名前だけ画像を読みにいく（無い画像を読みにいって 404 を量産しないため）。
// ファイル名はキラー名・パーク名そのまま（例: assets/img/killers/ナース.png）。
import { readdir, writeFile } from "node:fs/promises";
import { extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const IMG = fileURLToPath(new URL("../assets/img/", import.meta.url));
const EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function list(dir) {
  try {
    const files = await readdir(IMG + dir);
    return Object.fromEntries(files.filter((f) => EXT.has(extname(f).toLowerCase())).map((f) => [basename(f, extname(f)).normalize("NFC"), `assets/img/${dir}/${f}`]));
  } catch { return {}; }
}

const index = { killers: await list("killers"), perks: await list("perks") };
await writeFile(IMG + "index.json", JSON.stringify(index, null, 1) + "\n");
console.log(`killers: ${Object.keys(index.killers).length}, perks: ${Object.keys(index.perks).length}`);
