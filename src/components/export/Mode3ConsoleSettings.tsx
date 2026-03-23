/**
 * Mode 3 Console Script Settings
 * 構文リファレンス表示 (§15-C)
 */
export function Mode3ConsoleSettings() {
  return (
    <div className="mt-2 space-y-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">
      <h4 className="font-semibold text-purple-800">コンソールスクリプト構文リファレンス</h4>
      <p className="text-xs text-gray-600">
        Scratch の「<strong>文字表示コンソール</strong>」リストにスクリプトを書いて
        <code className="font-mono"> __font_console_run</code> ブロックを呼ぶと実行されます。
        各行は <code className="font-mono">キー:値</code> の形式です。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-purple-100 text-purple-900">
              <th className="px-2 py-1 text-left border border-purple-200">キー</th>
              <th className="px-2 py-1 text-left border border-purple-200">値</th>
              <th className="px-2 py-1 text-left border border-purple-200">例</th>
            </tr>
          </thead>
          <tbody className="text-gray-700">
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">text</td>
              <td className="px-2 py-1 border border-purple-200">文字列 (\n で改行)</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">text:こんにちは</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">x / y</td>
              <td className="px-2 py-1 border border-purple-200">整数</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">x:-100</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">size</td>
              <td className="px-2 py-1 border border-purple-200">整数 %</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">size:120</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">color</td>
              <td className="px-2 py-1 border border-purple-200">0〜200</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">color:100</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">colorHex</td>
              <td className="px-2 py-1 border border-purple-200">#RRGGBB</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">colorHex:#FF0000</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">ghost</td>
              <td className="px-2 py-1 border border-purple-200">0〜100</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">ghost:50</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">brightness</td>
              <td className="px-2 py-1 border border-purple-200">-100〜100</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">brightness:-30</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">align</td>
              <td className="px-2 py-1 border border-purple-200">left / center / right</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">align:center</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">anim</td>
              <td className="px-2 py-1 border border-purple-200">wave / shake / fade / bounce</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">anim:wave</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">animAmp</td>
              <td className="px-2 py-1 border border-purple-200">整数（デフォルト: 8）</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">animAmp:6</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">animSpeed</td>
              <td className="px-2 py-1 border border-purple-200">整数（デフォルト: 5）</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">animSpeed:3</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">typeDelay</td>
              <td className="px-2 py-1 border border-purple-200">ms（0 = 即時）</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">typeDelay:60</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">letterSpacing</td>
              <td className="px-2 py-1 border border-purple-200">整数 px</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">letterSpacing:2</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono">layer</td>
              <td className="px-2 py-1 border border-purple-200">整数</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">layer:2</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-purple-200 font-mono font-semibold">---</td>
              <td className="px-2 py-1 border border-purple-200 italic text-gray-500">（区切り）</td>
              <td className="px-2 py-1 border border-purple-200 font-mono">---</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="rounded-md border border-purple-200 bg-white px-3 py-2 text-xs text-gray-600">
        <p className="font-semibold text-gray-700 mb-1">サンプル</p>
        <pre className="font-mono whitespace-pre-wrap text-xs leading-relaxed">{`// スコア表示
text:SCORE
x:80
y:160
size:80
---
text:0000000
x:80
y:130
color:0
letterSpacing:2`}</pre>
      </div>
      <p className="text-xs text-gray-500">
        <code className="font-mono">//</code> から始まる行はコメントとして無視されます。
        値にコロン（<code className="font-mono">:</code>）が含まれる場合、最初の <code className="font-mono">:</code> のみが区切りとして扱われます。
      </p>
    </div>
  );
}
