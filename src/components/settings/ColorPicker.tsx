interface Props {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  nullable?: boolean;
}

export default function ColorPicker({ label, value, onChange, nullable }: Props) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-700 w-24">{label}</span>
      {nullable && (
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={value === null}
            onChange={(e) => onChange(e.target.checked ? null : "#ffffff")}
          />
          透明
        </label>
      )}
      {value !== null && (
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border cursor-pointer"
        />
      )}
      <span className="text-xs text-gray-500">{value ?? "透明"}</span>
    </div>
  );
}
