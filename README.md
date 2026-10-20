# DbD パッチ速報

Dead by Daylight の公式パッチノート（Steam の日本語版・英語版）を自動で取得し、キラー・パークの強化／弱体化をサッと確認できるようにまとめる Web アプリ。

- 画面: `index.html` と `assets/`（GitHub Pages でそのまま公開）
- データ: `data/ja/` と `data/en/`（`scripts/` のプログラムが作る。形式は [docs/data-format.md](docs/data-format.md)）
- 自動更新: `.github/workflows/update-data.yml` が3時間ごとに実行し、新しいパッチノートがあればコミットする

## 手元で動かす

Node.js 22 以上が必要（追加のパッケージは不要）。

```bash
npm run update   # パッチノートを取得して data/ を作り直す
npm test         # 強化・弱体化の判定ルールのテスト
npm run serve    # http://localhost:5173 で画面を確認
npm run images   # assets/img/ に画像を置いたあと、画像一覧を作り直す
```

強化・弱体化の判定はプログラムによる自動判定のため、正確でない場合があります。
間違いを見つけたら `data/dict/overrides.json` の該当する言語の欄に `"パッチid/名前": "buff"` のように書くと、次の更新から直った状態になります。

## SNS 用の画像を作り直す

`design/og-image.html`（1200×630）と `design/icon.html`（180×180）を Chrome のヘッドレスモードで PNG にして、`assets/og-image.png` と `assets/apple-touch-icon.png` を置き換える。

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --hide-scrollbars --window-size=1200,630 --screenshot="$(cygpath -w "$PWD")\\assets\\og-image.png" "file:///$(cygpath -w "$PWD")/design/og-image.html"
```
