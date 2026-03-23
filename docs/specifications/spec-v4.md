# Scratch Font Asset Creator — 仕様書

**バージョン:** 0.4.0-draft  
**作成日:** 2026-03-23  
**差分対象:** v0.3.0-draft からの変更点  
**変更セクション:** §15（全面改訂）、§8.3（モード分岐追加）、§5（UI追加）

---

## 変更サマリー

| # | 変更内容 |
|---|---------|
| §15 全面改訂 | RichTextTagParser の TypeScript 実装仕様を確定 |
| §15-A 追加 | Mode 1: パラメータブロック式（既存仕様を正式化） |
| §15-B 追加 | Mode 2: リッチテキストインライン式（Scratch 実行時パース） |
| §15-C 追加 | Mode 3: コンソールスクリプト式（独自ミニ言語） |
| §15-D 追加 | 全モード共通パイプライン（rtQueue 統一設計） |
| §8.3 改訂 | モード選択に応じたブロック生成分岐を追記 |
| §5 改訂 | エクスポート設定 UI にモード選択 UI を追加 |

---

## §5（差分）Reactコンポーネント構成 — 追加分

`ExportPanel` に以下のコンポーネントを追加する。

```
src/components/export/
├── ExportPanel.tsx               # 既存
├── ExportButton.tsx              # 既存
├── ProgressIndicator.tsx         # 既存
├── RenderModeSelector.tsx        # 既存（クローン/ペン）
├── WarpToggle.tsx                # 既存
└── TextInputModeSelector.tsx     # 🆕 Mode 1 / 2 / 3 切り替え
    ├── Mode1ParamSettings.tsx    # 🆕 Mode 1 専用: 引数一覧の表示/非表示チェックボックス
    ├── Mode2RichTextSettings.tsx # 🆕 Mode 2 専用: タグ一覧ヘルプ・プリプロセス設定
    └── Mode3ConsoleSettings.tsx  # 🆕 Mode 3 専用: 構文リファレンス表示
```

### エクスポート設定 UI（TextInputModeSelector）

```tsx
// src/components/export/TextInputModeSelector.tsx

type TextInputMode = "param" | "richtext" | "console";

export function TextInputModeSelector() {
  const { textInputMode, setTextInputMode } = useAppStore();

  return (
    <fieldset>
      <legend>テキスト入力モード</legend>

      {/* Mode 1 */}
      <label>
        <input type="radio" value="param" checked={textInputMode === "param"}
               onChange={() => setTextInputMode("param")} />
        <span>パラメータブロック式（初心者向け）</span>
        <small>「テキストを表示する」ブロックに色・サイズ等の引数が付く</small>
      </label>

      {/* Mode 2 */}
      <label>
        <input type="radio" value="richtext" checked={textInputMode === "richtext"}
               onChange={() => setTextInputMode("richtext")} />
        <span>リッチテキストインライン式（中級者向け）</span>
        <small>{'<c=#FF0000>赤文字</c> のようなタグをテキストに直接書く'}</small>
      </label>

      {/* Mode 3 */}
      <label>
        <input type="radio" value="console" checked={textInputMode === "console"}
               onChange={() => setTextInputMode("console")} />
        <span>コンソールスクリプト式（上級者向け）</span>
        <small>「文字表示コンソール」リストにスクリプトを書いて実行する</small>
      </label>

      {/* モード別サブ設定 */}
      {textInputMode === "param"    && <Mode1ParamSettings />}
      {textInputMode === "richtext" && <Mode2RichTextSettings />}
      {textInputMode === "console"  && <Mode3ConsoleSettings />}
    </fieldset>
  );
}
```

---

## §15 — テキスト入力モード設計（全面改訂）

### §15-D 全モード共通パイプライン

全3モードは最終的に同一の `__font_rtQueue` リストを生成し、  
共通のレンダラー（`__font_render_queue`）がそれを消費する。

```
┌─────────────────────────────────────────────────────┐
│                 テキスト入力モード                      │
│                                                     │
│  Mode 1: パラメータブロック式                          │
│    テキストを表示する [text] x:[0] y:[0] 色:[30] ...   │
│          │                                          │
│          │ __font_params_to_queue                   │
│          ▼                                          │
│  Mode 2: リッチテキストインライン式                     │
│    テキストを表示する [<c=#F00>text</c>] x:[0] y:[0]  │
│          │                                          │
│          │ __font_preprocess (Scratch 実行時パース)   │
│          ▼                                          │
│  Mode 3: コンソールスクリプト式                        │
│    「文字表示コンソール」リストにスクリプトを記述          │
│          │                                          │
│          │ __font_console_run                       │
│          ▼                                          │
│  ┌─────────────────────────────┐                   │
│  │     __font_rtQueue          │  ← 全モード共通     │
│  │  (1エントリ = 1文字の描画命令) │                   │
│  └─────────────┬───────────────┘                   │
│                │                                   │
│                ▼                                   │
│  __font_render_queue  ← レンダラー（モード問わず共通）  │
│  （クローン生成 or ペン式スタンプ）                     │
└─────────────────────────────────────────────────────┘
```

#### rtQueue エントリ形式（全モード共通）

```
1エントリ = 1文字の描画命令（"|" 区切り）

"文字|x|y|size|colorEffect|ghost|brightness|animType|animAmp|animSpd|typeDelay"

フィールド定義:
  文字         : 表示する1文字（"\n" で改行命令）
  x            : 描画 X 座標（整数）
  y            : 描画 Y 座標（整数）
  size         : サイズ % (デフォルト: 100)
  colorEffect  : Scratch COLOR エフェクト値 0〜200 (デフォルト: 0)
  ghost        : 透明度 0〜100 (デフォルト: 0)
  brightness   : 明るさ -100〜100 (デフォルト: 0)
  animType     : "" / "wave" / "shake" / "fade" / "bounce"
  animAmp      : アニメーション振幅 (デフォルト: 0)
  animSpd      : アニメーション速度 (デフォルト: 0)
  typeDelay    : タイプライター待機 ms (デフォルト: 0)

例（通常文字）:
  "あ|−100|50|100|0|0|0|||0"

例（赤文字、wave アニメーション）:
  "波|0|0|100|100|0|0|wave|8|5|0"
```

---

### §15-A Mode 1: パラメータブロック式

#### 概要

Scratch の赤ブロック（カスタムブロック定義）の引数として  
色・サイズ・透明度等のパラメータを明示的に持つ方式。  
初心者が最も直感的に扱えるモード。

#### 生成されるカスタムブロック

```
define テキストを表示する (text) x: (x) y: (y) サイズ: (size) 色: (color) 透明度: (ghost) 明るさ: (brightness) 揃え: (align)
  [warp: true（デフォルト）]
```

#### Scratch ブロック擬似コード

```
define テキストを表示する (text) x:(x) y:(y) サイズ:(size) 色:(color) 透明度:(ghost) 明るさ:(brightness) 揃え:(align)
  // rtQueue を構築して render_queue を呼ぶ
  delete all of [__font_rtQueue]

  // アライメント前処理（center/right の場合は x オフセット計算）
  set [__p1_startX] to (__font_calc_align (text) (x) (align))
  set [__p1_curX]   to (__p1_startX)
  set [__p1_curY]   to (y)
  set [__p1_i]      to (1)

  repeat (length of (text))
    set [__p1_char] to (letter (__p1_i) of (text))

    if <(__p1_char) = ("\n")> then
      // 改行: X をリセット、Y を1行下げる
      set [__p1_curX] to (__p1_startX)
      change [__p1_curY] by (-(__font_lineHeight))
      add ("\n|0|0|0|0|0|0|||0") to [__font_rtQueue]  // 改行マーカー
    else
      __font_bsearch (__p1_char)
      set [__p1_aw] to (__font_advance_of (__font_bsearch_result))
      add (join (__p1_char)
           (join ("|") (join (__p1_curX)
           (join ("|") (join (__p1_curY)
           (join ("|") (join (size)
           (join ("|") (join (color)
           (join ("|") (join (ghost)
           (join ("|") (join (brightness)
           (join ("|") ("|||0")))))))))))))
          ) to [__font_rtQueue]
      change [__p1_curX] by ((__p1_aw) + (__font_letterSpacing))
    end
    change [__p1_i] by (1)
  end

  __font_render_queue
```

#### TypeScript 側の生成ロジック

```typescript
// src/core/ScratchScriptGenerator.ts（Mode 1）

export function generateMode1Blocks(
  glyphs: GlyphAsset[],
  options: Sb3BuildOptions
): ScratchBlockMap {
  return {
    ...generateBinarySearchBlocks(),
    ...generateAlignCalcBlock(),
    ...generateMode1MainBlock(options),
    ...generateRenderQueueBlock(options),
  };
}
```

---

### §15-B Mode 2: リッチテキストインライン式

#### 概要

`テキストを表示する` ブロックの引数は **テキスト・X・Y の3つのみ**。  
色・サイズ等のパラメータは `<c=#FF0000>` 等のインラインタグで指定する。  
**タグの解析は Scratch 実行時（`__font_preprocess` ブロック内）に行う**。

#### 設計上の重要な判断

**「プリプロセスを生成時にやるか、実行時にやるか」問題:**

| 方式 | 動的テキスト対応 | 実装難易度 | ブロック量 |
|------|---------------|-----------|---------|
| 生成時（ツール側） | ❌ 変数 join 不可 | 低 | 少 |
| **実行時（Scratch 側）** | ✅ 変数・join 対応 | 高 | 多 |

→ **実行時パースを採用**。`join (playerName) ("さん")` のような動的テキストにもタグを使える。

#### 生成されるカスタムブロック

```
define テキストを表示する (richText) x: (x) y: (y)
  [warp: true]
```

`サイズ・色・透明度` の引数はなし。全てタグで指定する。

#### サポートタグ一覧（Scratch 上で解釈されるもの）

| タグ | 引数型 | 例 | 効果 |
|-----|--------|-----|------|
| `<c=N>` | 整数 0〜200 | `<c=100>テキスト</c>` | COLOR エフェクト値を直接指定 |
| `<ch=#RRGGBB>` | CSS カラー | `<ch=#FF0000>テキスト</ch>` | CSS カラー → COLOR 近似変換 |
| `<s=N>` | 整数 % | `<s=200>大きい</s>` | サイズ変更 |
| `<g=N>` | 整数 0〜100 | `<g=50>半透明</g>` | GHOST エフェクト |
| `<b=N>` | 整数 -100〜100 | `<b=-50>暗く</b>` | BRIGHTNESS エフェクト |
| `<wave>` | なし | `<wave>ゆらゆら</wave>` | 波打ちアニメーション |
| `<shake>` | なし | `<shake>ふるふる</shake>` | 振動アニメーション |
| `<sp=N>` | 整数 ms | `<sp=80>ゆっくり</sp>` | タイプライター速度上書き |
| `<br>` | なし | `<br>` | 改行（閉じタグ不要） |

> **Note:** `<ch=#RRGGBB>` は色相を Scratch の COLOR 値に**近似変換**するため、  
> 無彩色（白・黒・グレー）スプライトでは期待通りの色にならない。  
> `<c=N>` による直接値指定の方が確実。UI 上にこの制約を明示する。

#### `__font_preprocess` ブロックの設計

```
// Scratch 上での XML パーサー（自動生成）
// 状態機械で "<" ">" をスキャンして rtQueue を構築する

define __font_preprocess (richText)  [warp: true]
  delete all of [__font_rtQueue]

  // ── パーサー内部状態変数 ──
  set [__pp_i]          to (1)         // 現在スキャン位置
  set [__pp_curColor]   to (0)         // 現在の COLOR 値
  set [__pp_curSize]    to (100)       // 現在のサイズ %
  set [__pp_curGhost]   to (0)
  set [__pp_curBright]  to (0)
  set [__pp_curAnim]    to ("")
  set [__pp_curDelay]   to (0)
  set [__pp_tagBuf]     to ("")        // タグ文字列バッファ
  set [__pp_inTag]      to (0)         // タグ内スキャン中フラグ
  set [__pp_curX]       to (__pp_startX)
  set [__pp_curY]       to (y)

  // ── スタック（タグのネスト対応） ──
  // Scratch にスタックはないため、
  // ネスト深さ5以内を固定長配列リストで模倣する
  // __font_pp_stack_color, __font_pp_stack_size 等

  repeat (length of (richText))
    set [__pp_ch] to (letter (__pp_i) of (richText))

    if <(__pp_inTag) = (1)> then
      // タグバッファに文字を追加
      if <(__pp_ch) = (">")> then
        // タグ終端 → タグを解釈
        __font_pp_apply_tag (__pp_tagBuf)
        set [__pp_tagBuf] to ("")
        set [__pp_inTag]  to (0)
      else
        set [__pp_tagBuf] to (join (__pp_tagBuf) (__pp_ch))
      end

    else if <(__pp_ch) = ("<")> then
      // タグ開始
      set [__pp_inTag]  to (1)
      set [__pp_tagBuf] to ("")

    else
      // 通常文字 → rtQueue に追加
      __font_bsearch (__pp_ch)
      if <(__font_bsearch_result) ≠ ("")> then
        set [__pp_aw] to (__font_advance_of (__font_bsearch_result))
        add (join (__pp_ch)
             (join ("|") (join (__pp_curX) ...全フィールド連結...))
            ) to [__font_rtQueue]
        change [__pp_curX] by ((__pp_aw) + (__font_letterSpacing))
      end
    end

    change [__pp_i] by (1)
  end

  __font_render_queue
```

#### `__font_pp_apply_tag` ブロック（タグ解釈）

```
define __font_pp_apply_tag (tagStr)  [warp: true]
  // 先頭が "/" → 閉じタグ（スタックから pop）
  if <(letter (1) of (tagStr)) = ("/")> then
    __font_pp_stack_pop
    stop this script
  end

  // 開きタグのパース
  // "c=100"  → set [__pp_curColor] to (100)
  // "ch=#FF0000" → __font_css_to_color (#FF0000)
  //                set [__pp_curColor] to (__font_color_result)
  // "s=200"  → set [__pp_curSize] to (200)
  // "g=50"   → set [__pp_curGhost] to (50)
  // "b=-50"  → set [__pp_curBright] to (-50)
  // "wave"   → set [__pp_curAnim] to ("wave")
  // "shake"  → set [__pp_curAnim] to ("shake")
  // "sp=80"  → set [__pp_curDelay] to (80)
  // "br"     → 改行処理

  // 先頭2文字 "c=" のケース
  if <(letter (1) of (tagStr)) = ("c")> and
     <(letter (2) of (tagStr)) = ("=")> then
    // ... 以下 N 個の if-else チェーンを自動生成
  end
```

> **実装注意:** Scratch には `startsWith()` 等の文字列関数がないため、  
> `letter (1) of (tag)`, `letter (2) of (tag)` による先頭文字マッチングで  
> タグ種別を判定する。自動生成ツール（`ScratchScriptGenerator.ts`）が  
> タグ種別ごとに if-else ブロックを生成する。

#### ネスト対応：固定長スタック

Scratch にはスタック構造がないため、**固定深さ5のスタックをリストで模倣**する。

```
__font_pp_stack（リスト）:
  アイテム 1: depth（現在のネスト深さ）
  アイテム 2〜6: color@depth1〜5
  アイテム 7〜11: size@depth1〜5
  アイテム 12〜16: ghost@depth1〜5
  アイテム 17〜21: brightness@depth1〜5
  アイテム 22〜26: anim@depth1〜5
  アイテム 27〜31: delay@depth1〜5

// push: depth++ → 現在値を stack[depth] に保存
define __font_pp_stack_push  [warp: true]
  change (item 1 of [__font_pp_stack]) by (1)
  set [__pp_d] to (item 1 of [__font_pp_stack])
  replace item (1 + __pp_d) of [__font_pp_stack] with (__pp_curColor)
  // ... size, ghost, brightness, anim, delay も同様

// pop: stack[depth] を復元 → depth--
define __font_pp_stack_pop  [warp: true]
  set [__pp_d] to (item 1 of [__font_pp_stack])
  set [__pp_curColor]  to (item (1 + __pp_d) of [__font_pp_stack])
  // ... 復元
  change (item 1 of [__font_pp_stack]) by (-1)
```

これにより `<c=100><s=200>テキスト</s></c>` のようなネストが正しく処理される。

#### TypeScript 側の生成ロジック

```typescript
// src/core/RichTextTagParser.ts

export interface RtSegment {
  text: string;
  colorEffect?: number;   // 0〜200（Scratch COLOR 値）
  size?: number;          // % (デフォルト 100)
  ghost?: number;
  brightness?: number;
  wave?: boolean;
  shake?: boolean;
  typeDelay?: number;     // ms/文字
}

/**
 * リッチテキスト文字列を RtSegment[] に分解する
 * （プレビュー・バリデーション用。実際の解析は Scratch 側で行う）
 */
export function parseRichText(input: string): RtSegment[] { ... }

/**
 * CSS カラー文字列を Scratch COLOR エフェクト値に近似変換
 * 色相（H）を 0〜360 → 0〜200 にマッピングする
 */
export function cssColorToScratchColorEffect(hex: string): number {
  const hsl = hexToHsl(hex);
  return Math.round((hsl.h / 360) * 200);
}

/**
 * RtSegment[] → rtQueue エントリ文字列の配列に変換
 * （プレビュー・デバッグ用）
 */
export function serializeSegmentsToQueue(
  segments: RtSegment[],
  startX: number,
  startY: number,
  advances: Record<string, number>
): string[] { ... }

/**
 * Mode 2 の Scratch ブロック群を生成する
 * （preprocess, apply_tag, stack_push/pop, css_to_color 等）
 */
export function generateMode2Blocks(
  options: Sb3BuildOptions
): ScratchBlockMap { ... }
```

---

### §15-C Mode 3: コンソールスクリプト式

#### 概要

Scratch の「**文字表示コンソール**」リストに**テキストスクリプト**を記述し、  
`__font_console_run` ブロックを呼ぶことで実行する方式。  
Unity の UI Toolkit (UXML/USS) や HTML/CSS に相当するワークフローを Scratch 上で実現する。

```
感覚的な対応:
  HTML   <p style="color:red">テキスト</p>  ←→  text:テキスト / color:100
  CSS    color: red; font-size: 200%;       ←→  color:100 / size:200
  JS     document.querySelector(...).style  ←→  set [変数名] to [...] （Scratch 標準）
```

#### コンソールスクリプト言語仕様（v1）

**基本構文:**

```
キー:値
```

各行は `キー:値` の形式。空行・`//` で始まる行はコメントとして無視される。  
`---` は描画命令の区切り（1つのテキストブロックの終端）。

**全キー一覧:**

```
// ─────────── テキスト ───────────
text:<文字列>          // 表示するテキスト（必須）
                       // \n で改行を表現
                       // リッチテキストタグ（Mode 2 互換）も使用可

// ─────────── 座標・レイアウト ───
x:<整数>               // X 座標（デフォルト: 0）
y:<整数>               // Y 座標（デフォルト: 0）
align:<left|center|right>  // アライメント（デフォルト: left）
maxWidth:<整数>         // 折り返し幅 px（0 = 折り返しなし）
lineHeight:<整数>       // 行間 px（デフォルト: フォントサイズ + 4）
letterSpacing:<整数>    // 文字間隔 px（デフォルト: 0）

// ─────────── スタイル ───────────
size:<整数 %>          // サイズ（デフォルト: 100）
color:<0〜200>         // Scratch COLOR エフェクト直接値
colorHex:<#RRGGBB>     // CSS カラー（COLOR 近似変換）
ghost:<0〜100>         // 透明度
brightness:<-100〜100> // 明るさ
layer:<整数>            // レイヤー順序（Scratch の go to layer）

// ─────────── アニメーション ─────
anim:<wave|shake|fade|bounce|none>  // アニメーション種別
animAmp:<整数>          // 振幅（デフォルト: 8）
animSpeed:<整数>        // 速度（デフォルト: 5）

// ─────────── タイプライター ─────
typeDelay:<整数 ms>     // 1文字あたりの待機時間（0 = 即時）

// ─────────── 描画命令区切り ──────
---                    // このブロックを描画して次の命令ブロックへ
                       // （ファイル末尾には不要）
```

**サンプルスクリプト（RPG ダイアログ）:**

```
// ダイアログ1行目
text:勇者よ、よくぞ来た。\n我はこの地を守る精霊だ。
x:-200
y:60
size:100
color:0
typeDelay:60
align:left
---
// ダイアログ2行目（強調）
text:覚悟はできているか？
x:-200
y:-20
size:120
colorHex:#FFD700
anim:wave
animAmp:6
typeDelay:80
```

**サンプルスクリプト（スコア表示）:**

```
// スコアラベル
text:SCORE
x:80
y:160
size:80
brightness:50
---
// スコア値（変数はサポートしない → Mode 1/2 と組み合わせる）
text:0000000
x:80
y:130
size:100
color:0
letterSpacing:2
```

#### `__font_console_run` ブロック（Scratch 実行時インタープリタ）

```
define __font_console_run  [warp: true]
  // 「文字表示コンソール」リストの全行を解釈して rtQueue を構築

  delete all of [__font_rtQueue]
  set [__con_i]        to (1)
  set [__con_text]     to ("")
  set [__con_x]        to (0)
  set [__con_y]        to (0)
  set [__con_size]     to (100)
  set [__con_color]    to (0)
  set [__con_ghost]    to (0)
  set [__con_bright]   to (0)
  set [__con_align]    to ("left")
  set [__con_anim]     to ("")
  set [__con_amp]      to (8)
  set [__con_spd]      to (5)
  set [__con_delay]    to (0)
  set [__con_maxW]     to (0)
  set [__con_ls]       to (0)

  repeat (length of [文字表示コンソール])
    set [__con_line] to (item (__con_i) of [文字表示コンソール])

    // 空行・コメント行はスキップ
    if <(length of (__con_line)) = (0)>
       or <(letter (1) of (__con_line)) = ("/")> then
      change [__con_i] by (1)
      stop this script   // next iteration（repeat continue 相当）
    end

    // "---" 区切り → 現在の text を rtQueue に追加して状態リセット
    if <(__con_line) = ("---")> then
      __font_con_flush_text
      __font_con_reset_state
    else
      // "キー:値" をパース
      __font_con_parse_line (__con_line)
    end

    change [__con_i] by (1)
  end

  // 最終ブロックをフラッシュ（末尾 "---" がない場合）
  if <(length of (__con_text)) > (0)> then
    __font_con_flush_text
  end

  __font_render_queue

// ── キー:値 パーサー ──
define __font_con_parse_line (line)  [warp: true]
  // ":" の位置を検索して key / value を分離
  set [__parse_colonPos] to (0)
  set [__parse_j] to (1)
  repeat (length of (line))
    if <(letter (__parse_j) of (line)) = (":")> then
      set [__parse_colonPos] to (__parse_j)
      set [__parse_j] to ((length of (line)) + 1)  // break
    end
    change [__parse_j] by (1)
  end

  if <(__parse_colonPos) = (0)> then
    stop this script  // ":" なし行はスキップ
  end

  set [__parse_key] to (
    // 1 〜 colonPos-1 文字目を切り出し
    // Scratch には substring 関数がないため文字ループで組み立て
    ...
  )
  set [__parse_val] to (
    // colonPos+1 〜 末尾を切り出し
    ...
  )

  // キーによる分岐（自動生成される if-else チェーン）
  if <(__parse_key) = ("text")>       then set [__con_text]   to (__parse_val) end
  if <(__parse_key) = ("x")>          then set [__con_x]      to (__parse_val) end
  if <(__parse_key) = ("y")>          then set [__con_y]      to (__parse_val) end
  if <(__parse_key) = ("size")>       then set [__con_size]   to (__parse_val) end
  if <(__parse_key) = ("color")>      then set [__con_color]  to (__parse_val) end
  if <(__parse_key) = ("colorHex")>   then
    __font_css_to_color (__parse_val)
    set [__con_color] to (__font_color_result)
  end
  if <(__parse_key) = ("ghost")>      then set [__con_ghost]  to (__parse_val) end
  if <(__parse_key) = ("brightness")> then set [__con_bright] to (__parse_val) end
  if <(__parse_key) = ("align")>      then set [__con_align]  to (__parse_val) end
  if <(__parse_key) = ("anim")>       then set [__con_anim]   to (__parse_val) end
  if <(__parse_key) = ("animAmp")>    then set [__con_amp]    to (__parse_val) end
  if <(__parse_key) = ("animSpeed")>  then set [__con_spd]    to (__parse_val) end
  if <(__parse_key) = ("typeDelay")>  then set [__con_delay]  to (__parse_val) end
  if <(__parse_key) = ("maxWidth")>   then set [__con_maxW]   to (__parse_val) end
  if <(__parse_key) = ("letterSpacing")> then set [__con_ls]  to (__parse_val) end
```

#### TypeScript 側の生成ロジック

```typescript
// src/core/ScratchScriptGenerator.ts（Mode 3 追加分）

export function generateMode3Blocks(
  options: Sb3BuildOptions
): ScratchBlockMap {
  return {
    ...generateBinarySearchBlocks(),
    ...generateCssToColorBlock(),
    ...generateConsoleRunBlock(options),
    ...generateConParseLine(options),
    ...generateConFlushText(options),
    ...generateRenderQueueBlock(options),
  };
}
```

#### UI: コンソールスクリプト構文リファレンス（Mode3ConsoleSettings）

```tsx
// src/components/export/Mode3ConsoleSettings.tsx

export function Mode3ConsoleSettings() {
  return (
    <div>
      <h4>構文リファレンス</h4>
      <table>
        <thead><tr><th>キー</th><th>値</th><th>例</th></tr></thead>
        <tbody>
          <tr><td>text</td><td>文字列</td><td>text:こんにちは</td></tr>
          <tr><td>x / y</td><td>整数</td><td>x:-100</td></tr>
          <tr><td>size</td><td>整数 %</td><td>size:120</td></tr>
          <tr><td>color</td><td>0〜200</td><td>color:100</td></tr>
          <tr><td>colorHex</td><td>#RRGGBB</td><td>colorHex:#FF0000</td></tr>
          <tr><td>anim</td><td>wave/shake/fade/bounce</td><td>anim:wave</td></tr>
          <tr><td>typeDelay</td><td>ms</td><td>typeDelay:60</td></tr>
          <tr><td>---</td><td>（区切り）</td><td>---</td></tr>
        </tbody>
      </table>
      <p>// から始まる行はコメントとして無視されます</p>
    </div>
  );
}
```

---

## §8.3（差分）— モード別 .sb3 ブロック生成分岐

`Sb3Builder.ts` および `ScratchScriptGenerator.ts` に、  
選択モードに応じてブロック生成を切り替えるロジックを追加する。

```typescript
// src/core/Sb3Builder.ts（追加分）

export async function buildSb3(options: Sb3BuildOptions): Promise<Blob> {
  const { textInputMode } = options;

  // モードに応じてスクリプトブロックを生成
  let blocks: ScratchBlockMap;
  switch (textInputMode) {
    case "param":
      blocks = generateMode1Blocks(options);
      break;
    case "richtext":
      blocks = generateMode2Blocks(options);
      break;
    case "console":
      blocks = generateMode3Blocks(options);
      break;
  }

  // 全モード共通: renderQueueBlock, binarySearchBlock は必ず含む
  // （generateModeXBlocks 内で呼ばれる）

  // Mode 3 のみ: 「文字表示コンソール」リストを project.json に追加
  const extraLists = textInputMode === "console"
    ? { [generateId()]: ["文字表示コンソール", []] }
    : {};

  // ... 既存の ZIP 生成ロジック
}
```

### モード別生成物比較

| 生成物 | Mode 1 | Mode 2 | Mode 3 |
|--------|--------|--------|--------|
| `テキストを表示する` ブロック引数数 | 8 | 3 | 0（ブロックなし） |
| `__font_preprocess` ブロック | ❌ | ✅ | ❌ |
| `__font_pp_apply_tag` ブロック | ❌ | ✅ | ❌ |
| `__font_pp_stack_*` ブロック群 | ❌ | ✅ | ❌ |
| `__font_console_run` ブロック | ❌ | ❌ | ✅ |
| `__font_con_parse_line` ブロック | ❌ | ❌ | ✅ |
| `__font_con_flush_text` ブロック | ❌ | ❌ | ✅ |
| 「文字表示コンソール」リスト | ❌ | ❌ | ✅ |
| `__font_render_queue` ブロック | ✅ | ✅ | ✅ |
| `__font_bsearch` ブロック | ✅ | ✅ | ✅ |
| `__font_css_to_color` ブロック | ❌ | ✅ | ✅ |
| Scratch 拡張機能（pen） | 任意 | 任意 | 任意 |
| 推定ブロック数（小〜中文字セット） | 約 50 | 約 120 | 約 140 |

---

## §9（差分）— ステート管理 追加フィールド

```typescript
// src/store/appStore.ts（追加分）

interface AppState {
  // ... 既存フィールド

  // テキスト入力モード
  textInputMode: "param" | "richtext" | "console";
  setTextInputMode: (mode: "param" | "richtext" | "console") => void;

  // Mode 2 プレビュー用
  richTextPreviewInput: string;
  setRichTextPreviewInput: (input: string) => void;
  parsedRichTextSegments: RtSegment[];   // derived from richTextPreviewInput
}
```

---

## §21（差分）— 未解決課題 追加

| # | 課題 | 優先度 | ステータス |
|---|------|--------|----------|
| Q-11 | Mode 2 の `__font_preprocess` は 1,000 文字のテキストを warp:true でも 1 フレーム内に処理できるか | 高 | 要ベンチマーク |
| Q-12 | Scratch のリスト文字列比較は `"text:"` のような `:` を含む文字列で正しく動作するか | 高 | 要検証 |
| Q-13 | Mode 3 で `text:` の値部分にコロン `:` が含まれる場合（例: `text:12:30`）のパース方式 | 中 | 要設計（最初の `:` のみを区切りとする方針を採用予定） |
| Q-14 | Mode 2 のネスト深さ上限 5 は実用上十分か（`<wave><s=200><c=100>text</c></s></wave>` = 深さ3） | 低 | 要ユーザーヒアリング |
| Q-15 | Mode 3 のコンソールリストをランタイムに動的書き換えすることで「ストリーミング表示」を実現できるか | 低 | 要調査 |

---

## 付録: 優先度まとめ（v0.4.0 更新版）

| # | 改良項目 | 優先度 | 難易度 | フェーズ |
|---|---------|--------|--------|--------|
| 1 | warp デフォルト有効化 | 🔴 必須 | 低 | Phase 1 |
| 2 | SVG / PNG 出力選択 | 🔴 必須 | 中 | Phase 1 |
| 3 | 旧機能移植＋リファクタ | 🔴 必須 | 高 | Phase 1 |
| 4 | バイナリサーチ高速化 | 🔴 必須 | 中 | Phase 1 |
| 5 | Mode 1: パラメータブロック式（正式化） | 🔴 必須 | 低 | Phase 1 |
| 6 | テキストアライメント | 🟡 推奨 | 中 | Phase 2 |
| 7 | 自動改行（ワードラップ） | 🟡 推奨 | 中 | Phase 2 |
| 8 | テキストクリアブロック | 🟡 推奨 | 低 | Phase 2 |
| 9 | クローン / ペン 選択 | 🟡 推奨 | 中 | Phase 2 |
| 10 | Mode 2: リッチテキストインライン式 | 🟡 推奨 | 高 | Phase 2 |
| 11 | クローンプーリング | 🟡 推奨 | 高 | Phase 2 |
| 12 | タイプライター演出 | 🟡 推奨 | 中 | Phase 2 |
| 13 | 数値フォーマット | 🟡 推奨 | 低 | Phase 2 |
| 14 | Mode 3: コンソールスクリプト式 | 🟢 任意 | 最高 | Phase 3 |
| 15 | テキストアニメーション | 🟢 任意 | 高 | Phase 3 |

---

*このドキュメントは v0.3.0-draft からの差分仕様書です。v0.3.0 の全内容に本書の変更を適用したものが v0.4.0 の完全仕様となります。*