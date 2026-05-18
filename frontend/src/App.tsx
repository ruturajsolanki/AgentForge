import { useCallback, useEffect, useState } from "react";
import type { WSEvent } from "./types";
import { useWebSocket } from "./hooks/useWebSocket";
import { browserLLM } from "./services/browserLLM";
import Header from "./components/Header";
import SettingsPanel from "./components/SettingsPanel";
import GenerationPanel from "./components/GenerationPanel";
import IDELayout from "./components/ide/IDELayout";
import DemandPage from "./pages/Demand";
import DemandsList from "./pages/Demands";
import PipelinePage from "./pages/Pipeline";
import BootSplash from "./components/BootSplash";

type View = "demands" | "new-demand" | "pipeline" | "ide";

const EVENT_BUFFER_SIZE = 500;

export default function App() {
  // Show the boot splash if the page was opened with ?boot=1 (set by start.sh)
  // and we haven't already booted in this session.
  const [booting, setBooting] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const wantsBoot = params.get("boot") === "1";
    const already = sessionStorage.getItem("forgeos_booted") === "yes";
    return wantsBoot && !already;
  });

  const dismissBoot = useCallback(() => {
    sessionStorage.setItem("forgeos_booted", "yes");
    // Clean the ?boot=1 out of the URL so reloads don't replay.
    const url = new URL(window.location.href);
    url.searchParams.delete("boot");
    window.history.replaceState({}, "", url.toString());
    setBooting(false);
  }, []);

  const [view, setView] = useState<View>("demands");
  const [activeDemand, setActiveDemand] = useState<string | null>(null);
  const [events, setEvents] = useState<WSEvent[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [genPanelOpen, setGenPanelOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.demo_mode !== undefined) setDemoMode(data.demo_mode);
      })
      .catch(() => {});

    if (browserLLM.savedModelId && !browserLLM.hasModel) {
      browserLLM.autoLoadSavedModel().catch(() => {});
    }
  }, []);

  const handleEvent = useCallback((event: WSEvent) => {
    setEvents((prev) => {
      const next = [...prev, event];
      return next.length > EVENT_BUFFER_SIZE
        ? next.slice(next.length - EVENT_BUFFER_SIZE)
        : next;
    });
    if (event.type === "pipeline.completed") {
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const { connected, wsRef } = useWebSocket(handleEvent);

  const openPipeline = (publicId: string) => {
    setActiveDemand(publicId);
    setEvents([]);
    setView("pipeline");
  };

  const openIDE = (publicId: string) => {
    setActiveDemand(publicId);
    setView("ide");
  };

  const goDemands = () => {
    setActiveDemand(null);
    setRefreshKey((k) => k + 1);
    setView("demands");
  };

  if (booting) {
    return <BootSplash onDone={dismissBoot} />;
  }

  if (view === "ide" && activeDemand) {
    return (
      <>
        <IDELayout
          projectId={activeDemand}
          projectPrompt={activeDemand}
          onBack={goDemands}
          onOpenSettings={() => setSettingsOpen(true)}
          wsRef={wsRef}
        />
        <SettingsPanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onDemoModeChange={setDemoMode}
          onBrowserLLMChange={() => undefined}
          onProviderChange={() => undefined}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header
        connected={connected}
        demoMode={demoMode}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex-1">
        {view === "demands" && (
          <DemandsList
            onSelect={openPipeline}
            onNew={() => setView("new-demand")}
            refreshKey={refreshKey}
          />
        )}
        {view === "new-demand" && (
          <DemandPage
            onApproved={(publicId) => {
              openPipeline(publicId);
            }}
          />
        )}
        {view === "pipeline" && activeDemand && (
          <PipelinePage
            publicId={activeDemand}
            events={events}
            onBack={goDemands}
            onOpenIDE={openIDE}
          />
        )}
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onDemoModeChange={setDemoMode}
        onBrowserLLMChange={() => undefined}
        onProviderChange={() => undefined}
      />
      <GenerationPanel
        open={genPanelOpen}
        onClose={() => setGenPanelOpen(false)}
      />
    </div>
  );
}
