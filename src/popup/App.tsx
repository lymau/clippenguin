import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState, RecentUpload, UploadProgress, UploadResult } from "../shared/types";

import { HomeScreen } from "./screens/HomeScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { CapturingScreen } from "./screens/CapturingScreen";
import { LoadingIndicator } from "./components/LoadingIndicator";

// ─── Mock data for DoD: all states render without real API ────────────
const MOCK_RECENT: RecentUpload[] = [
  {
    id: "r1",
    name: "screenshot-2026-09-07.png",
    mimeType: "image/png",
    driveFileId: "mock1",
    webViewLink: "https://drive.google.com/file/d/mock1/view",
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: "r2",
    name: "demo-recording.webm",
    mimeType: "video/webm",
    driveFileId: "mock2",
    webViewLink: "https://drive.google.com/file/d/mock2/view",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
];

const MOCK_IMAGE_DATA_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400' viewBox='0 0 640 400'><rect width='640' height='400' rx='12' fill='#1e293b'/><rect x='24' y='24' width='592' height='32' rx='8' fill='#334155'/><text x='50%' y='52%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='18' fill='#94a3b8'>Screenshot preview (mock)</text></svg>`,
  );

// For dev / mock toggling inside the popup — cycles states via keyboard.
const STATE_ORDER: AppState[] = ["AUTH_REQUIRED", "READY", "CAPTURING", "PREVIEW", "UPLOADING", "SUCCESS", "ERROR"];

export default function App() {
  const [appState, setAppState] = useState<AppState>("READY");
  const [connectedEmail] = useState<string | undefined>("you@example.com");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>(undefined);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadResult] = useState<UploadResult | null>({
    driveFileId: "mock-file-id",
    webViewLink: "https://drive.google.com/file/d/mock-file-id/view",
    name: "clippenguin-2026-09-07-123456.png",
  });
  const [resultError] = useState<string | undefined>("Network error. Your capture is still available — try again.");
  const [filename, setFilename] = useState("clippenguin-2026-09-07-123456.png");
  const [previewUrl] = useState<string>(MOCK_IMAGE_DATA_URL);
  const [previewMime] = useState<string>("image/png");
  const [showDevBar] = useState(true);
  const progressTimerRef = useRef<number | null>(null);

  // Mock upload progress when entering UPLOADING
  useEffect(() => {
    if (appState !== "UPLOADING") {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      return;
    }
    setUploadProgress({ percent: 0, filename });
    let p = 0;
    progressTimerRef.current = window.setInterval(() => {
      p = Math.min(100, p + 12 + Math.random() * 10);
      setUploadProgress({ percent: Math.round(p), filename });
      if (p >= 100 && progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }, 320);
    return () => {
      if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current);
    };
  }, [appState, filename]);

  // Keyboard navigation: Esc closes / goes to READY; Tab order is natural via DOM.
  const handleEsc = useCallback(() => {
    if (appState === "PREVIEW" || appState === "SUCCESS" || appState === "ERROR" || appState === "CAPTURING" || appState === "UPLOADING") {
      setAppState("READY");
    }
  }, [appState]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleEsc();
      }
      // Dev helper: Ctrl/Cmd+Shift+P cycles mock states without needing real backend
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setAppState((prev) => {
          const idx = STATE_ORDER.indexOf(prev);
          return STATE_ORDER[(idx + 1) % STATE_ORDER.length];
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleEsc]);

  const headerSubtitle = useMemo(() => {
    switch (appState) {
      case "AUTH_REQUIRED":
        return "Connect Drive to get started";
      case "READY":
        return "Screen capture to Drive";
      case "CAPTURING":
        return "Recording in progress";
      case "PREVIEW":
        return "Review before upload";
      case "UPLOADING":
        return "Uploading to Google Drive";
      case "SUCCESS":
        return "All done";
      case "ERROR":
        return "Something needs attention";
      default:
        return "";
    }
  }, [appState]);

  const handleConnect = useCallback(() => {
    setAuthLoading(true);
    setAuthError(undefined);
    // Mock: succeed after short delay; replace with real chrome.identity flow in ISSUE-003
    window.setTimeout(() => {
      setAuthLoading(false);
      setAppState("READY");
    }, 900);
  }, []);

  const handleScreenshot = useCallback(() => {
    // Mock: go to preview with a fake image. ISSUE-004 replaces with real capture.
    setFilename(`screenshot-${new Date().toISOString().slice(0, 10)}.png`);
    setAppState("PREVIEW");
  }, []);

  const handleRecord = useCallback(() => {
    setAppState("CAPTURING");
  }, []);

  const handleSave = useCallback(
    (name: string) => {
      setFilename(name);
      setAppState("UPLOADING");
      // Mock: auto-advance to SUCCESS after progress completes. Real upload in ISSUE-006.
      window.setTimeout(() => setAppState("SUCCESS"), 2400);
    },
    [],
  );

  return (
    <div className="popup">
      <header className="popup__header">
        <div className="popup__logo" aria-hidden="true">
          🐧
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="popup__title">Clippenguin</h1>
          <p className="popup__subtitle">{headerSubtitle}</p>
        </div>
        <span className="badge" aria-label="App state">
          {appState}
        </span>
      </header>

      {/* Dev state switcher — satisfies "All states render without real API (mock props)" DoD; hidden in prod if desired */}
      {showDevBar && (
        <div
          role="toolbar"
          aria-label="Preview app states (mock)"
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            overflowX: "auto",
            scrollbarWidth: "thin",
          }}
        >
          {STATE_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setAppState(s)}
              aria-pressed={appState === s}
              aria-label={`Show ${s} state`}
              style={{
                flexShrink: 0,
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                padding: "4px 8px",
                borderRadius: "999px",
                border: "1px solid var(--border)",
                background: appState === s ? "var(--accent)" : "var(--surface-2)",
                color: appState === s ? "var(--accent-text)" : "var(--muted)",
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <main id="main-content">
        {appState === "AUTH_REQUIRED" && <AuthScreen onConnect={handleConnect} loading={authLoading} errorMessage={authError} />}

        {appState === "READY" && (
          <HomeScreen
            connectedEmail={connectedEmail}
            recentUploads={MOCK_RECENT}
            onScreenshot={handleScreenshot}
            onRecord={handleRecord}
            onOpenSettings={() => {
              // placeholder — settings screen lands later; keep keyboard reachable
            }}
            onOpenRecent={(item) => {
              if (item.webViewLink) window.open(item.webViewLink, "_blank", "noreferrer");
            }}
          />
        )}

        {appState === "CAPTURING" && (
          <CapturingScreen
            sourceLabel="Current tab"
            audioLabel="System + Microphone (mock)"
            onStop={() => {
              setAppState("PREVIEW");
            }}
            onCancel={() => setAppState("READY")}
          />
        )}

        {appState === "PREVIEW" && (
          <ResultScreen
            mode="preview"
            previewUrl={previewUrl}
            mimeType={previewMime}
            initialFilename={filename}
            onFilenameChange={setFilename}
            onSave={handleSave}
            onDone={() => setAppState("READY")}
            onOpenInDrive={() => {
              if (uploadResult?.webViewLink) window.open(uploadResult.webViewLink, "_blank", "noreferrer");
            }}
          />
        )}

        {appState === "UPLOADING" && (
          <ResultScreen
            mode="uploading"
            previewUrl={previewUrl}
            mimeType={previewMime}
            initialFilename={filename}
            onSave={handleSave}
            onDone={() => setAppState("READY")}
            uploadProgress={uploadProgress}
            uploadResult={null}
          />
        )}

        {appState === "SUCCESS" && (
          <ResultScreen
            mode="success"
            previewUrl={previewUrl}
            mimeType={previewMime}
            initialFilename={uploadResult?.name ?? filename}
            onSave={handleSave}
            onDone={() => setAppState("READY")}
            uploadResult={uploadResult}
            onOpenInDrive={() => {
              if (uploadResult?.webViewLink) window.open(uploadResult.webViewLink, "_blank", "noreferrer");
            }}
          />
        )}

        {appState === "ERROR" && (
          <ResultScreen
            mode="error"
            previewUrl={previewUrl}
            mimeType={previewMime}
            initialFilename={filename}
            onFilenameChange={setFilename}
            onSave={handleSave}
            onDone={() => setAppState("READY")}
            onRetry={() => setAppState("UPLOADING")}
            errorMessage={resultError}
          />
        )}

        {/* Loading fallback for any transient state without dedicated screen */}
        {appState !== "AUTH_REQUIRED" &&
          appState !== "READY" &&
          appState !== "CAPTURING" &&
          appState !== "PREVIEW" &&
          appState !== "UPLOADING" &&
          appState !== "SUCCESS" &&
          appState !== "ERROR" && <LoadingIndicator label="Loading" />}
      </main>

      <footer className="popup__footer">
        <span className="badge">MV3 · v0.1.0</span>
        <span className="hint" style={{ fontSize: "var(--text-xs)" }}>
          Tab · Enter · Esc
        </span>
      </footer>

      {/* Live region for screen readers on state change */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {appState}
      </div>

      {/* Optional hint for manual testers */}
      <p className="sr-only">Tip: press Ctrl+Shift+P (or Cmd+Shift+P) to cycle mock states.</p>
    </div>
  );
}
