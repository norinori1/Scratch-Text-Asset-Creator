# Scratch Font Asset Creator

ブラウザ上で `.ttf` / `.otf` フォントから Scratch 3.0 用 `.sb3` を生成するツールです。

## 開発

### 必要環境

- Node.js 20+
- npm

### セットアップ

```bash
npm ci
```

### ローカル起動

```bash
npm run dev
```

### ビルド

```bash
npm run build
```

### テスト

```bash
npm run test
```

## 公開（GitHub Pages）

このリポジトリは GitHub Actions での GitHub Pages デプロイに対応しています。

### 1. 事前確認

- デフォルトブランチが `main`
- [Settings > Pages] で **Build and deployment** を **GitHub Actions** に設定
- ワークフロー: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

### 2. 公開手順

1. `main` ブランチへ push
2. GitHub Actions で `Deploy to GitHub Pages` が実行
3. 成功後に Pages URL へ反映

### 3. 反映先URL

通常は次の形式です。

- `https://<your-account>.github.io/<repository>/`

### 4. トラブルシュート

- Actions が失敗する場合:
  - Node バージョン（20）
  - `npm ci` / `npm run build` のログ
  - Pages のソース設定が `GitHub Actions` か

## 備考

- Vite の `base` は相対パス設定（`./`）です。
- 静的ホスティング（GitHub Pages）前提で動作します。
