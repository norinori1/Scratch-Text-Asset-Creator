import type { GlyphAsset } from "../../types";

interface Props {
  asset: GlyphAsset;
}

export default function GlyphCell({ asset }: Props) {
  return (
    <div className="flex flex-col items-center border border-gray-100 rounded p-1 bg-gray-50 hover:bg-indigo-50 transition-colors">
      <img
        src={asset.pngDataUrl}
        alt={asset.char}
        className="max-w-[64px] max-h-[64px] object-contain"
        style={{ imageRendering: "pixelated" }}
      />
      <span className="text-xs text-gray-500 mt-1 font-mono">{asset.char === " " ? "SP" : asset.char}</span>
    </div>
  );
}
