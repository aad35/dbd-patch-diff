// 開発用の静的ファイルサーバー（依存パッケージなし）。リポジトリ直下を http://localhost:5173 で配信する。
// 本番は GitHub Pages がこのフォルダをそのまま配信するので、ここと同じ見え方になる。
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PORT = Number(process.env.PORT ?? 5173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) throw Object.assign(new Error("forbidden"), { code: "EACCES" });
    if (!(await stat(file)).isFile()) throw Object.assign(new Error("not a file"), { code: "ENOENT" });
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(e.code === "EACCES" ? 403 : 404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(e.code === "EACCES" ? "403" : "404");
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}/`));
