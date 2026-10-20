// 実際のパッチノート（10.2.0 日本語版）の文で、強化・弱体化の判定を確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffsFromLine, extractPatch } from "./lib/extract.mjs";
import { toBlocks } from "./lib/bbcode.mjs";

const line = (bb) => toBlocks(`[p]${bb}[/p]`)[0].text;
const types = (bb) => diffsFromLine(line(bb)).map((d) => d.type);

test("数値が増えたら強化", () => {
  assert.deepEqual(types("[b]14/16/18%[/b]の迅速を得る（変更前：6/12/18%）。"), ["buff"]);
});

test("効果時間が減ったら弱体化", () => {
  assert.deepEqual(types("他の生存者がフックに吊るされるたびに、忍びを[b]13/14/15秒間[/b]得る（変更前：20/25/30秒）。"), ["nerf"]);
});

test("1文に変更前が2つあれば別々に判定する（クールダウンは短いほど強化）", () => {
  const d = diffsFromLine(line("その発電機がエンティティによって[b]30/35/40秒間[/b]ブロックされる（変更前：修理を中断すると即時、25/30/35秒）。クールダウンは[b]30/35/40秒間[/b]（変更前：50秒）。"));
  assert.deepEqual(d.map((x) => x.type), ["buff", "buff"]);
  assert.equal(d[1].before, "50秒");
  assert.equal(d[1].after, "30/35/40秒間");
});

test("「25%短くなる」の数値が大きくなるのは強化", () => {
  assert.deepEqual(types("通常攻撃失敗時のクールダウンが[b]30/35/40%[/b]短くなる（変更前：20/25/30%）。"), ["buff"]);
});

test("「必要な時間が10%増加する」の増加は強化（鋼の握力）", () => {
  assert.deepEqual(types("抜け出すために必要な時間が[b]10/11/12%[/b]増加する（変更前：4/8/12%）。"), ["buff"]);
});

test("低下から上昇に変わったら強化（魂の平穏）", () => {
  assert.deepEqual(types("その速度が[b]8/9/10%上昇[/b]する（変更前：40/35/30%低下）。"), ["buff"]);
});

test("新効果は強化、数値で比べられない変更は「変更」", () => {
  assert.deepEqual(types("対象の生存者が[b]叫び声をあげる[/b]（新効果）。"), ["buff"]);
  assert.deepEqual(types("最も近い[b]5つ[/b]のパレットのオーラが視える（変更前：パレットと窓枠）。"), ["change"]);
});

test("古い書式（以前は…）: 疲労時間を減らしたら強化、ブロック時間を減らしたら弱体化", () => {
  assert.deepEqual(types("疲労の時間を30/25/20秒に減少しました（以前は60/50/40秒）。"), ["buff"]);
  assert.deepEqual(types("ブロックの時間を15/20/25秒に減少しました（以前は20/25/30秒）。"), ["nerf"]);
});

test("古い書式（→）: 6%→10% は強化、名前の変更は変更点にしない", () => {
  const d = diffsFromLine(line("アドオン“ジョンのカルテ”: しゃがみ時の移動速度上昇効果を6%→10%に変更しました。"));
  assert.deepEqual(d.map((x) => [x.before, x.after, x.type]), [["6%", "10%", "buff"]]);
  assert.deepEqual(diffsFromLine(line("「唯一の生存者」→「最後の一人」")), []);
});

test("古い書式（XからYに）", () => {
  const d = diffsFromLine(line("触手の距離を16メートルから14メートルに減少しました。"));
  assert.deepEqual(d.map((x) => [x.before, x.after, x.type]), [["16メートル", "14メートル", "nerf"]]);
});

test("「「千里眼」：…」形式の行はパークごとに分ける", () => {
  const body = `[h3]生存者パークのアップデート[/h3][list][*][p]「千里眼」：持続時間を10/11/12秒に増加させました（変更前：8/9/10秒）。[/p][/*][*][p]「決死の一撃」：スタンの時間を4秒に減少しました（以前は5秒）。[/p][/*][/list]`;
  const { changes } = extractPatch(body);
  assert.deepEqual(changes.map((c) => [c.entity, c.cat, c.role, c.type]), [
    ["千里眼", "perk", "survivor", "buff"],
    ["決死の一撃", "perk", "survivor", "nerf"],
  ]);
});

test("新パークの紹介セクションは「追加」", () => {
  const body = `[h3]新しい殺人鬼パーク[/h3][p][b]泳ぐ目[/b][/p][list][*][p]生存者の追跡を始めると、他の負傷した生存者全員のオーラが表示される。[/p][/*][/list]`;
  const { changes } = extractPatch(body);
  assert.deepEqual(changes.map((c) => [c.entity, c.cat, c.type]), [["泳ぐ目", "perk", "new"]]);
});

// ---- 英語版（10.2.0 の英語のパッチノートの文） ----
const typesEn = (bb) => diffsFromLine(line(bb), "en").map((d) => d.type);

test("英語: (was …) で数値が増えたら強化、太字の後ろの /18% も値に含める", () => {
  const d = diffsFromLine(line("You gain [b]14/16[/b]/18% Haste. [i](was 6/12/18%)[/i]"), "en");
  assert.deepEqual(d.map((x) => [x.before, x.after, x.type]), [["6/12/18%", "14/16/18%", "buff"]]);
});

test("英語: 効果時間が減ったら弱体化、(NEW) は強化", () => {
  assert.deepEqual(typesEn("Whenever another Survivor is hooked, you gain Stealth for [b]13/14/15[/b] seconds. (was 20/25/30s)"), ["nerf"]);
  assert.deepEqual(typesEn("Your missed basic-attack cooldown is [b]15/20/25%[/b] shorter. [i](NEW)[/i]"), ["buff"]);
});

test("英語: slower から faster に変わったら強化（Calm Spirit）", () => {
  assert.deepEqual(typesEn("You unlock Chests and cleanse Totems [b]8/9/10%[/b] faster. (was 40/35/30% slower)"), ["buff"]);
});

test("英語: 古い書式 Reduced … to …（疲労は短いほど強化）", () => {
  assert.deepEqual(typesEn("Reduced the Exhaustion duration to 30/25/20 seconds (was 60/50/40 seconds)."), ["buff"]);
});

test("英語: パッチ全体の振り分け", () => {
  const body = `[h2]Content[/h2][h3]Killer Perk Updates[/h3][list][*][p][b]Agitation[/b][/p][list][*][p]You gain [b]14/16[/b]/18% Haste. [i](was 6/12/18%)[/i][/p][/*][/list][/*][/list]
[h2]Bug Fixes[/h2][p][b]Audio[/b][/p][list][*][p]Fixed an issue with sounds.[/p][/*][/list]`;
  const { changes, fixes } = extractPatch(body, "en");
  assert.deepEqual(changes.map((c) => [c.entity, c.cat, c.role, c.type]), [["Agitation", "perk", "killer", "buff"]]);
  assert.deepEqual(fixes, [{ group: "Audio", items: ["Fixed an issue with sounds."] }]);
});

test("英語: 「Survivor Perks」の下の「[b]Babysitter:[/b] …」形式をパークごとに分ける", () => {
  const body = `[h3]PERKS[/h3][b]Survivor Perks[/b][list][*] [b]Babysitter:[/b]
Increased Haste effect granted to the unhooked Survivor to 15% (was 10%).[/list][b]Killer Perks[/b][list][*] [b]Unbound:[/b]
Increased the Haste effect after vaulting a window to 10% (was 5%)[/list]`;
  const { changes } = extractPatch(body, "en");
  assert.deepEqual(changes.map((c) => [c.entity, c.cat, c.role, c.type]), [
    ["Babysitter", "perk", "survivor", "buff"],
    ["Unbound", "perk", "killer", "buff"],
  ]);
});

test("パッチ全体: セクションでキラー/パーク/不具合修正に振り分ける", () => {
  const body = `[h2]コンテンツ[/h2][h3]殺人鬼パークのアップデート[/h3][list][*][p][b]興奮[/b][/p][list][*][p][b]14/16/18%[/b]の迅速を得る（変更前：6/12/18%）。[/p][/*][/list][/*][/list]
[h3]殺人鬼のアップデート[/h3][p][b]ウェスカー[/b][/p][list][*][p]猛毒バウンドを調整しました。[/p][/*][/list]
[h2]問題の修正[/h2][p][b]オーディオ[/b][/p][list][*][p]効果音の問題を修正しました。[/p][/*][/list]
[h2]既知の問題[/h2][list][*][p]まだ直っていない[/p][/*][/list]`;
  const { changes, fixes } = extractPatch(body);
  assert.deepEqual(changes.map((c) => [c.entity, c.cat, c.role ?? null, c.type]), [
    ["興奮", "perk", "killer", "buff"],
    ["ウェスカー", "killer", null, "change"],
  ]);
  assert.deepEqual(fixes, [{ group: "オーディオ", items: ["効果音の問題を修正しました。"] }]);
});
