interface HeaderProps {
  onShowHelp: () => void;
}

export default function Header({ onShowHelp }: HeaderProps) {
  return (
    <header className="bg-indigo-700 text-white px-6 py-4 flex items-center justify-between shadow-md">
      <div>
        <h1 className="text-xl font-bold">🎨 Scratch Font Asset Creator</h1>
        <p className="text-indigo-200 text-sm">フォントから Scratch 3.0 用のテキスト素材を生成</p>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onShowHelp}
          className="text-indigo-200 hover:text-white text-sm underline"
        >
          📖 使い方
        </button>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-200 hover:text-white text-sm underline"
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
