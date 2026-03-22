import { useAppStore } from "../../store/appStore";

export default function FontMetaCard() {
  const font = useAppStore((s) => s.font);
  if (!font) return null;

  const names = font.names as unknown as Record<string, { en?: string }>;
  const familyName = names.fontFamily?.en ?? "Unknown";
  const subFamily = names.fontSubfamily?.en ?? "";

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm">
      <p className="font-semibold text-indigo-800">{familyName} {subFamily}</p>
      <p className="text-indigo-600">unitsPerEm: {font.unitsPerEm}</p>
    </div>
  );
}
