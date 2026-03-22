# Scratch Font Asset Creator — 仕様書

**バージョン:** 0.3.0-draft  
**作成日:** 2026-03-23  
**対象読者:** 開発者・コントリビューター  
**公開先:** GitHub Pages（`*.github.io` ドメイン）

-----

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
1. [用語定義](#2-用語定義)
1. [システム要件・制約](#3-システム要件制約)
1. [全体アーキテクチャ](#4-全体アーキテクチャ)
1. [Reactコンポーネント構成](#5-reactコンポーネント構成)
1. [文字セット管理の設計](#6-文字セット管理の設計)
1. [フォントラスタライズの設計](#7-フォントラスタライズの設計)
1. [.sb3 生成ロジックの設計](#8-sb3-生成ロジックの設計)
1. [ステート管理設計](#9-ステート管理設計)
1. [エラーハンドリング設計](#10-エラーハンドリング設計)
1. [非機能要件](#11-非機能要件)
1. [ディレクトリ構成案](#12-ディレクトリ構成案)
1. [改良案（v0.2.0 策定分）](#13-改良案v020-策定分)
1. [🆕 バイナリサーチによる高速文字検索](#14-バイナリサーチによる高速文字検索)
1. [🆕 リッチテキストタグシステム](#15-リッチテキストタグシステム)
1. [🆕 クローンプーリング](#16-クローンプーリング)
1. [🆕 タイプライター演出ブロック](#17-タイプライター演出ブロック)
1. [🆕 数値フォーマットユーティリティ](#18-数値フォーマットユーティリティ)
1. [🆕 テキストアニメーションシステム](#19-テキストアニメーションシステム)
1. [将来的な拡張計画](#20-将来的な拡張計画)
1. [未解決課題・検討事項](#21-未解決課題検討事項)
1. [付録: 依存ライブラリ候補](#付録-依存ライブラリ候補)

-----

## 1. プロジェクト概要

### 1.1 目的

任意のフォントファイル（`.ttf` / `.otf`）をブラウザにドロップするだけで、**Scratch 3.0 形式の `.sb3` ファイル**を生成するWebツール。  
Unity の **TextMeshPro Font Asset Creator** に相当するワークフローを Scratch ユーザー向けに提供する。

### 1.2 主要ユースケース

|#    |アクター       |目標                           |
|-----|-----------|-----------------------------|
|UC-01|Scratch 初心者|日本語テキストを Scratch プロジェクトに表示したい|
|UC-02|Scratch 中級者|自作ゲームにカスタムフォントを使いたい          |
|UC-03|教育者        |授業用プロジェクトで日本語文字を扱いたい         |
|UC-04|上級ユーザー     |特定の文字セットだけを軽量生成したい           |
|UC-05|ゲーム開発者     |スコア・ダイアログ・UI テキストを本格的に演出したい  |

### 1.3 参考プロジェクト

- **Text Display on Scratch**（概念的な先行実装）
- Unity TextMeshPro Font Asset Creator（UXの参考）

-----

## 2. 用語定義

|用語               |定義                                        |
|-----------------|------------------------------------------|
|**Font Asset**   |フォントファイルから生成された、各文字の画像データおよびメタデータの集合      |
|**コスチューム**       |Scratch におけるスプライトの見た目データ（SVG または PNG）     |
|**スプライト**        |Scratch のオブジェクト単位。1スプライトに複数コスチュームを持てる     |
|**.sb3**         |Scratch 3.0 のプロジェクトファイル形式（実体は ZIP アーカイブ）  |
|**教育漢字**         |小学校学習指導要領で定める 1,026 字（学年別漢字配当表）           |
|**グリフ**          |フォントにおける1文字の形状データ                         |
|**ベースライン**       |文字の基準となる水平ライン                             |
|**クローンプール**      |事前生成したクローン群を再利用する省コストな管理方式                |
|**リッチテキストタグ**    |`<c=#FF0000>` のようなインラインマークアップ。Unity TMPに相当|
|**advance width**|ある文字を描画後に次の文字の描画開始点を右にずらすべきピクセル数          |

-----

## 3. システム要件・制約

### 3.1 動作環境

|項目        |要件                                                 |
|----------|---------------------------------------------------|
|ホスティング    |GitHub Pages（静的ファイルのみ）                             |
|ランタイム     |ブラウザのみ（サーバーサイド処理なし）                                |
|対応ブラウザ    |Chrome 110+ / Firefox 110+ / Edge 110+ / Safari 16+|
|必須 Web API|`File API`, `Canvas API`, `Blob API`, `JSZip`      |

### 3.2 入力フォーマット

|種別       |対応形式          |
|---------|--------------|
|フォントファイル |`.ttf`, `.otf`|
|最大ファイルサイズ|30 MB（暫定）     |

### 3.3 出力フォーマット

- Scratch 3.0 形式 `.sb3`（ZIP アーカイブ）
- 内部構造は後述（§8参照）

### 3.4 文字数制限（暫定）

|プリセット        |文字数上限（目安）          |
|-------------|-------------------|
|ASCII のみ     |95 文字              |
|ASCII + かな   |約 260 文字           |
|フルセット（教育漢字含む）|約 1,400 文字         |
|カスタム         |ユーザー指定（上限 2,000 文字）|

-----

## 4. 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                        ブラウザ（静的）                            │
│                                                                 │
│  ┌──────────────┐    ┌────────────────────────────────────┐    │
│  │   UI Layer   │    │           Core Library              │    │
│  │  (React)     │───▶│                                    │    │
│  │              │    │  ┌────────────────────────────┐    │    │
│  │ - FontDropZone│   │  │  FontLoader (opentype.js)  │    │    │
│  │ - CharSetPanel│   │  └──────────────┬─────────────┘    │    │
│  │ - PreviewPanel│   │                 │                   │    │
│  │ - ExportButton│   │  ┌──────────────▼─────────────┐    │    │
│  └──────────────┘   │  │  GlyphRasterizer            │    │    │
│                     │  │  (Canvas API / OffscreenCanvas)  │    │
│  ┌──────────────┐   │  └──────────────┬─────────────┘    │    │
│  │  State Layer │   │                 │                   │    │
│  │  (Zustand)   │   │  ┌──────────────▼─────────────┐    │    │
│  └──────────────┘   │  │  Sb3Builder (JSZip)         │    │    │
│                     │  └──────────────┬─────────────┘    │    │
│                     │                 │                   │    │
│                     │  ┌──────────────▼─────────────┐    │    │
│                     │  │  ScratchScriptGenerator     │    │    │
│                     │  │  - CloneScript              │    │    │
│                     │  │  - PenScript                │    │    │
│                     │  │  - RichTextParser (NEW)      │    │    │
│                     │  │  - BinarySearchLookup (NEW)  │    │    │
│                     │  └────────────────────────────┘    │    │
│                     └────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 4.1 処理フロー概要

```
フォントファイル投入
       │
       ▼
① FontLoader     : opentype.js でフォントをパース
       │
       ▼
② CharSetResolver: 選択中のプリセット or カスタム文字列から
                   対象グリフリストを生成
       │
       ▼
③ GlyphRasterizer: Canvas API で各グリフを PNG/SVG に変換
                   メタデータ（幅・高さ・ベースライン・advance width）も収集
       │
       ▼
④ Sb3Builder     : project.json + コスチューム + 制御スクリプト
                   を ZIP 化して .sb3 生成
                   ┌────────────────────────────────┐
                   │ スクリプト生成モード（選択可）     │
                   │  - クローン式（デフォルト）        │
                   │  - ペン式（長文高速向け）          │
                   └────────────────────────────────┘
       │
       ▼
ダウンロード（Blob URL）
```

-----

## 5. Reactコンポーネント構成

```
src/
├── App.tsx
│
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   │
│   ├── font/
│   │   ├── FontDropZone.tsx
│   │   └── FontMetaCard.tsx
│   │
│   ├── charset/
│   │   ├── CharSetPanel.tsx
│   │   ├── PresetSelector.tsx
│   │   ├── CustomCharInput.tsx
│   │   └── CharCountBadge.tsx
│   │
│   ├── settings/
│   │   ├── SettingsPanel.tsx
│   │   ├── SizeSlider.tsx
│   │   ├── ColorPicker.tsx
│   │   ├── RenderModeSelector.tsx   # クローン式 / ペン式
│   │   └── WarpToggle.tsx           # warp オプション切り替え
│   │
│   ├── preview/
│   │   ├── PreviewPanel.tsx
│   │   ├── GlyphGrid.tsx
│   │   └── GlyphCell.tsx
│   │
│   └── export/
│       ├── ExportPanel.tsx
│       ├── ExportButton.tsx
│       └── ProgressIndicator.tsx
│
├── core/
│   ├── FontLoader.ts
│   ├── CharSetResolver.ts
│   ├── GlyphRasterizer.ts
│   ├── Sb3Builder.ts
│   ├── ScratchScriptGenerator.ts
│   ├── BinarySearchLookupGenerator.ts  # §14
│   └── RichTextTagParser.ts            # §15
│
├── data/
│   ├── charsets/
│   │   ├── ascii.ts
│   │   ├── hiragana.ts
│   │   ├── katakana.ts
│   │   ├── alphabet.ts
│   │   └── kyoiku_kanji.ts
│   └── presets.ts
│
├── store/
│   └── appStore.ts
│
├── types/
│   └── index.ts
│
└── utils/
    ├── zip.ts
    └── canvas.ts
```

-----

## 6. 文字セット管理の設計

### 6.1 プリセット定義

```typescript
// src/types/index.ts
export type CharsetId =
  | "ascii"
  | "hiragana"
  | "katakana"
  | "alphabet_fullwidth"
  | "kyoiku_kanji_grade1"
  | "kyoiku_kanji_grade2"
  | "kyoiku_kanji_grade3"
  | "kyoiku_kanji_grade4"
  | "kyoiku_kanji_grade5"
  | "kyoiku_kanji_grade6";

export interface CharsetDefinition {
  id: CharsetId;
  label: string;
  description: string;
  chars: string;
  count: number;
  grade?: number;
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  charsetIds: CharsetId[];
}
```

### 6.2 CharSetResolver のロジック

```typescript
// src/core/CharSetResolver.ts
export function resolveCharList(
  selectedCharsetIds: CharsetId[],
  customChars: string
): string[] {
  const allCharsets = getAllCharsets();
  const presetChars = selectedCharsetIds
    .flatMap((id) => allCharsets[id]?.chars.split("") ?? []);
  const combined = [...presetChars, ...customChars.split("")];
  const unique = [...new Set(combined)]
    .filter((c) => c.trim() !== "")
    .map((c) => c.normalize("NFC"));
  return unique;
}
```

-----

## 7. フォントラスタライズの設計

### 7.1 使用ライブラリ

|ライブラリ               |用途                  |
|--------------------|--------------------|
|`opentype.js`       |TTF/OTF のパース・グリフパス取得|
|`Canvas API`（ブラウザ標準）|グリフの PNG ラスタライズ     |

### 7.2 グリフ描画設定（`GlyphRenderOptions`）

```typescript
export interface GlyphRenderOptions {
  fontSize: number;           // px（デフォルト: 64）
  padding: number;            // 上下左右パディング px（デフォルト: 4）
  foreground: string;         // CSS カラー（デフォルト: "#000000"）
  background: string | null;  // null = 透過（デフォルト: null）
  outputFormat: "svg" | "png"; // 出力フォーマット（デフォルト: "svg"）
  renderMode: "clone" | "pen"; // 描画方式（デフォルト: "clone"）
  warp: boolean;               // warpデフォルト: true
}
```

### 7.3 ラスタライズ擬似コード（PNG モード）

```typescript
export async function rasterizeGlyphs(
  font: opentype.Font,
  chars: string[],
  options: GlyphRenderOptions
): Promise<GlyphAsset[]> {
  const { fontSize, padding, foreground, background } = options;
  const scale = fontSize / font.unitsPerEm;
  const ascender = font.ascender * scale;
  const descender = Math.abs(font.descender * scale);
  const canvasHeight = Math.ceil(ascender + descender + padding * 2);
  const baseline = ascender + padding;
  const results: GlyphAsset[] = [];

  for (const char of chars) {
    const glyph = font.charToGlyph(char);
    if (glyph.index === 0 && char !== "\u0000") {
      console.warn(`Glyph not found: "${char}" (U+${char.codePointAt(0)?.toString(16).padStart(4, "0")})`);
      continue;
    }
    const advanceWidth = (glyph.advanceWidth ?? font.unitsPerEm) * scale;
    const canvasWidth = Math.max(Math.ceil(advanceWidth + padding * 2), 1);
    const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d")!;
    if (background !== null) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
    ctx.fillStyle = foreground;
    const path = glyph.getPath(padding, baseline, fontSize);
    path.draw(ctx);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    results.push({
      char,
      pngDataUrl: `data:image/png;base64,${base64}`,
      width: canvasWidth,
      height: canvasHeight,
      advanceWidth: Math.ceil(advanceWidth),
    });
  }
  return results;
}
```

-----

## 8. .sb3 生成ロジックの設計

### 8.1 .sb3 ファイル構造

```
project.sb3 (ZIP)
├── project.json
├── {md5hash}.png   # グリフ画像（PNGモード時）
├── {md5hash}.svg   # グリフ画像（SVGモード時）
└── ...
```

### 8.2 スプライト構成方針

|設計案                  |採用状況     |
|---------------------|---------|
|A: 全文字を1スプライトのコスチューム |✅ 初期実装   |
|B: 文字ごとに独立スプライト      |❌ 未採用    |
|C: 表示位置ごとにスプライト（固定桁数）|🔜 Phase 2|

### 8.3 制御スクリプト設計

#### 変数・リスト一覧

|種別 |名前                    |用途                                      |
|---|----------------------|----------------------------------------|
|変数 |`__font_displayText`  |表示したい文字列                                |
|変数 |`__font_x`            |テキスト描画の開始 X 座標                          |
|変数 |`__font_y`            |テキスト描画の開始 Y 座標                          |
|変数 |`__font_size`         |サイズ（%）                                  |
|変数 |`__font_color`        |色エフェクト値                                 |
|変数 |`__font_ghost`        |透明度エフェクト値                               |
|変数 |`__font_align`        |アライメント `"left"` / `"center"` / `"right"`|
|リスト|`__font_charMap`      |文字 → コスチューム名の対応表（§14 バイナリサーチ用にソート済み）    |
|リスト|`__font_advanceWidths`|コスチューム名 → advance width の対応表            |
|リスト|`__font_pool`         |クローンプール管理リスト（§16）                       |
|リスト|`__font_rtQueue`      |リッチテキスト解析済みキュー（§15）                     |

-----

## 9. ステート管理設計

```typescript
// src/store/appStore.ts
interface AppState {
  fontFile: File | null;
  parsedFont: opentype.Font | null;
  fontLoadError: string | null;
  selectedPresetIds: string[];
  customChars: string;
  resolvedCharList: string[];
  renderOptions: GlyphRenderOptions;
  glyphAssets: GlyphAsset[];
  isRasterizing: boolean;
  rasterizeProgress: number;   // 0.0 ~ 1.0
  isExporting: boolean;
  exportError: string | null;

  setFontFile: (file: File) => Promise<void>;
  togglePreset: (presetId: string) => void;
  setCustomChars: (chars: string) => void;
  setRenderOptions: (opts: Partial<GlyphRenderOptions>) => void;
  startRasterize: () => Promise<void>;
  exportSb3: () => Promise<void>;
}
```

-----

## 10. エラーハンドリング設計

|エラー種別         |発生箇所               |対処方針                  |
|--------------|-------------------|----------------------|
|フォントファイル非対応形式 |`FontLoader`       |UI にエラーメッセージ表示・処理中断   |
|グリフ未収録文字      |`GlyphRasterizer`  |該当文字をスキップ・警告リストに追加    |
|Canvas 描画失敗   |`GlyphRasterizer`  |該当文字をスキップ・ログ出力        |
|ZIP 生成失敗      |`Sb3Builder`       |エラートースト表示・再試行ボタン      |
|文字数上限超過       |`CharSetResolver`  |警告表示・先頭 N 文字に切り詰め     |
|リッチテキストタグ構文エラー|`RichTextTagParser`|不正タグを無視してプレーンテキストとして処理|
|ブラウザ非対応 API   |初期化時               |非対応ブラウザ向けメッセージ表示      |

-----

## 11. 非機能要件

### 11.1 パフォーマンス

- グリフのラスタライズは `OffscreenCanvas` + 非同期処理で実施
- 大量文字（1,000文字以上）は **チャンク処理**（50文字ずつ）でプログレスバーを更新
- charMap は Unicode コードポイント順にソートして出力 → バイナリサーチ（§14）を有効化

### 11.2 プライバシー・セキュリティ

- フォントファイルはブラウザ内のみで処理
- ユーザーの入力データは外部に送信しない

### 11.3 アクセシビリティ

- WCAG 2.1 AA 準拠を目標
- ファイル選択ボタンを常設（ドラッグ＆ドロップのフォールバック）

-----

## 12. ディレクトリ構成案

```
scratch-font-asset-creator/
├── public/
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── App.tsx
│   ├── components/
│   ├── core/
│   ├── data/
│   ├── store/
│   ├── types/
│   └── utils/
├── tests/
│   ├── core/
│   │   ├── CharSetResolver.test.ts
│   │   ├── GlyphRasterizer.test.ts
│   │   ├── Sb3Builder.test.ts
│   │   ├── BinarySearchLookupGenerator.test.ts
│   │   └── RichTextTagParser.test.ts
│   └── data/
│       └── charsets.test.ts
├── .github/
│   └── workflows/
│       └── deploy.yml
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

-----

## 13. 改良案（v0.2.0 策定分）

### 13.1 warp デフォルト有効化

```json
"mutation": {
  "proccode": "テキストを表示する %s ...",
  "warp": "true"
}
```

ユーザーがアニメーション演出等で `false` にしたい場合は、エクスポート設定UIで切り替えられるオプションを用意する。

### 13.2 出力フォーマット選択：PNG ／ SVG

|項目       |SVG（推奨）   |PNG   |
|---------|----------|------|
|Scratch対応|✅         |✅     |
|ファイルサイズ  |🟢 小さい     |🔴 大きい |
|拡大時の品質   |🟢 劣化なし    |🔴 劣化あり|
|複雑フォント   |△ パス増大の可能性|🟢 安定  |

デフォルトは **SVG**。`opentype.js` の `glyph.getPath().toSVG()` でパスを直接取得する。

### 13.3 旧プロジェクト「Text Display」機能移植

旧実装の独自エンコード方式（`ξ` 区切り）を廃止し、パラメータごとにリストアイテムを分ける設計に刷新する。

**移植する機能（全て継承）:**  
文字・数値・記号の表示、X/Y 座標指定、サイズ指定、色効果（COLOR）、明るさ（BRIGHTNESS）、透明度（GHOST）、フォント切替、レイヤー順序、改行 `\n` 検出、文字間隔設定、軽量化モード、小数点数値の表示

### 13.4 テキストアライメント

|値              |動作               |
|---------------|-----------------|
|`"left"`（デフォルト）|指定X座標を左端として右方向に描画|
|`"center"`     |指定X座標を中心として左右に描画 |
|`"right"`      |指定X座標を右端として左方向に描画|

`center` / `right` の場合、描画前にテキスト全体の幅を計算してから開始X座標をオフセットする前処理ブロックを生成する。

### 13.5 自動改行（ワードラップ）

```
テキストを表示する [text] x: [x] y: [y] 最大幅: [maxWidth]
// maxWidth = 0 のとき折り返しなし（旧互換）
```

### 13.6 テキストクリアブロック

```
define テキストをすべてクリアする
  delete all clones of [FontChar]
```

### 13.7 クローン式 ／ ペン式 選択

|比較項目      |クローン式       |ペン式   |
|----------|------------|------|
|拡張機能      |不要          |Pen 必須|
|文字数制限     |最大 300 文字   |制限なし  |
|文字単体のエフェクト|✅ 可         |❌ 不可  |
|高速描画      |△ 文字数が増えると遅い|✅ 速い  |

-----

## 14. 🆕 バイナリサーチによる高速文字検索

### 14.1 背景と課題

旧プロジェクト「Text Display」では、1文字の表示ごとに `__font_charMap` リストを**線形探索**していた。

|文字セット         |線形探索（平均） |バイナリサーチ |改善倍率      |
|--------------|---------|--------|----------|
|ASCII 95文字    |約 47 回比較 |約 7 回比較 |**約 6.7×**|
|かな含む 260文字    |約 130 回比較|約 8 回比較 |**約 16×** |
|教育漢字含む 1,400文字|約 700 回比較|約 11 回比較|**約 64×** |

1,400文字のテキストを10文字表示する場合、線形探索では最大 7,000 回の比較が発生する。  
バイナリサーチなら **最大 110 回**で済む。

### 14.2 前提：charMap のソート済み出力

`Sb3Builder` は `__font_charMap` リストを **Unicode コードポイント昇順** でソートして出力する。

```typescript
// src/core/Sb3Builder.ts
const sortedGlyphs = [...glyphs].sort(
  (a, b) => (a.char.codePointAt(0) ?? 0) - (b.char.codePointAt(0) ?? 0)
);
// charMap = [char0, costume0, char1, costume1, ...]
const charMapData = sortedGlyphs.flatMap((g, i) => [g.char, costumes[i].name]);
```

### 14.3 Scratch ブロック上でのバイナリサーチ実装

`__font_charMap` はペア形式（奇数インデックス: 文字、偶数インデックス: コスチューム名）。  
文字数を N とすると、奇数インデックスのみを探索対象とする。

```
define __font_bsearch (target)  [warp: true]
  // 戻り値: __font_bsearch_result (コスチューム名 or "")

  set [__bsLo] to (1)
  set [__bsHi] to ((length of [__font_charMap]) / 2)
  set [__font_bsearch_result] to ("")

  repeat until <(__bsLo) > (__bsHi)>
    set [__bsMid] to (floor ((__bsLo + __bsHi) / 2))

    // ペアの奇数インデックス = (mid * 2 - 1)
    set [__bsMidChar] to (item ((__bsMid * 2) - 1) of [__font_charMap])

    if <(__bsMidChar) = (target)> then
      // ヒット: 偶数インデックスがコスチューム名
      set [__font_bsearch_result] to (item (__bsMid * 2) of [__font_charMap])
      set [__bsLo] to ((__bsHi) + 1)   // ループ脱出

    else if <(__bsMidChar) < (target)> then
      set [__bsLo] to ((__bsMid) + 1)

    else
      set [__bsHi] to ((__bsMid) - 1)
    end
  end
```

> **Note:** Scratch の文字列比較 `<` は Unicode 辞書順（コードポイント順）で動作するため、
> ソート済みの charMap に対して正しくバイナリサーチが機能する。

### 14.4 呼び出し側（メインレンダリングブロック）

```
// 旧: 線形探索（O(n)）
repeat until <i > length of [__font_charMap]>
  if <item (i) of [__font_charMap] = currentChar> then
    // ヒット
  end
  change [i] by (2)
end

// 新: バイナリサーチ（O(log n)）
__font_bsearch (currentChar)
if <(__font_bsearch_result) ≠ ("")> then
  switch costume to (__font_bsearch_result)
end
```

### 14.5 TypeScript 側の実装（ブロック生成）

```typescript
// src/core/BinarySearchLookupGenerator.ts
export function generateBinarySearchBlocks(
  varIds: VariableIds
): ScratchBlockMap {
  // Scratch blocks JSON を構築して返す
  // warp: true のカスタムブロックとして定義
  return buildCustomBlock({
    name: "__font_bsearch",
    args: [{ type: "text", name: "target" }],
    warp: true,
    body: buildBinarySearchBody(varIds),
  });
}
```

-----

## 15. 🆕 リッチテキストタグシステム

Unity TextMeshPro の Rich Text に相当するインラインマークアップを、生成する `.sb3` 上で処理できるようにする。

### 15.1 タグ仕様

```
<タグ名=値>テキスト</タグ名>
```

|タグ     |値の型         |例                    |効果                   |
|-------|------------|---------------------|---------------------|
|`c`    |CSS カラー文字列  |`<c=#FF0000>赤</c>`   |文字色（COLOR エフェクト近似）   |
|`s`    |整数（%）       |`<s=200>大きい</s>`     |サイズ変更                |
|`g`    |整数（0〜100）   |`<g=50>半透明</g>`      |透明度（GHOST エフェクト）     |
|`b`    |整数（-100〜100）|`<b=-50>暗く</b>`      |明るさ（BRIGHTNESS エフェクト）|
|`wave` |なし          |`<wave>ゆらゆら</wave>`  |波打ちアニメーション（§19）      |
|`shake`|なし          |`<shake>ふるふる</shake>`|振動アニメーション（§19）       |
|`sp`   |整数（ms）      |`<sp=80>ゆっくり</sp>`   |タイプライター速度上書き（§17）    |

### 15.2 TypeScript 側のパーサー設計

```typescript
// src/core/RichTextTagParser.ts

export interface RtSegment {
  text: string;
  color?: string;        // CSS カラー文字列
  size?: number;         // % (デフォルト 100)
  ghost?: number;        // 0〜100
  brightness?: number;   // -100〜100
  wave?: boolean;
  shake?: boolean;
  typeSpeed?: number;    // ms/文字（タイプライター上書き）
}

/**
 * リッチテキスト文字列を RtSegment[] に分解する
 * 不正タグはそのままプレーンテキストとして扱う（フォールバック）
 */
export function parseRichText(input: string): RtSegment[] {
  const segments: RtSegment[] = [];
  // 正規表現でタグをパース
  const tagRegex = /<(\w+)(?:=([^>]*))?>(.*?)<\/\1>/gs;
  let lastIndex = 0;
  for (const match of input.matchAll(tagRegex)) {
    const [fullMatch, tagName, tagValue, inner] = match;
    const start = match.index!;
    // タグ前のプレーンテキスト
    if (start > lastIndex) {
      segments.push({ text: input.slice(lastIndex, start) });
    }
    // タグ付きセグメント（再帰パース対応）
    const innerSegments = parseRichText(inner);
    for (const seg of innerSegments) {
      segments.push(applyTag(seg, tagName, tagValue));
    }
    lastIndex = start + fullMatch.length;
  }
  // 末尾のプレーンテキスト
  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex) });
  }
  return segments;
}

function applyTag(seg: RtSegment, tag: string, value?: string): RtSegment {
  switch (tag) {
    case "c": return { ...seg, color: value };
    case "s": return { ...seg, size: Number(value) };
    case "g": return { ...seg, ghost: Number(value) };
    case "b": return { ...seg, brightness: Number(value) };
    case "wave": return { ...seg, wave: true };
    case "shake": return { ...seg, shake: true };
    case "sp": return { ...seg, typeSpeed: Number(value) };
    default: return seg; // 未知タグは無視
  }
}
```

### 15.3 Scratch ブロックへの変換

解析済みの `RtSegment[]` は、`__font_rtQueue` リストに **エンコードされた形式** で格納される。

```
__font_rtQueue アイテム形式（1エントリ = 1文字）:
  "文字|size|color|ghost|brightness|wave|shake|typeSpeed"
  例: "あ|100|0|0|0|0|0|60"
  例: "W|200|180|0|0|1|0|60"  ← size=200%, color=COLOR180, wave=true
```

レンダリングループはキューを1エントリずつ読み取り、各パラメータを適用してからクローンを生成する。

### 15.4 色タグの実装方針

Scratch の `COLOR` エフェクトは色相回転（0〜200）であり、任意の CSS カラーを直接指定できない。  
`<c=#RRGGBB>` を受け取った場合、**CSS カラーを HSL に変換し、色相を Scratch の COLOR 値に近似マッピング**する。

```typescript
function cssColorToScratchColorEffect(hex: string): number {
  const hsl = hexToHsl(hex);
  // Scratch COLOR は 0〜200 で色相一周
  return Math.round((hsl.h / 360) * 200);
}
```

> **制約:** Scratch の COLOR エフェクトは元の色相からの**相対回転**であるため、  
> 白・黒・グレー等の無彩色スプライトに対しては期待通りの色にならない。  
> この制約は UI のツールチップで明示する。

-----

## 16. 🆕 クローンプーリング

### 16.1 背景と課題

クローン式の最大の弱点は「毎フレーム全クローン削除 → 再生成」のコストである。  
スコア表示やタイマーのように**毎秒更新される短いテキスト**では、削除と再生成を繰り返すたびに  
視覚的なチラつきと処理コストが発生する。

### 16.2 プーリングの概念

```
初期化時（ゲーム開始時）:
  N 個のクローンを事前に生成し、全て非表示・待機状態にする（プール）

テキスト表示時:
  必要な文字数だけプールから取り出し → コスチュームと座標を設定 → 表示

テキストクリア時:
  クローンをプールに返却（非表示・待機状態に戻す）
  ※ delete は呼ばない
```

### 16.3 Scratch 実装

```
// ── 初期化（ゲーム開始 or グリーンフラッグ時） ──
define __font_pool_init (poolSize)  [warp: true]
  delete all clones of [FontChar]
  delete all of [__font_pool]
  set [__font_poolPtr] to (0)

  set [i] to (1)
  repeat (poolSize)
    // プレースホルダーのクローンを生成
    switch costume to [char_ ]    // 空白グリフ（またはダミー）
    go to x: (9999) y: (9999)    // 画面外に配置
    hide
    create clone of [FontChar]
    add (i) to [__font_pool]     // プール管理リスト（使用中フラグ付き）
    change [i] by (1)
  end

// ── プールからクローンを取り出して表示 ──
when I start as a clone
  forever
    wait until <(item (__font_myPoolId) of [__font_pool]) = ("use")>
    show
    // wait until 再び "idle" になるまでコスチューム・座標を維持
    wait until <(item (__font_myPoolId) of [__font_pool]) = ("idle")>
    hide
    go to x: (9999) y: (9999)
  end

// ── テキストレンダリング時にプールから割り当て ──
define __font_pool_acquire (costumeId) (x) (y) (size)  [warp: true]
  change [__font_poolPtr] by (1)
  if <(__font_poolPtr) > (length of [__font_pool])> then
    set [__font_poolPtr] to (1)    // 循環
  end
  replace item (__font_poolPtr) of [__font_pool] with ("idle")  // 一旦 idle に
  // ... コスチューム・座標をクローンに伝える（ブロードキャスト or 変数経由）
  replace item (__font_poolPtr) of [__font_pool] with ("use")
```

### 16.4 プールサイズの選択

```tsx
<select value={renderOptions.poolSize} onChange={...}>
  <option value={0}>なし（毎回削除・生成）</option>
  <option value={32}>小（32文字・スコア表示向け）</option>
  <option value={128}>中（128文字・ダイアログ向け）</option>
  <option value={256}>大（256文字・長文向け）</option>
</select>
```

> **Note:** プールサイズは Scratch のクローン上限 300 を超えないよう設定する。  
> 他スプライトのクローンと合計して 300 以内に収まるよう、  
> UI に目安ガイドを表示する。

### 16.5 パフォーマンス比較

|操作         |通常（削除・再生成）                 |プーリング         |
|-----------|---------------------------|--------------|
|毎フレーム10文字更新|O(10) delete + O(10) create|O(10) 変数書き換えのみ|
|チラつき       |⚠️ あり（1フレーム空白）              |✅ なし          |
|初期コスト      |なし                         |O(N) 初期化（1回のみ）|

-----

## 17. 🆕 タイプライター演出ブロック

### 17.1 概要

RPG のセリフ送りや、ゲームのイントロテキストで一般的な  
**1文字ずつ順に表示していくタイプライター演出**を標準ブロックとして同梱する。

### 17.2 ブロック定義

```
define テキストをタイプライター表示する (text) x: (x) y: (y) 速さ: (msPerChar)
  // msPerChar: 1文字あたりの待機時間（ミリ秒）
  //            0 にすると即時表示（warp 動作と同じ）

  テキストをすべてクリアする

  set [__tw_i] to (1)
  set [__tw_curX] to (x)

  repeat (length of (text))
    set [__tw_char] to (letter (__tw_i) of (text))

    if <(__tw_char) = ("\n")> then
      // 改行処理
      set [__tw_curX] to (x)
      change [__font_y] by (-(__font_lineHeight))
    else
      __font_bsearch (__tw_char)
      if <(__font_bsearch_result) ≠ ("")> then
        switch costume to (__font_bsearch_result)
        go to x: (__tw_curX) y: (__font_y)
        show
        create clone of [FontChar]
        hide
        change [__tw_curX] by (__font_advanceWidth_of (__font_bsearch_result))
      end

      // 演出待機（0のときは待機なし）
      if <(msPerChar) > (0)> then
        wait ((msPerChar) / 1000) seconds
      end
    end

    change [__tw_i] by (1)
  end
```

### 17.3 スキップ対応

```
// タイプライター中にスペースキーを押すとスキップ
when [スペース] key pressed
  if <(__tw_running) = (1)> then
    set [__tw_skip] to (1)
  end

// タイプライター側でスキップフラグを監視
if <(__tw_skip) = (1)> then
  set [msPerChar] to (0)
end
```

### 17.4 ゲーム開発での活用例

```
// ダイアログシステムへの組み込み例
when [ダイアログ開始 v] received
  テキストをタイプライター表示する
    [こんにちは！\n今日はどうしますか？] x: (-200) y: (50) 速さ: (60)
  wait until key [スペース v] pressed
  テキストをすべてクリアする
```

-----

## 18. 🆕 数値フォーマットユーティリティ

### 18.1 概要

ゲーム開発において **スコア・タイマー・HPなどの数値表示** は最頻出のユースケースである。  
専用フォーマットブロックを同梱することで、ユーザーが独自実装する手間をゼロにする。

### 18.2 ブロック一覧

```
// ゼロパディング（スコア表示）
define __font_fmt_zeroPad (number) (digits)
  // 例: 42, 6 → "000042"
  set [__fmt_result] to (number)
  repeat until <(length of (__fmt_result)) ≥ (digits)>
    set [__fmt_result] to (join ("0") (__fmt_result))
  end

// カンマ区切り（大きなスコア）
define __font_fmt_comma (number)
  // 例: 1234567 → "1,234,567"
  set [__fmt_str] to (number)
  set [__fmt_result] to ("")
  set [__fmt_i] to (1)
  repeat (length of (__fmt_str))
    set [__fmt_pos] to ((length of (__fmt_str)) - (__fmt_i) + 1)
    if <<(__fmt_i) > (1)> and <((__fmt_i - 1) mod 3) = (0)>> then
      set [__fmt_result] to (join (",") (__fmt_result))
    end
    set [__fmt_result] to (join (letter (__fmt_pos) of (__fmt_str)) (__fmt_result))
    change [__fmt_i] by (1)
  end

// タイマー表示（秒 → MM:SS）
define __font_fmt_timer (totalSeconds)
  // 例: 125 → "02:05"
  set [__fmt_min] to (floor ((totalSeconds) / 60))
  set [__fmt_sec] to ((totalSeconds) mod 60)
  __font_fmt_zeroPad (__fmt_min) (2)
  set [__fmt_min_str] to (__fmt_result)
  __font_fmt_zeroPad (__fmt_sec) (2)
  set [__fmt_result] to (join (__fmt_min_str) (join (":") (__fmt_result)))

// 小数点以下 N 桁（速度・比率表示）
define __font_fmt_fixed (number) (decimals)
  // 例: 3.14159, 2 → "3.14"
  set [__fmt_factor] to (10 ^ (decimals))
  set [__fmt_int] to (floor ((number) * (__fmt_factor)))
  set [__fmt_result] to (join
    (floor (__fmt_int / __fmt_factor))
    (join (".") (__fmt_int mod __fmt_factor))
  )
```

### 18.3 ゲーム開発での活用例

```
// スコア表示（常時更新）
forever
  __font_fmt_zeroPad (score) (8)
  テキストをタイプライター表示する (__fmt_result) x: (120) y: (160) 速さ: (0)
end

// タイマー表示
forever
  __font_fmt_timer (timerSeconds)
  テキストをすべてクリアする
  __font_pool_acquire ...   // プーリングで効率的に更新
end
```

-----

## 19. 🆕 テキストアニメーションシステム

### 19.1 概要

リッチテキストタグ（§15）の `<wave>` / `<shake>` に対応するアニメーション処理を  
クローン側スクリプトとして生成する。

### 19.2 アニメーション一覧

|タグ        |動作             |実装方式               |
|----------|---------------|-------------------|
|`<wave>`  |各文字がサイン波状に上下する |クローン個別の Y 座標を時間で変化 |
|`<shake>` |各文字がランダムに微振動する |クローン個別の X/Y にノイズを加算|
|`<fade>`  |文字がフェードイン/アウトする|GHOST エフェクトを時間で変化  |
|`<bounce>`|文字が弾むように出現する   |Y 座標を減衰振動で初期化      |

### 19.3 wave アニメーション（Scratch 擬似コード）

```
// クローン生成時に付加情報を変数に格納
// __clone_charIndex : このクローンが何文字目か（波の位相オフセット用）
// __clone_baseY     : 基準 Y 座標

when I start as a clone
  if <(__clone_animType) = ("wave")> then
    set [__wave_phase] to ((__clone_charIndex) * 30)  // 文字ごとに位相ずらし
    forever
      set y to ((__clone_baseY) + ((__wave_amplitude) * sin (__wave_phase)))
      change [__wave_phase] by (__wave_speed)
    end
  end
```

### 19.4 shake アニメーション（Scratch 擬似コード）

```
when I start as a clone
  if <(__clone_animType) = ("shake")> then
    forever
      set x to ((__clone_baseX) + (pick random (-__shake_amp) to (__shake_amp)))
      set y to ((__clone_baseY) + (pick random (-__shake_amp) to (__shake_amp)))
      wait (0.05) seconds
    end
  end
```

### 19.5 パラメータ管理

アニメーション設定は `__font_rtQueue` のエントリに含まれ、  
クローン生成時に対応する変数へ書き込まれる。

```
__font_rtQueue エントリ拡張形式:
  "文字|size|color|ghost|brightness|animType|animParam1|animParam2|typeSpeed"
  例（wave）: "波|100|0|0|0|wave|8|5|60"
             //  ↑                   ↑振幅=8px  ↑速度=5°/frame
  例（shake）:"震|100|0|0|0|shake|3|0|60"
             //  ↑                   ↑振幅=3px
```

### 19.6 エクスポート設定 UI

```tsx
// アニメーションパラメータの調整スライダー
<section>
  <h3>Wave アニメーション</h3>
  <SizeSlider label="振幅 (px)" min={1} max={30} value={waveAmplitude} />
  <SizeSlider label="速度 (°/frame)" min={1} max={20} value={waveSpeed} />
</section>
<section>
  <h3>Shake アニメーション</h3>
  <SizeSlider label="振れ幅 (px)" min={1} max={10} value={shakeAmplitude} />
</section>
```

-----

## 20. 将来的な拡張計画

### Phase 1（初期リリース）

- [x] 基本的な ASCII + 日本語かな セットの .sb3 生成
- [x] フォントドロップ UI
- [x] グリフプレビュー
- [x] warp デフォルト有効化
- [x] SVG / PNG 出力選択
- [x] バイナリサーチによる高速文字検索

### Phase 2

- [ ] 教育漢字フルセット対応
- [ ] カスタム文字セット入力
- [ ] テキストアライメント（左・中・右揃え）
- [ ] 自動改行（ワードラップ）
- [ ] クローン / ペン 切り替え
- [ ] リッチテキストタグシステム（`<c>`, `<s>`, `<g>`, `<b>`）
- [ ] クローンプーリング
- [ ] タイプライター演出ブロック
- [ ] 数値フォーマットユーティリティ

### Phase 3

- [ ] テキストアニメーション（`<wave>`, `<shake>`, `<fade>`, `<bounce>`）
- [ ] Web Worker による高速化
- [ ] 生成した .sb3 のプレビュー（Scratch VM をインライン埋め込み）
- [ ] 英語 UI
- [ ] 複数スプライト構成（方針 C）の選択オプション
- [ ] フォントプレビューテキスト入力（リッチテキスト対応）

-----

## 21. 未解決課題・検討事項

|#   |課題                                                         |優先度|ステータス   |
|----|-----------------------------------------------------------|---|--------|
|Q-01|Scratch の 1スプライトあたりのコスチューム数上限は仕様上明確に定義されているか               |高  |要調査     |
|Q-02|`opentype.js` での CJK フォント（CID-keyed OTF）の対応状況              |高  |要検証     |
|Q-03|OffscreenCanvas は Safari で安定して動作するか                        |中  |要検証     |
|Q-04|教育漢字 1,026 字の著作権・ライセンス上の問題はないか                             |中  |要確認     |
|Q-05|.sb3 内の `md5ext` はMD5以外のハッシュでも動作するか                        |低  |要調査     |
|Q-06|バイナリサーチの Scratch ブロックで `<` 演算子が CJK 文字に対して正しく機能するか         |高  |要検証     |
|Q-07|クローンプーリングの「クローンへの変数渡し」最適な方式は何か（ブロードキャスト vs グローバル変数）        |中  |要設計     |
|Q-08|`<c=CSS色>` の COLOR エフェクト近似精度はユーザー体験として許容できるか               |中  |要ユーザーテスト|
|Q-09|リッチテキストタグのネスト（例: `<wave><c=#F00>テキスト</c></wave>`）をどこまで対応するか|低  |要設計     |
|Q-10|タイプライター演出中のクローン数がプール上限を超えた場合の処理方針                          |中  |要設計     |

-----

## 付録: 優先度まとめ（全改良案）

|# |改良項目          |優先度 |難易度|フェーズ   |
|--|--------------|----|---|-------|
|1 |warp デフォルト有効化 |🔴 必須|低  |Phase 1|
|2 |SVG / PNG 出力選択|🔴 必須|中  |Phase 1|
|3 |旧機能移植＋リファクタ   |🔴 必須|高  |Phase 1|
|4 |バイナリサーチ高速化    |🔴 必須|中  |Phase 1|
|5 |テキストアライメント    |🟡 推奨|中  |Phase 2|
|6 |自動改行（ワードラップ）  |🟡 推奨|中  |Phase 2|
|7 |テキストクリアブロック   |🟡 推奨|低  |Phase 2|
|8 |クローン / ペン 選択  |🟡 推奨|中  |Phase 2|
|9 |リッチテキストタグ     |🟡 推奨|高  |Phase 2|
|10|クローンプーリング     |🟡 推奨|高  |Phase 2|
|11|タイプライター演出     |🟡 推奨|中  |Phase 2|
|12|数値フォーマット      |🟡 推奨|低  |Phase 2|
|13|テキストアニメーション   |🟢 任意|高  |Phase 3|

-----

## 付録: 依存ライブラリ候補

|ライブラリ        |バージョン  |用途           |ライセンス     |
|-------------|-------|-------------|----------|
|`react`      |^18.x  |UIフレームワーク    |MIT       |
|`opentype.js`|^1.3.x |フォントパース      |MIT       |
|`jszip`      |^3.10.x|ZIP / .sb3 生成|MIT       |
|`zustand`    |^4.x   |ステート管理       |MIT       |
|`vite`       |^5.x   |ビルドツール       |MIT       |
|`typescript` |^5.x   |型安全          |Apache-2.0|
|`vitest`     |^1.x   |ユニットテスト      |MIT       |
|`tailwindcss`|^3.x   |スタイリング       |MIT       |

-----

*このドキュメントは開発初期の設計仕様書です。実装の進行に応じて随時更新されます。*