import type { GlyphAsset } from "../../types";
import GlyphCell from "./GlyphCell";

interface Props {
  assets: GlyphAsset[];
}

export default function GlyphGrid({ assets }: Props) {
  if (assets.length === 0) return null;

  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))" }}>
      {assets.map((asset) => (
        <GlyphCell key={asset.char} asset={asset} />
      ))}
    </div>
  );
}
