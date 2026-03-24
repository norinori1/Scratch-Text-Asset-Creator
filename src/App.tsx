import { useState } from "react";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import FontDropZone from "./components/font/FontDropZone";
import FontMetaCard from "./components/font/FontMetaCard";
import CharSetPanel from "./components/charset/CharSetPanel";
import SettingsPanel from "./components/settings/SettingsPanel";
import PreviewPanel from "./components/preview/PreviewPanel";
import ExportPanel from "./components/export/ExportPanel";
import HelpPage from "./components/help/HelpPage";

export default function App() {
  const [showHelp, setShowHelp] = useState(false);

  if (showHelp) {
    return <HelpPage onClose={() => setShowHelp(false)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header onShowHelp={() => setShowHelp(true)} />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <FontDropZone />
            <FontMetaCard />
            <CharSetPanel />
            <SettingsPanel />
          </div>
          <div className="flex flex-col">
            <PreviewPanel />
          </div>
        </div>
        <div className="mt-6">
          <ExportPanel />
        </div>
      </main>
      <Footer />
    </div>
  );
}
