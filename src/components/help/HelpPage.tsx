/**
 * HelpPage — ツールの使い方説明ページ
 *
 * カバー内容:
 *   1. ツール概要・基本操作
 *   2. Mode 1: パラメータブロック式
 *   3. Mode 2: リッチテキストインライン式（タグ一覧・CSS 風設定）
 *   4. Mode 3: コンソールスクリプト式
 *   5. Font_Config リファレンス
 */

interface HelpPageProps {
  onClose: () => void;
}

export default function HelpPage({ onClose }: HelpPageProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ページ内ヘッダー */}
      <div className="bg-indigo-700 text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-xl font-bold">📖 使い方ガイド</h1>
          <p className="text-indigo-200 text-sm">Scratch Font Asset Creator の使い方</p>
        </div>
        <button
          onClick={onClose}
          className="text-indigo-200 hover:text-white text-sm underline"
        >
          ← ツールに戻る
        </button>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-10">

        {/* §1 ツール概要 */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-3 border-b pb-2">1. ツール概要</h2>
          <p className="text-gray-700 leading-relaxed">
            <strong>Scratch Font Asset Creator</strong> は、TTF / OTF フォントファイルから
            Scratch 3.0 用のテキスト表示アセット（.sb3）を生成するツールです。
            生成したアセットを Scratch プロジェクトに読み込むことで、
            独自フォントによるテキスト表示や豊富なアニメーション演出が利用できます。
          </p>
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-2">
            <p className="font-semibold">基本的な使い方</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-700">
              <li>TTF または OTF フォントファイルをドロップゾーンにドラッグ＆ドロップ（または選択）して読み込む</li>
              <li>「文字セット」で使用する文字の範囲を選択する（ひらがな・カタカナ・教育漢字など）</li>
              <li>「レンダリング設定」でフォントサイズ・文字色・背景色を調整する</li>
              <li>「エクスポート設定」でテキスト入力モードや描画方式を選択する</li>
              <li>「プレビューを生成」でグリフ画像を確認し、「Scratch アセットを生成」でダウンロードする</li>
            </ol>
          </div>
        </section>

        {/* §2 Font_Config リファレンス */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-3 border-b pb-2">2. Font_Config リファレンス</h2>
          <p className="text-gray-700 mb-3">
            生成された Scratch プロジェクトには <code className="font-mono bg-gray-100 px-1 rounded">Font_Config</code> リストが含まれます。
            このリストの各インデックスを変更することで、テキスト表示のデフォルト設定を上書きできます。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-indigo-100 text-indigo-900">
                  <th className="px-3 py-2 text-left border border-indigo-200">インデックス</th>
                  <th className="px-3 py-2 text-left border border-indigo-200">設定項目</th>
                  <th className="px-3 py-2 text-left border border-indigo-200">値の範囲</th>
                  <th className="px-3 py-2 text-left border border-indigo-200">説明</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {[
                  ["Font_Config[1]", "x", "整数", "テキスト表示の X 座標デフォルト値"],
                  ["Font_Config[2]", "y", "整数", "テキスト表示の Y 座標デフォルト値"],
                  ["Font_Config[3]", "サイズ", "整数 %（例: 100）", "文字サイズのデフォルト値（100 = 原寸）"],
                  ["Font_Config[4]", "色", "0 〜 200", "COLOR エフェクトのデフォルト値"],
                  ["Font_Config[5]", "明るさ", "-100 〜 100", "BRIGHTNESS エフェクトのデフォルト値"],
                  ["Font_Config[6]", "透明度", "0 〜 100", "GHOST エフェクトのデフォルト値（0 = 不透明）"],
                  ["Font_Config[7]", "レイヤー", "整数（1 = 前面 / -1 = 背面）", "文字スプライトのレイヤー位置"],
                  ["Font_Config[8]", "揃え", "left / center / right", "テキストの水平揃え"],
                  ["Font_Config[9]", "文字間隔", "整数 px", "文字と文字の間隔（デフォルト: 0）"],
                ].map(([idx, name, range, desc]) => (
                  <tr key={idx} className="even:bg-gray-50">
                    <td className="px-3 py-2 border border-gray-200 font-mono text-xs">{idx}</td>
                    <td className="px-3 py-2 border border-gray-200 font-semibold">{name}</td>
                    <td className="px-3 py-2 border border-gray-200 text-xs">{range}</td>
                    <td className="px-3 py-2 border border-gray-200 text-xs">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            ブロックの引数を空にすると <code className="font-mono bg-gray-100 px-1 rounded">Font_Config</code> の値がフォールバックとして使用されます。
            引数に値を指定するとその値が優先されます。
          </p>
        </section>

        {/* §3 Mode 1: パラメータブロック式 */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-3 border-b pb-2">
            3. Mode 1 — パラメータブロック式（初心者向け）
          </h2>
          <p className="text-gray-700 mb-3">
            「テキストを表示する」ブロックに色・サイズなどの引数を直接渡す、最もシンプルなモードです。
          </p>

          <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm mb-4 overflow-x-auto">
            <span className="text-indigo-700 font-bold">テキストを表示する</span>{" "}
            <span className="text-orange-600">[テキスト]</span>{" "}
            <span className="text-gray-600">x:</span>{" "}
            <span className="text-orange-600">[x]</span>{" "}
            <span className="text-gray-600">y:</span>{" "}
            <span className="text-orange-600">[y]</span>{" "}
            <span className="text-gray-600">サイズ:</span>{" "}
            <span className="text-orange-600">[サイズ]</span>{" "}
            <span className="text-gray-600">色:</span>{" "}
            <span className="text-orange-600">[色]</span>{" "}
            <span className="text-gray-600">明るさ:</span>{" "}
            <span className="text-orange-600">[明るさ]</span>{" "}
            <span className="text-gray-600">透明度:</span>{" "}
            <span className="text-orange-600">[透明度]</span>{" "}
            <span className="text-gray-600">レイヤー:</span>{" "}
            <span className="text-orange-600">[レイヤー]</span>{" "}
            <span className="text-gray-600">揃え:</span>{" "}
            <span className="text-orange-600">[揃え]</span>{" "}
            <span className="text-gray-600">文字間隔:</span>{" "}
            <span className="text-orange-600">[文字間隔]</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-green-100 text-green-900">
                  <th className="px-3 py-2 text-left border border-green-200">引数</th>
                  <th className="px-3 py-2 text-left border border-green-200">値の範囲</th>
                  <th className="px-3 py-2 text-left border border-green-200">空欄のとき</th>
                  <th className="px-3 py-2 text-left border border-green-200">説明</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {[
                  ["テキスト", "任意の文字列", "—（必須）", "表示するテキスト。\\n で改行"],
                  ["x", "整数", "Font_Config[1]", "表示 X 座標"],
                  ["y", "整数", "Font_Config[2]", "表示 Y 座標"],
                  ["サイズ", "整数 %", "Font_Config[3]", "文字サイズ（100 = 原寸）"],
                  ["色", "0 〜 200", "Font_Config[4]", "COLOR エフェクト値"],
                  ["明るさ", "-100 〜 100", "Font_Config[5]", "BRIGHTNESS エフェクト値"],
                  ["透明度", "0 〜 100", "Font_Config[6]", "GHOST エフェクト値"],
                  ["レイヤー", "整数", "Font_Config[7]", "スプライトのレイヤー順（1=前面）"],
                  ["揃え", "left / center / right", "Font_Config[8]", "テキストの水平揃え"],
                  ["文字間隔", "整数 px", "Font_Config[9]", "文字間の追加スペース"],
                ].map(([arg, range, fallback, desc]) => (
                  <tr key={arg} className="even:bg-gray-50">
                    <td className="px-3 py-2 border border-gray-200 font-mono text-xs font-semibold">{arg}</td>
                    <td className="px-3 py-2 border border-gray-200 text-xs">{range}</td>
                    <td className="px-3 py-2 border border-gray-200 text-xs text-gray-500">{fallback}</td>
                    <td className="px-3 py-2 border border-gray-200 text-xs">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
            <p className="font-semibold text-green-800 mb-2">使用例</p>
            <div className="font-mono text-xs text-gray-700 space-y-1">
              <p>// 基本的な使い方（座標のみ指定）</p>
              <p className="text-indigo-700">テキストを表示する [こんにちは] x: [-100] y: [50] サイズ: [] 色: [] ...</p>
              <p className="mt-2 text-gray-500">// 引数を空にするとFont_Configのデフォルト値が使われます</p>
            </div>
          </div>
        </section>

        {/* §4 Mode 2: リッチテキストインライン式 */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-3 border-b pb-2">
            4. Mode 2 — リッチテキストインライン式（中級者向け）
          </h2>
          <p className="text-gray-700 mb-3">
            テキスト文字列の中に <code className="font-mono bg-gray-100 px-1 rounded">&lt;タグ&gt;</code> を直接書き込む方式です。
            動的に変化するテキストにも対応できます。ブロックは引数が少なくシンプルです。
          </p>

          <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm mb-4 overflow-x-auto">
            <span className="text-indigo-700 font-bold">テキストを表示する</span>{" "}
            <span className="text-orange-600">[テキスト（タグ含む）]</span>{" "}
            <span className="text-gray-600">x:</span>{" "}
            <span className="text-orange-600">[x]</span>{" "}
            <span className="text-gray-600">y:</span>{" "}
            <span className="text-orange-600">[y]</span>{" "}
            <span className="text-gray-600">揃え:</span>{" "}
            <span className="text-orange-600">[揃え]</span>
          </div>

          <p className="text-gray-600 text-sm mb-4">
            サイズ・色・明るさ・透明度などは <code className="font-mono bg-gray-100 px-1 rounded">Font_Config</code> のデフォルト値が使われ、
            テキスト内のタグで部分的に上書きします。
          </p>

          <h3 className="text-lg font-semibold text-gray-800 mb-2">使用できるタグ一覧</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-100 text-blue-900">
                  <th className="px-3 py-2 text-left border border-blue-200">タグ</th>
                  <th className="px-3 py-2 text-left border border-blue-200">引数</th>
                  <th className="px-3 py-2 text-left border border-blue-200">例</th>
                  <th className="px-3 py-2 text-left border border-blue-200">効果</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {[
                  ["<c=N>", "整数 0〜200", "<c=100>テキスト</c>", "COLOR エフェクト値を直接指定"],
                  ["<ch=#RRGGBB>", "CSS カラー（16進数）", "<ch=#FF0000>赤文字</ch>", "CSS カラー → COLOR 近似変換"],
                  ["<s=N>", "整数 %", "<s=200>大きい</s>", "文字サイズを変更（%指定）"],
                  ["<g=N>", "整数 0〜100", "<g=50>半透明</g>", "GHOST（透明度）エフェクト"],
                  ["<b=N>", "整数 -100〜100", "<b=-50>暗く</b>", "BRIGHTNESS（明るさ）エフェクト"],
                  ["<wave>", "なし", "<wave>ゆらゆら</wave>", "波打ちアニメーション"],
                  ["<shake>", "なし", "<shake>ふるふる</shake>", "振動アニメーション"],
                  ["<sp=N>", "整数 ms", "<sp=80>ゆっくり</sp>", "タイプライター速度を上書き"],
                  ["<br>", "なし（閉じタグ不要）", "<br>", "改行"],
                ].map(([tag, arg, example, effect]) => (
                  <tr key={tag} className="even:bg-gray-50">
                    <td className="px-3 py-2 border border-gray-200 font-mono text-xs">{tag}</td>
                    <td className="px-3 py-2 border border-gray-200 text-xs">{arg}</td>
                    <td className="px-3 py-2 border border-gray-200 font-mono text-xs">{example}</td>
                    <td className="px-3 py-2 border border-gray-200 text-xs">{effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm space-y-3">
            <p className="font-semibold text-blue-800">使用例</p>
            <div className="font-mono text-xs text-gray-700 space-y-1 bg-white rounded p-3 border border-blue-100">
              <p className="text-gray-500">// 赤い大きな文字 → 普通の文字</p>
              <p>&lt;c=0&gt;&lt;s=150&gt;GAME OVER&lt;/s&gt;&lt;/c&gt; 続きはここ</p>
              <p className="mt-2 text-gray-500">// 波打ちテキスト</p>
              <p>&lt;wave&gt;ゆらゆら揺れる&lt;/wave&gt;</p>
              <p className="mt-2 text-gray-500">// タイプライター風（80ms ずつ表示）</p>
              <p>&lt;sp=80&gt;ゆっくり表示される文章です&lt;/sp&gt;</p>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold mb-1">⚠️ 制約事項</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>
                <code className="font-mono">&lt;ch=#RRGGBB&gt;</code> は色相を COLOR 値に<strong>近似変換</strong>するため、
                無彩色（白・黒・グレー）スプライトでは期待通りの色にならない場合があります。
                確実な色指定には <code className="font-mono">&lt;c=N&gt;</code>（直接値）を使用してください。
              </li>
              <li>
                同じタグのネスト（例: <code className="font-mono">&lt;c=100&gt;&lt;c=50&gt;…&lt;/c&gt;&lt;/c&gt;</code>）はサポートしていません。
              </li>
              <li>
                タグは必ずペアで使用してください（<code className="font-mono">&lt;br&gt;</code> を除く）。
              </li>
            </ul>
          </div>
        </section>

        {/* §5 Mode 3: コンソールスクリプト式 */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-3 border-b pb-2">
            5. Mode 3 — コンソールスクリプト式（上級者向け）
          </h2>
          <p className="text-gray-700 mb-3">
            Scratch の「<strong>文字表示コンソール</strong>」リストにスクリプトを記述し、
            <code className="font-mono bg-gray-100 px-1 rounded"> __font_console_run</code> ブロックを呼ぶことで実行するモードです。
            最も柔軟な演出が可能で、複数のテキストブロックを一括で制御できます。
          </p>

          <h3 className="text-lg font-semibold text-gray-800 mb-2">スクリプト構文</h3>
          <p className="text-sm text-gray-600 mb-3">
            各行は <code className="font-mono bg-gray-100 px-1 rounded">キー:値</code> の形式で記述します。
            <code className="font-mono bg-gray-100 px-1 rounded">//</code> で始まる行はコメントとして無視されます。
            値にコロン（<code className="font-mono">:</code>）が含まれる場合、最初の <code className="font-mono">:</code> のみが区切りとして扱われます。
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-purple-100 text-purple-900">
                  <th className="px-3 py-2 text-left border border-purple-200">キー</th>
                  <th className="px-3 py-2 text-left border border-purple-200">値</th>
                  <th className="px-3 py-2 text-left border border-purple-200">例</th>
                  <th className="px-3 py-2 text-left border border-purple-200">説明</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {[
                  ["text", "文字列（\\n で改行）", "text:こんにちは\\n世界", "表示するテキスト"],
                  ["x", "整数", "x:-100", "X 座標"],
                  ["y", "整数", "y:50", "Y 座標"],
                  ["size", "整数 %", "size:120", "文字サイズ（100 = 原寸）"],
                  ["color", "0〜200", "color:100", "COLOR エフェクト値"],
                  ["colorHex", "#RRGGBB", "colorHex:#FF0000", "CSS カラー → COLOR 近似変換"],
                  ["ghost", "0〜100", "ghost:50", "GHOST（透明度）エフェクト"],
                  ["brightness", "-100〜100", "brightness:-30", "BRIGHTNESS（明るさ）エフェクト"],
                  ["align", "left / center / right", "align:center", "テキストの水平揃え"],
                  ["anim", "wave / shake / fade / bounce", "anim:wave", "アニメーション種別"],
                  ["animAmp", "整数（デフォルト: 8）", "animAmp:6", "アニメーション振幅"],
                  ["animSpeed", "整数（デフォルト: 5）", "animSpeed:3", "アニメーション速度"],
                  ["typeDelay", "ms（0 = 即時）", "typeDelay:60", "タイプライター表示の待機時間"],
                  ["letterSpacing", "整数 px", "letterSpacing:2", "文字間隔"],
                  ["layer", "整数", "layer:2", "スプライトのレイヤー順"],
                  ["---", "（区切り）", "---", "複数テキストブロックの区切り"],
                ].map(([key, val, example, desc]) => (
                  <tr key={key} className="even:bg-gray-50">
                    <td className="px-3 py-2 border border-gray-200 font-mono text-xs font-semibold">{key}</td>
                    <td className="px-3 py-2 border border-gray-200 text-xs">{val}</td>
                    <td className="px-3 py-2 border border-gray-200 font-mono text-xs">{example}</td>
                    <td className="px-3 py-2 border border-gray-200 text-xs">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm space-y-3">
            <p className="font-semibold text-purple-800">スクリプト例</p>
            <div className="font-mono text-xs text-gray-700 bg-white rounded p-3 border border-purple-100 whitespace-pre">{`// ゲームのスコア画面
text:SCORE
x:80
y:160
size:80
---
text:0000000
x:80
y:130
color:0
letterSpacing:2
---
// タイトルを波打ちアニメーションで表示
text:STAGE CLEAR!
x:0
y:50
align:center
anim:wave
animAmp:10
animSpeed:4`}</div>
          </div>
        </section>

        {/* §6 エクスポート設定 */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-3 border-b pb-2">6. エクスポート設定</h2>

          <div className="space-y-4 text-sm text-gray-700">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-2">コスチューム形式</h3>
              <dl className="space-y-1 text-xs">
                <div className="flex gap-2">
                  <dt className="font-mono font-semibold w-16 shrink-0">SVG</dt>
                  <dd>ベクター形式。ファイルサイズが小さく、拡大縮小してもきれい。<strong>推奨</strong></dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-mono font-semibold w-16 shrink-0">PNG</dt>
                  <dd>ラスター形式。互換性重視の場合に選択</dd>
                </div>
              </dl>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-2">描画方式</h3>
              <dl className="space-y-1 text-xs">
                <div className="flex gap-2">
                  <dt className="font-mono font-semibold w-24 shrink-0">クローン式</dt>
                  <dd>Pen 拡張不要。標準的な方式。<strong>推奨</strong></dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-mono font-semibold w-24 shrink-0">ペン式</dt>
                  <dd>Pen 拡張が必要。高速で長文向け。消去時はステージ全体のペン描画が消えます</dd>
                </div>
              </dl>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-2">Warp（再描画なし実行）</h3>
              <p className="text-xs">
                有効にするとテキスト表示が高速になります（推奨）。
                アニメーション演出（wave / shake など）が必要な場合は<strong>無効</strong>にしてください。
              </p>
            </div>
          </div>
        </section>

        {/* フッター */}
        <div className="text-center text-sm text-gray-500 pt-4 border-t">
          <button
            onClick={onClose}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            ← ツールに戻る
          </button>
        </div>

      </main>
    </div>
  );
}
