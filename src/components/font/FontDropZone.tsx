import { useRef, useState } from "react";
import { loadFontFromFile } from "../../core/FontLoader";
import { useAppStore } from "../../store/appStore";

export default function FontDropZone() {
  const setFont = useAppStore((s) => s.setFont);
  const fontFileName = useAppStore((s) => s.fontFileName);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      const font = await loadFontFromFile(file);
      setFont(font, file.name);
    } catch {
      setError("フォントの読み込みに失敗しました。TTF/OTF ファイルを確認してください。");
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
        ${dragging ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-indigo-400 bg-white"}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".ttf,.otf"
        className="hidden"
        onChange={onFileChange}
      />
      {fontFileName ? (
        <p className="text-indigo-700 font-semibold">✅ {fontFileName}</p>
      ) : (
        <>
          <p className="text-4xl mb-2">🖋</p>
          <p className="text-gray-600 font-medium">フォントファイルをドロップ</p>
          <p className="text-gray-400 text-sm mt-1">または クリックして選択（.ttf / .otf）</p>
        </>
      )}
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}
