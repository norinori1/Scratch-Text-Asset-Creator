/**
 * Mode 2 Rich Text Inline Settings
 * タグ一覧ヘルプ・プリプロセス設定 (§15-B)
 */
export function Mode2RichTextSettings() {
  return (
    <div className="mt-2 space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
      <h4 className="font-semibold text-blue-800">使用できるタグ一覧</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-blue-100 text-blue-900">
              <th className="px-2 py-1 text-left border border-blue-200">タグ</th>
              <th className="px-2 py-1 text-left border border-blue-200">引数</th>
              <th className="px-2 py-1 text-left border border-blue-200">例</th>
              <th className="px-2 py-1 text-left border border-blue-200">効果</th>
            </tr>
          </thead>
          <tbody className="text-gray-700">
            <tr>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;c=N&gt;</td>
              <td className="px-2 py-1 border border-blue-200">整数 0〜200</td>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;c=100&gt;テキスト&lt;/c&gt;</td>
              <td className="px-2 py-1 border border-blue-200">COLOR エフェクト値を直接指定</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;ch=#RRGGBB&gt;</td>
              <td className="px-2 py-1 border border-blue-200">CSS カラー</td>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;ch=#FF0000&gt;テキスト&lt;/ch&gt;</td>
              <td className="px-2 py-1 border border-blue-200">CSS カラー → COLOR 近似変換</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;s=N&gt;</td>
              <td className="px-2 py-1 border border-blue-200">整数 %</td>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;s=200&gt;大きい&lt;/s&gt;</td>
              <td className="px-2 py-1 border border-blue-200">サイズ変更</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;g=N&gt;</td>
              <td className="px-2 py-1 border border-blue-200">整数 0〜100</td>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;g=50&gt;半透明&lt;/g&gt;</td>
              <td className="px-2 py-1 border border-blue-200">GHOST エフェクト</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;b=N&gt;</td>
              <td className="px-2 py-1 border border-blue-200">整数 -100〜100</td>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;b=-50&gt;暗く&lt;/b&gt;</td>
              <td className="px-2 py-1 border border-blue-200">BRIGHTNESS エフェクト</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;wave&gt;</td>
              <td className="px-2 py-1 border border-blue-200">なし</td>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;wave&gt;ゆらゆら&lt;/wave&gt;</td>
              <td className="px-2 py-1 border border-blue-200">波打ちアニメーション</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;shake&gt;</td>
              <td className="px-2 py-1 border border-blue-200">なし</td>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;shake&gt;ふるふる&lt;/shake&gt;</td>
              <td className="px-2 py-1 border border-blue-200">振動アニメーション</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;sp=N&gt;</td>
              <td className="px-2 py-1 border border-blue-200">整数 ms</td>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;sp=80&gt;ゆっくり&lt;/sp&gt;</td>
              <td className="px-2 py-1 border border-blue-200">タイプライター速度上書き</td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;br&gt;</td>
              <td className="px-2 py-1 border border-blue-200">なし</td>
              <td className="px-2 py-1 border border-blue-200 font-mono">&lt;br&gt;</td>
              <td className="px-2 py-1 border border-blue-200">改行（閉じタグ不要）</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <span className="font-semibold">⚠️ 制約:</span>{" "}
        <code className="font-mono">&lt;ch=#RRGGBB&gt;</code> は色相を COLOR 値に<strong>近似変換</strong>するため、
        無彩色（白・黒・グレー）スプライトでは期待通りの色になりません。
        確実な色指定には <code className="font-mono">&lt;c=N&gt;</code>（直接値）を使用してください。
        また、同じタグのネスト（例: <code className="font-mono">&lt;c=100&gt;&lt;c=50&gt;…&lt;/c&gt;&lt;/c&gt;</code>）はサポートしていません。
      </div>
    </div>
  );
}
