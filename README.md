# DbD パッチ速報

Dead by Daylight の公式パッチノート（Steam の日本語版）を自動で取得し、キラー・パークの強化／弱体化をサッと確認できるようにまとめる Web アプリ。

- 画面: `index.html` と `assets/`（GitHub Pages でそのまま公開）
- データ: `data/`（`scripts/` のプログラムが作る。形式は [docs/data-format.md](docs/data-format.md)）
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
