// Steam の BBCode 本文を「見出し / 段落」の平らな配列に変換する。
// 太字は B_OPEN / B_CLOSE の制御文字で残す（変更後の値を拾うのに使う）。

export const B_OPEN = "\u0001";
export const B_CLOSE = "\u0002";

const TAG = /\[(\/?)([a-z0-9*]+)(?:[= ][^\]]*)?\]/gi; // [url=…] や [p align="start"] も含む
const SKIP_TAGS = new Set(["img", "previewyoutube", "video", "dynamiclink"]);
const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export const strip = (s) => s.replace(/[\u0001\u0002]/g, "");

function tidy(s) {
  return s
    .replace(/\u0002\s*\u0001/g, (m) => m.slice(1, -1)) // 連続した太字はつなげる
    .replace(/\u0001(\s*)\u0002/g, "$1")              // 空の太字は消す
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @returns {{type: "h1"|"h2"|"h3"|"h4"|"p", depth: number, text: string, italic: boolean}[]}
 */
export function toBlocks(src) {
  const out = [];
  let depth = 0, buf = "", italicChars = 0, inItalic = 0, skip = 0, head = null;

  const emit = () => {
    const text = tidy(buf);
    if (text) {
      const len = strip(text).replace(/\s/g, "").length;
      out.push({ type: head ?? "p", depth, text, italic: len > 0 && italicChars >= len * 0.8 });
    }
    buf = "";
    italicChars = 0;
  };
  const addText = (t) => {
    if (skip > 0 || !t) return;
    t = t.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? e);
    buf += t;
    if (inItalic > 0) italicChars += t.replace(/\s/g, "").length;
  };

  let last = 0, m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(src))) {
    addText(src.slice(last, m.index));
    last = TAG.lastIndex;
    const close = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (SKIP_TAGS.has(tag)) { skip = Math.max(0, skip + (close ? -1 : 1)); continue; }
    if (skip > 0) continue;
    switch (tag) {
      case "b": buf += close ? B_CLOSE : B_OPEN; break;
      case "i": inItalic = Math.max(0, inItalic + (close ? -1 : 1)); break;
      case "list": case "olist": emit(); depth = Math.max(0, depth + (close ? -1 : 1)); break;
      case "*": case "p": case "hr": emit(); break;
      case "h1": case "h2": case "h3": case "h4": case "h5":
        emit();
        head = close ? null : (tag === "h5" ? "h4" : tag);
        break;
      default: break; // u, url, strike など: タグだけ捨てて中身は残す
    }
  }
  addText(src.slice(last));
  emit();
  return out;
}
