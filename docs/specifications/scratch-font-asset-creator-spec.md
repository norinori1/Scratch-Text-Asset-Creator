# Scratch Font Asset Creator — 仕様書

**バージョン:** 0.1.0-draft  
**作成日:** 2026-03-22  
**対象読者:** 開発者・コントリビューター  
**公開先:** GitHub Pages（`*.github.io` ドメイン）

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [用語定義](#2-用語定義)
3. [システム要件・制約](#3-システム要件制約)
4. [全体アーキテクチャ](#4-全体アーキテクチャ)
5. [Reactコンポーネント構成](#5-reactコンポーネント構成)
6. [文字セット管理の設計](#6-文字セット管理の設計)
7. [フォントラスタライズの設計](#7-フォントラスタライズの設計)
8. [.sb3 生成ロジックの設計](#8-sb3-生成ロジックの設計)
9. [ステート管理設計](#9-ステート管理設計)
10. [エラーハンドリング設計](#10-エラーハンドリング設計)
11. [非機能要件](#11-非機能要件)
12. [ディレクトリ構成案](#12-ディレクトリ構成案)
13. [将来的な拡張計画](#13-将来的な拡張計画)
14. [未解決課題・検討事項](#14-未解決課題検討事項)

---

## 1. プロジェクト概要

### 1.1 目的

任意のフォントファイル（`.ttf` / `.otf`）をブラウザにドロップするだけで、**Scratch 3.0 形式の `.sb3` ファイル**を生成するWebツール。  
Unity の **TextMeshPro Font Asset Creator** に相当するワークフローを Scratch ユーザー向けに提供する。

### 1.2 主要ユースケース

| # | アクター | 目標 |
|---|---------|------|
| UC-01 | Scratch 初心者 | 日本語テキストを Scratch プロジェクトに表示したい |
| UC-02 | Scratch 中級者 | 自作ゲームにカスタムフォントを使いたい |
| UC-03 | 教育者 | 授業用プロジェクトで日本語文字を扱いたい |
| UC-04 | 上級ユーザー | 特定の文字セットだけを軽量生成したい |

### 1.3 参考プロジェクト

- **Text Display on Scratch**（概念的な先行実装）
- Unity TextMeshPro Font Asset Creator（UXの参考）

---

## 2. 用語定義

| 用語 | 定義 |
|------|------|
| **Font Asset** | フォントファイルから生成された、各文字の画像データおよびメタデータの集合 |
| **コスチューム** | Scratch におけるスプライトの見た目データ（SVG または PNG） |
| **スプライト** | Scratch のオブジェクト単位。1スプライトに複数コスチュームを持てる |
| **.sb3** | Scratch 3.0 のプロジェクトファイル形式（実体は ZIP アーカイブ） |
| **教育漢字** | 小学校学習指導要領で定める 1,026 字（学年別漢字配当表） |
| **グリフ** | フォントにおける1文字の形状データ |
| **ベースライン** | 文字の基準となる水平ライン |

---

## 3. システム要件・制約

### 3.1 動作環境

| 項目 | 要件 |
|------|------|
| ホスティング | GitHub Pages（静的ファイルのみ） |
| ランタイム | ブラウザのみ（サーバーサイド処理なし） |
| 対応ブラウザ | Chrome 110+ / Firefox 110+ / Edge 110+ / Safari 16+ |
| 必須 Web API | `File API`, `Canvas API`, `Blob API`, `JSZip` |

### 3.2 入力フォーマット

| 種別 | 対応形式 |
|------|---------|
| フォントファイル | `.ttf`, `.otf` |
| 最大ファイルサイズ | 30 MB（暫定） |

### 3.3 出力フォーマット

- Scratch 3.0 形式 `.sb3`（ZIP アーカイブ）
- 内部構造は後述（§8参照）

### 3.4 文字数制限（暫定）

Scratch の仕様上、1プロジェクト内のコスチューム総数には実用的な上限が存在するため、以下を初期制限とする。

| プリセット | 文字数上限（目安） |
|-----------|-----------------|
| ASCII のみ | 95 文字 |
| ASCII + かな | 約 260 文字 |
| フルセット（教育漢字含む） | 約 1,400 文字 |
| カスタム | ユーザー指定（上限 2,000 文字） |

---

## 4. 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│                   ブラウザ（静的）                     │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐  │
│  │   UI Layer   │    │      Core Library         │  │
│  │  (React)     │───▶│                          │  │
│  │              │    │  ┌────────────────────┐  │  │
│  │ - FontDropZone│   │  │  FontLoader        │  │  │
│  │ - CharSetPanel│   │  │  (opentype.js)     │  │  │
│  │ - PreviewPanel│   │  └────────┬───────────┘  │  │
│  │ - ExportButton│   │           │              │  │
│  └──────────────┘   │  ┌────────▼───────────┐  │  │
│                     │  │  GlyphRasterizer   │  │  │
│  ┌──────────────┐   │  │  (Canvas API)      │  │  │
│  │  State Layer │   │  └────────┬───────────┘  │  │
│  │  (Zustand /  │   │           │              │  │
│  │   useReducer)│   │  ┌────────▼───────────┐  │  │
│  └──────────────┘   │  │  Sb3Builder        │  │  │
│                     │  │  (JSZip)           │  │  │
│                     │  └────────────────────┘  │  │
│                     └──────────────────────────┘  │
└─────────────────────────────────────────────────────┘
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
                   メタデータ（幅・高さ・ベースライン）も収集
       │
       ▼
④ Sb3Builder     : project.json + コスチューム PNG + 制御スクリプト
                   を ZIP 化して .sb3 生成
       │
       ▼
ダウンロード（Blob URL）
```

---

## 5. Reactコンポーネント構成

```
src/
├── App.tsx                         # ルートコンポーネント・全体レイアウト
│
├── components/
│   ├── layout/
│   │   ├── Header.tsx              # タイトル・GitHubリンク
│   │   └── Footer.tsx              # ライセンス表記
│   │
│   ├── font/
│   │   ├── FontDropZone.tsx        # ドラッグ＆ドロップ / ファイル選択
│   │   └── FontMetaCard.tsx        # パース済みフォント情報の表示
│   │
│   ├── charset/
│   │   ├── CharSetPanel.tsx        # 文字セット選択UI（親）
│   │   ├── PresetSelector.tsx      # プリセット一覧（チェックボックス）
│   │   ├── CustomCharInput.tsx     # カスタム文字入力テキストエリア
│   │   └── CharCountBadge.tsx      # 選択中の文字数表示
│   │
│   ├── settings/
│   │   ├── SettingsPanel.tsx       # グリフサイズ・パディング等の設定
│   │   ├── SizeSlider.tsx          # フォントサイズ調整
│   │   └── ColorPicker.tsx         # 前景色 / 背景色（透過対応）
│   │
│   ├── preview/
│   │   ├── PreviewPanel.tsx        # グリフプレビュー（親）
│   │   ├── GlyphGrid.tsx           # 全グリフのグリッド表示
│   │   └── GlyphCell.tsx           # 単一グリフのセル
│   │
│   └── export/
│       ├── ExportPanel.tsx         # エクスポート設定・ボタン（親）
│       ├── ExportButton.tsx        # .sb3 生成・ダウンロードボタン
│       └── ProgressIndicator.tsx  # 生成進捗バー
│
├── core/                           # UIに依存しないコアロジック
│   ├── FontLoader.ts               # フォントファイルのパース
│   ├── CharSetResolver.ts          # 文字セット → グリフリスト変換
│   ├── GlyphRasterizer.ts          # グリフ → Canvas → PNG変換
│   ├── Sb3Builder.ts               # .sb3 アセンブリ
│   └── ScratchScriptGenerator.ts  # Scratch ブロックスクリプト生成
│
├── data/
│   ├── charsets/
│   │   ├── ascii.ts                # ASCII 95文字
│   │   ├── hiragana.ts             # ひらがな
│   │   ├── katakana.ts             # カタカナ
│   │   ├── alphabet.ts             # アルファベット（全角含む）
│   │   └── kyoiku_kanji.ts         # 教育漢字 1,026字（学年別）
│   └── presets.ts                  # プリセット定義（各charsetの組み合わせ）
│
├── store/
│   └── appStore.ts                 # Zustand ストア定義
│
├── types/
│   └── index.ts                    # 共通型定義
│
└── utils/
    ├── zip.ts                      # JSZip ラッパー
    └── canvas.ts                   # Canvas ユーティリティ
```

---

## 6. 文字セット管理の設計

### 6.1 プリセット定義（`src/data/presets.ts`）

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
  label: string;          // 表示名（日本語）
  description: string;    // 説明
  chars: string;          // 文字列（各文字を連結した1つのstring）
  count: number;          // 文字数（自動計算 or 手動）
  grade?: number;         // 漢字の学年（漢字セットのみ）
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  charsetIds: CharsetId[];  // 含むcharsetのID一覧
}
```

```typescript
// src/data/presets.ts
import { Preset } from "../types";

export const PRESETS: Preset[] = [
  {
    id: "ascii_only",
    label: "ASCII のみ",
    description: "英数字・記号（95文字）",
    charsetIds: ["ascii"],
  },
  {
    id: "ascii_kana",
    label: "ASCII + かな",
    description: "ASCII・ひらがな・カタカナ（約260文字）",
    charsetIds: ["ascii", "hiragana", "katakana"],
  },
  {
    id: "japanese_basic",
    label: "日本語基本セット",
    description: "ASCII + かな + 教育漢字 全学年（約1,400文字）",
    charsetIds: [
      "ascii", "hiragana", "katakana",
      "kyoiku_kanji_grade1", "kyoiku_kanji_grade2",
      "kyoiku_kanji_grade3", "kyoiku_kanji_grade4",
      "kyoiku_kanji_grade5", "kyoiku_kanji_grade6",
    ],
  },
];
```

### 6.2 文字セット定義ファイル例（`src/data/charsets/hiragana.ts`）

```typescript
// src/data/charsets/hiragana.ts
import { CharsetDefinition } from "../../types";

export const hiragana: CharsetDefinition = {
  id: "hiragana",
  label: "ひらがな",
  description: "ひらがな 46文字（濁点・半濁点含まず）",
  chars: "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん",
  count: 46,
};
```

### 6.3 CharSetResolver のロジック

```typescript
// src/core/CharSetResolver.ts

/**
 * 選択済みプリセット + カスタム文字列 → 重複排除済み文字配列
 */
export function resolveCharList(
  selectedCharsetIds: CharsetId[],
  customChars: string
): string[] {
  const allCharsets = getAllCharsets(); // 全 CharsetDefinition を取得
  
  // 選択されたプリセットの文字を結合
  const presetChars = selectedCharsetIds
    .flatMap((id) => allCharsets[id]?.chars.split("") ?? []);
  
  // カスタム文字列をマージ
  const combined = [...presetChars, ...customChars.split("")];
  
  // 重複排除・空白文字除去・Unicode正規化
  const unique = [...new Set(combined)]
    .filter((c) => c.trim() !== "")
    .map((c) => c.normalize("NFC"));
  
  return unique;
}
```

---

## 7. フォントラスタライズの設計

### 7.1 使用ライブラリ

| ライブラリ | 用途 |
|-----------|------|
| `opentype.js` | TTF/OTF のパース・グリフパス取得 |
| `Canvas API`（ブラウザ標準） | グリフの PNG ラスタライズ |

### 7.2 グリフ描画設定（`GlyphRenderOptions`）

```typescript
// src/types/index.ts
export interface GlyphRenderOptions {
  fontSize: number;           // px（デフォルト: 64）
  padding: number;            // 上下左右パディング px（デフォルト: 4）
  foreground: string;         // CSS カラー（デフォルト: "#000000"）
  background: string | null;  // null = 透過（デフォルト: null）
  canvasWidth?: number;       // 固定幅（未指定時はグリフ幅に合わせる）
  canvasHeight?: number;      // 固定高（未指定時は fontSize + padding * 2）
}
```

### 7.3 ラスタライズ擬似コード

```typescript
// src/core/GlyphRasterizer.ts
import opentype from "opentype.js";

export interface GlyphAsset {
  char: string;
  pngDataUrl: string;   // "data:image/png;base64,..."
  width: number;        // コスチューム幅 (px)
  height: number;       // コスチューム高 (px)
  advanceWidth: number; // 文字送り幅（レイアウト用）
}

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

    // グリフが存在しない場合はスキップ（後述のエラーハンドリング参照）
    if (glyph.index === 0 && char !== "\u0000") {
      console.warn(`Glyph not found for: "${char}" (U+${char.codePointAt(0)?.toString(16).padStart(4, "0")})`);
      continue;
    }

    const advanceWidth = (glyph.advanceWidth ?? font.unitsPerEm) * scale;
    const canvasWidth = Math.max(Math.ceil(advanceWidth + padding * 2), 1);

    // OffscreenCanvas で描画（メインスレッドをブロックしない）
    const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d")!;

    // 背景塗りつぶし（透過の場合はスキップ）
    if (background !== null) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // opentype.js でグリフパスを Canvas に描画
    ctx.fillStyle = foreground;
    const path = glyph.getPath(padding, baseline, fontSize);
    path.draw(ctx);

    // PNG に変換
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const pngDataUrl = `data:image/png;base64,${base64}`;

    results.push({
      char,
      pngDataUrl,
      width: canvasWidth,
      height: canvasHeight,
      advanceWidth: Math.ceil(advanceWidth),
    });
  }

  return results;
}
```

---

## 8. .sb3 生成ロジックの設計

### 8.1 .sb3 ファイル構造

`.sb3` は ZIP アーカイブで、以下のファイルを含む。

```
project.sb3 (ZIP)
├── project.json            # プロジェクト定義（スプライト・スクリプト）
├── {md5hash}.png           # 各グリフの PNG（ファイル名は MD5 ハッシュ）
├── {md5hash}.png
└── ...
```

### 8.2 スプライト構成方針

| 設計案 | 説明 | メリット | デメリット |
|--------|------|----------|----------|
| **A: 全文字を1スプライトのコスチューム** | 1スプライトに全グリフを複数コスチュームとして格納 | シンプル・スクリプトが書きやすい | コスチューム数が多い場合に重くなる |
| **B: 文字ごとに独立スプライト** | 1グリフ = 1スプライト | 個別制御が容易 | スプライト数が膨大になる |
| **C: 表示位置ごとにスプライト（固定桁数）** | 1桁 = 1スプライト（例: 最大16桁） | テキスト表示が高速 | 表示桁数が固定 |

**初期実装: 方針 A（1スプライト + 複数コスチューム）を採用**  
将来的に方針 C も選択可能なオプションとして追加する。

### 8.3 project.json スキーマ（最小構成）

```jsonc
{
  "targets": [
    {
      // ── ステージ（必須） ──
      "isStage": true,
      "name": "Stage",
      "variables": {
        "<varId_displayText>": ["__font_displayText", ""]
      },
      "lists": {},
      "broadcasts": {},
      "blocks": {},
      "comments": {},
      "currentCostume": 0,
      "costumes": [
        {
          "name": "backdrop1",
          "dataFormat": "svg",
          "assetId": "<md5>",
          "md5ext": "<md5>.svg",
          "rotationCenterX": 240,
          "rotationCenterY": 180
        }
      ],
      "sounds": [],
      "volume": 100,
      "layerOrder": 0,
      "tempo": 60,
      "videoTransparency": 50,
      "videoState": "on",
      "textToSpeechLanguage": null
    },
    {
      // ── 文字スプライト ──
      "isStage": false,
      "name": "FontChar",
      "variables": {
        "<varId_charIndex>": ["__font_charIndex", 0]
      },
      "lists": {
        "<listId_charMap>": ["__font_charMap", []]  // 文字 → コスチュームIndex のマップ
      },
      "blocks": {
        // §8.4 参照
      },
      "currentCostume": 0,
      "costumes": [
        // § 各グリフの PNG コスチューム
        {
          "name": "char_あ",
          "dataFormat": "png",
          "assetId": "<md5hash>",
          "md5ext": "<md5hash>.png",
          "rotationCenterX": 0,
          "rotationCenterY": 0
        }
        // ...
      ],
      "sounds": [],
      "visible": false,
      "x": 0,
      "y": 0,
      "size": 100,
      "direction": 90,
      "draggable": false,
      "rotationStyle": "all around",
      "layerOrder": 1
    }
  ],
  "monitors": [],
  "extensions": [],
  "meta": {
    "semver": "3.0.0",
    "vm": "0.2.0",
    "agent": "ScratchFontAssetCreator/0.1.0"
  }
}
```

### 8.4 制御スクリプト設計

#### 変数・リスト一覧

| 種別 | 名前 | 用途 |
|------|------|------|
| 変数 | `__font_displayText` | 表示したい文字列（ユーザーが設定） |
| 変数 | `__font_x` | テキスト描画の開始 X 座標 |
| 変数 | `__font_y` | テキスト描画の開始 Y 座標 |
| リスト | `__font_charMap` | `文字` → `コスチューム名` の対応表（インデックス偶数=文字/奇数=コスチューム名） |

#### スクリプトブロック構成（Scratch ブロック相当の擬似コード）

```
// ── ブロック定義: テキストを表示する ──
define [テキストを表示する (text) x: (x) y: (y)]
  set [__font_displayText] to (text)
  set [__font_x] to (x)
  set [__font_y] to (y)
  broadcast [__font_render]

// ── ブロック定義: レンダリング処理 ──
when I receive [__font_render]
  // クローン全削除
  delete all clones of [FontChar]
  
  set [i] to (1)
  repeat (length of [__font_displayText])
    // i 文字目を取得
    set [currentChar] to (letter (i) of [__font_displayText])
    
    // charMap から対応コスチュームを検索
    set [costumeIndex] to (find costume for char [currentChar])
    
    if <costumeIndex > 0> then
      // FontChar スプライトのクローンを生成・配置
      switch costume to [costumeIndex]
      go to x: (__font_x) y: (__font_y)
      show
      create clone of [FontChar]
      hide
      // X 座標を文字幅だけ進める（各コスチュームのメタデータから取得）
      change [__font_x] by (advanceWidth of [costumeIndex])
    end
    
    change [i] by (1)
  end
```

> **Note:** Scratch のブロック JSON 表現については `§8.5` の `ScratchScriptGenerator.ts` にて実装する。

### 8.5 Sb3Builder 擬似コード

```typescript
// src/core/Sb3Builder.ts
import JSZip from "jszip";
import { md5 } from "../utils/md5";

export interface Sb3BuildOptions {
  glyphs: GlyphAsset[];
  fontName: string;
}

export async function buildSb3(options: Sb3BuildOptions): Promise<Blob> {
  const { glyphs, fontName } = options;
  const zip = new JSZip();

  // ① 各グリフを PNG として ZIP に追加
  const costumes: CostumeEntry[] = [];
  for (const glyph of glyphs) {
    const pngBytes = base64ToUint8Array(glyph.pngDataUrl.split(",")[1]);
    const hash = md5(pngBytes);        // ファイル名 = MD5ハッシュ
    const filename = `${hash}.png`;

    zip.file(filename, pngBytes);

    costumes.push({
      name: `char_${encodeCharName(glyph.char)}`,
      dataFormat: "png",
      assetId: hash,
      md5ext: filename,
      rotationCenterX: 0,
      rotationCenterY: Math.floor(glyph.height / 2),
    });
  }

  // ② charMap リストデータを生成（文字 → コスチューム名 の対応）
  const charMapData = glyphs.flatMap((g, i) => [
    g.char,
    costumes[i].name,
  ]);

  // ③ Scratch スクリプトブロックを生成
  const blocks = ScratchScriptGenerator.generate({
    glyphs,
    charMapData,
    fontName,
  });

  // ④ project.json を生成
  const projectJson = buildProjectJson({
    costumes,
    blocks,
    charMapData,
    fontName,
  });

  zip.file("project.json", JSON.stringify(projectJson));

  // ⑤ ZIP（= .sb3）として出力
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
```

---

## 9. ステート管理設計

### 9.1 グローバルストア（Zustand）

```typescript
// src/store/appStore.ts
interface AppState {
  // フォント関連
  fontFile: File | null;
  parsedFont: opentype.Font | null;
  fontLoadError: string | null;

  // 文字セット関連
  selectedPresetIds: string[];
  customChars: string;
  resolvedCharList: string[];    // derived: resolveCharList の結果

  // レンダリング設定
  renderOptions: GlyphRenderOptions;

  // グリフアセット（ラスタライズ済み）
  glyphAssets: GlyphAsset[];
  isRasterizing: boolean;
  rasterizeProgress: number;    // 0.0 ~ 1.0

  // エクスポート
  isExporting: boolean;
  exportError: string | null;

  // アクション
  setFontFile: (file: File) => Promise<void>;
  togglePreset: (presetId: string) => void;
  setCustomChars: (chars: string) => void;
  setRenderOptions: (opts: Partial<GlyphRenderOptions>) => void;
  startRasterize: () => Promise<void>;
  exportSb3: () => Promise<void>;
}
```

---

## 10. エラーハンドリング設計

| エラー種別 | 発生箇所 | 対処方針 |
|-----------|---------|---------|
| フォントファイル非対応形式 | `FontLoader` | UI にエラーメッセージ表示・処理中断 |
| グリフ未収録文字 | `GlyphRasterizer` | 該当文字をスキップ・警告リストに追加 |
| Canvas 描画失敗 | `GlyphRasterizer` | 該当文字をスキップ・ログ出力 |
| ZIP 生成失敗 | `Sb3Builder` | エラートースト表示・再試行ボタン |
| 文字数上限超過 | `CharSetResolver` | 警告表示・先頭 N 文字に切り詰め |
| ブラウザ非対応 API | 初期化時 | 非対応ブラウザ向けメッセージ表示 |

---

## 11. 非機能要件

### 11.1 パフォーマンス

- グリフのラスタライズは `OffscreenCanvas` + 非同期処理で実施し、UIをブロックしない
- 大量文字（1,000文字以上）の場合は **チャンク処理**（例: 50文字ずつ）でプログレスバーを更新
- `Web Worker` の利用は将来的に検討（Phase 2）

### 11.2 プライバシー・セキュリティ

- フォントファイルはブラウザ内のみで処理し、サーバーへのアップロードは一切行わない
- ユーザーの入力データは外部に送信しない
- CSP（Content-Security-Policy）ヘッダを適切に設定する（GitHub Pages の制約内で対応）

### 11.3 アクセシビリティ

- WCAG 2.1 AA 準拠を目標とする
- ドラッグ＆ドロップのフォールバックとしてファイル選択ボタンを常設する
- スクリーンリーダー対応（`aria-label` 等の付与）

### 11.4 ローカライズ

- UI 言語: 日本語（初期実装）
- 将来的に英語 UI を追加予定

---

## 12. ディレクトリ構成案

```
scratch-font-asset-creator/
├── public/
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── App.tsx
│   ├── components/       # §5 参照
│   ├── core/             # §5 参照
│   ├── data/             # §6 参照
│   ├── store/            # §9 参照
│   ├── types/
│   └── utils/
├── tests/
│   ├── core/
│   │   ├── CharSetResolver.test.ts
│   │   ├── GlyphRasterizer.test.ts
│   │   └── Sb3Builder.test.ts
│   └── data/
│       └── charsets.test.ts
├── .github/
│   └── workflows/
│       └── deploy.yml    # GitHub Pages 自動デプロイ
├── package.json
├── tsconfig.json
├── vite.config.ts        # ビルドツール: Vite
└── README.md
```

---

## 13. 将来的な拡張計画

### Phase 1（初期リリース）
- [x] 基本的な ASCII + 日本語かな セットの .sb3 生成
- [x] フォントドロップ UI
- [x] グリフプレビュー

### Phase 2
- [ ] 教育漢字フルセット対応
- [ ] カスタム文字セット入力
- [ ] 複数スプライト構成（方針 C）の選択オプション
- [ ] SVG 出力オプション（PNG より軽量）

### Phase 3
- [ ] Web Worker による高速化
- [ ] フォントプレビューテキスト入力
- [ ] 生成した .sb3 のプレビュー（Scratch VM をインライン埋め込み）
- [ ] 英語 UI

---

## 14. 未解決課題・検討事項

| # | 課題 | 優先度 | ステータス |
|---|------|--------|----------|
| Q-01 | Scratch の 1スプライトあたりのコスチューム数上限は仕様上明確に定義されているか | 高 | 要調査 |
| Q-02 | `opentype.js` での CJK フォント（CID-keyed OTF）の対応状況 | 高 | 要検証 |
| Q-03 | OffscreenCanvas は Safari で安定して動作するか | 中 | 要検証 |
| Q-04 | 教育漢字 1,026 字の著作権・ライセンス上の問題はないか | 中 | 要確認 |
| Q-05 | .sb3 内の `md5ext` はMD5以外のハッシュでも動作するか | 低 | 要調査 |

---

## 付録: 依存ライブラリ候補

| ライブラリ | バージョン | 用途 | ライセンス |
|-----------|-----------|------|----------|
| `react` | ^18.x | UIフレームワーク | MIT |
| `opentype.js` | ^1.3.x | フォントパース | MIT |
| `jszip` | ^3.10.x | ZIP / .sb3 生成 | MIT |
| `zustand` | ^4.x | ステート管理 | MIT |
| `vite` | ^5.x | ビルドツール | MIT |
| `typescript` | ^5.x | 型安全 | Apache-2.0 |
| `vitest` | ^1.x | ユニットテスト | MIT |
| `tailwindcss` | ^3.x | スタイリング | MIT |

---

*このドキュメントは開発初期の設計仕様書です。実装の進行に応じて随時更新されます。*
