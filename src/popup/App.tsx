import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState, RecentUpload, UploadProgress, UploadResult } from "../shared/types";

import { HomeScreen } from "./screens/HomeScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { CapturingScreen } from "./screens/CapturingScreen";
import { LoadingIndicator } from "./components/LoadingIndicator";
import { Button } from "./components/Button";
import { Toast } from "./components/Toast";
import { useAuth } from "./hooks/useAuth";
import { useScreenshot } from "./hooks/useScreenshot";
import { sanitizeFilename } from "../capture/screenshot";

// ─── Mock data for non-auth states (kept for DoD: all states render) ──────
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

// Whether we're in the real extension runtime (chrome.tabs available). When
// false (vite dev), screenshot uses a mocked data URL so the flow stays testable.
function isExtensionRuntime(): boolean {
  try {
    const c = (globalThis as unknown as { chrome?: { runtime?: { id?: string } } }).chrome;
    return Boolean(c?.runtime?.id);
  } catch {
    return false;
  }
}

// For dev / mock toggling inside the popup — cycles states via keyboard.
const STATE_ORDER: AppState[] = ["AUTH_REQUIRED", "READY", "CAPTURING", "PREVIEW", "UPLOADING", "SUCCESS", "ERROR"];

export default function App() {
  // Auth is now real (chrome.identity via background). No mock delay.
  const { connectedEmail, isChecking, isConnecting, isSigningOut, error: authError, connect, signOut } = useAuth();

  // appState is driven by auth + user actions. While checking auth, show a
  // deterministic loading shell instead of flashing READY.
  const [appStateOverride, setAppStateOverride] = useState<AppState | null>(null);

  const effectiveState: AppState = useMemo(() => {
    if (appStateOverride) return appStateOverride;
    if (isChecking) return "AUTH_REQUIRED"; // will show loading shell; see render
    if (!connectedEmail) return "AUTH_REQUIRED";
    return "READY";
  }, [appStateOverride, isChecking, connectedEmail]);

  // Allow the dev bar and action handlers to override temporarily
  const [appState, setAppState] = useState<AppState>("READY");

  // Keep appState in sync with effectiveState unless user has navigated
  // into CAPTURING/PREVIEW/etc. — those are sticky until dismissed.
  const stickyStates: AppState[] = ["CAPTURING", "PREVIEW", "UPLOADING", "SUCCESS", "ERROR"];
  const displayState: AppState = useMemo(() => {
    if (appStateOverride && stickyStates.includes(appStateOverride)) return appStateOverride;
    if (stickyStates.includes(appState)) {
      // If we're in a sticky capture/upload state, stay there even if auth
      // refetches — but if auth becomes required, force back to auth.
      if (!connectedEmail && !isChecking) return "AUTH_REQUIRED";
      return appState;
    }
    return effectiveState;
  }, [appState, appStateOverride, effectiveState, connectedEmail, isChecking]);

  const setDisplayState = useCallback(
    (next: AppState) => {
      // Clear sticky override when going back to READY
      if (next === "READY") setAppStateOverride(null);
      setAppState(next);
      setAppStateOverride(next);
      // If returning to READY from a sticky state, re-sync to effective
      if (next === "READY") {
        // Let effectiveState take over next tick
        queueMicrotask(() => setAppStateOverride(null));
      }
    },
    [],
  );

  const screenshot = useScreenshot();
  const isCapturingScreenshot = screenshot.isCapturing;

  // Capture error is shown inline on READY or as ERROR state toast
  const captureErrorMessage = screenshot.error?.message;

  // Upload mock (ISSUE-006 will replace with real Drive call)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [resultError, setResultError] = useState<string | undefined>(undefined);
  // Preview data: prefer real screenshot capture; fall back to dev mock when
  // screenshot hasn't been taken yet (so dev bar cycling still has a preview).
  const previewUrl = screenshot.previewUrl ?? MOCK_IMAGE_DATA_URL;
  const previewMime = screenshot.mimeType ?? "image/png";
  const baseFilename = screenshot.filename || `screenshot-${new Date().toISOString().slice(0, 10)}.png`;
  // Editable filename mirrors screenshot.filename but allows ResultScreen to edit
  const [editedFilename, setEditedFilename] = useState<string>(baseFilename);
  useEffect(() => {
    setEditedFilename(baseFilename);
  }, [baseFilename]);
  // Keep editedFilename in sync when screenshot changes during PREVIEW
  const currentFilename = editedFilename;
  const setCurrentFilename = useCallback(
    (name: string) => {
      setEditedFilename(name);
      screenshot.setFilename(name);
    },
    [screenshot],
  );

  const [showDevBar] = useState(true);
  const progressTimerRef = useRef<number | null>(null);

  // Mock upload progress when entering UPLOADING (ISSUE-006 will stream real progress)
  useEffect(() => {
    if (displayState !== "UPLOADING") {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      return;
    }
    setUploadProgress({ percent: 0, filename: currentFilename });
    let p = 0;
    progressTimerRef.current = window.setInterval(() => {
      p = Math.min(100, p + 12 + Math.random() * 10);
      setUploadProgress({ percent: Math.round(p), filename: currentFilename });
      if (p >= 100 && progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }, 320);
    return () => {
      if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current);
    };
  }, [displayState, currentFilename]);

  // Keyboard navigation: Esc closes / goes to READY; Tab order is natural via DOM.
  const handleEsc = useCallback(() => {
    if (displayState === "PREVIEW" || displayState === "SUCCESS" || displayState === "ERROR" || displayState === "CAPTURING" || displayState === "UPLOADING") {
      setDisplayState("READY");
    }
  }, [displayState, setDisplayState]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleEsc();
      }
      // Dev helper: Ctrl/Cmd+Shift+P cycles mock states without needing real backend
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        const idx = STATE_ORDER.indexOf(displayState);
        const next = STATE_ORDER[(idx + 1) % STATE_ORDER.length];
        setDisplayState(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleEsc, displayState, setDisplayState]);

  const headerSubtitle = useMemo(() => {
    switch (displayState) {
      case "AUTH_REQUIRED":
        return isChecking ? "Checking connection…" : "Connect Drive to get started";
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
  }, [displayState, isChecking]);

  const handleConnect = useCallback(async () => {
    const ok = await connect();
    if (ok) setDisplayState("READY");
  }, [connect, setDisplayState]);

  const handleDisconnect = useCallback(async () => {
    await signOut();
    setDisplayState("AUTH_REQUIRED");
  }, [signOut, setDisplayState]);

  const handleScreenshot = useCallback(async () => {
    // Outside extension runtime (vite dev): jump straight to PREVIEW with mock
    if (!isExtensionRuntime()) {
      // Synthesize a preview without calling chrome.tabs
      const sanitized = sanitizeFilename(`screenshot-${new Date().toISOString().slice(0, 10)}.png`);
      screenshot.setFilename(sanitized);
      // Force previewUrl via the hook by seeding it with mock data URL as if captured
      // The hook doesn't expose a seed; we just navigate to PREVIEW with mock URL.
      // Do not call screenshot.capture() outside runtime — it would fail with
      // RUNTIME_UNAVAILABLE. Instead, enter PREVIEW with mock data.
      setEditedFilename(sanitized);
      setDisplayState("PREVIEW");
      return;
    }
    const ok = await screenshot.capture();
    if (ok) {
      // Sync edited filename with captured filename
      setEditedFilename(screenshot.filename || baseFilename);
      setResultError(undefined);
      setUploadResult(null);
      setDisplayState("PREVIEW");
    } else {
      // Capture failed — stay on READY and surface error via toast (no raw exception)
      // The hook's error is displayed via captureErrorMessage below.
      // If the error is restricted-page, it already has an actionable message.
    }
  }, [screenshot, baseFilename, setDisplayState]);

  const handleRetryScreenshot = useCallback(async () => {
    screenshot.clearError();
    setResultError(undefined);
    await handleScreenshot();
  }, [screenshot, handleScreenshot]);

  const handleRecord = useCallback(() => {
    setDisplayState("CAPTURING");
  }, [setDisplayState]);

  const handleSave = useCallback(
    (name: string) => {
      const sanitized = sanitizeFilename(name);
      setEditedFilename(sanitized);
      screenshot.setFilename(sanitized);
      setDisplayState("UPLOADING");
      // ISSUE-006 will perform real upload here. For now simulate success while
      // retaining the blob so retry keeps the capture (don't clear screenshot).
      window.setTimeout(() => {
        setUploadResult({
          driveFileId: "mock-file-id",
          webViewLink: "https://drive.google.com/file/d/mock-file-id/view",
          name: sanitized,
        });
        setResultError(undefined);
        setDisplayState("SUCCESS");
      }, 1800);
    },
    [setDisplayState, screenshot],
  );

  // Keep EditedFilename synced after capture resolves (async state propagation)
  useEffect(() => {
    if (screenshot.filename && displayState === "PREVIEW") {
      setEditedFilename(screenshot.filename);
    }
  }, [screenshot.filename, displayState]);

  const authErrorMessage = authError ? authError.message : undefined;

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
          {isChecking ? "…" : displayState}
        </span>
      </header>

      {/* Dev state switcher — satisfies "All states render without real API (mock props)" DoD */}
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
              onClick={() => setDisplayState(s)}
              aria-pressed={displayState === s}
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
                background: displayState === s ? "var(--accent)" : "var(--surface-2)",
                color: displayState === s ? "var(--accent-text)" : "var(--muted)",
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <main id="main-content">
        {isChecking ? (
          <div className="popup__body" style={{ alignItems: "center", gap: "var(--space-4)" }}>
            <LoadingIndicator label="Checking Google Drive connection" />
          </div>
        ) : displayState === "AUTH_REQUIRED" ? (
          <AuthScreen onConnect={handleConnect} loading={isConnecting} errorMessage={authErrorMessage} />
        ) : null}

        {!isChecking && displayState === "READY" ? (
          isCapturingScreenshot ? (
            <div className="popup__body" style={{ alignItems: "center", gap: "var(--space-4)" }}>
              <LoadingIndicator label="Capturing screenshot" />
            </div>
          ) : (
            <>
              {captureErrorMessage ? (
                <div style={{ padding: "8px 12px 0" }}>
                  <Toast
                    variant="error"
                    title="Screenshot failed"
                    message={captureErrorMessage}
                    onDismiss={() => screenshot.clearError()}
                    actions={
                      <Button size="sm" variant="secondary" onClick={handleRetryScreenshot}>
                        Try again
                      </Button>
                    }
                  />
                </div>
              ) : null}
              <HomeScreen
                connectedEmail={connectedEmail}
                recentUploads={MOCK_RECENT}
                onScreenshot={handleScreenshot}
                onRecord={handleRecord}
                onDisconnect={handleDisconnect}
                isSigningOut={isSigningOut}
                onOpenSettings={() => {}}
                onOpenRecent={(item) => {
                  if (item.webViewLink) window.open(item.webViewLink, "_blank", "noreferrer");
                }}
              />
            </>
          )
        ) : null}

        {displayState === "CAPTURING" && (
          <CapturingScreen
            sourceLabel="Current tab"
            audioLabel="System + Microphone (mock)"
            onStop={() => {
              setDisplayState("PREVIEW");
            }}
            onCancel={() => setDisplayState("READY")}
          />
        )}

        {displayState === "PREVIEW" && (
          <ResultScreen
            mode="preview"
            previewUrl={previewUrl}
            mimeType={previewMime}
            initialFilename={currentFilename}
            onFilenameChange={setCurrentFilename}
            onSave={handleSave}
            onDone={() => {
              screenshot.clear();
              setResultError(undefined);
              setDisplayState("READY");
            }}
            onOpenInDrive={() => {
              if (uploadResult?.webViewLink) window.open(uploadResult.webViewLink, "_blank", "noreferrer");
            }}
          />
        )}

        {displayState === "UPLOADING" && (
          <ResultScreen
            mode="uploading"
            previewUrl={previewUrl}
            mimeType={previewMime}
            initialFilename={currentFilename}
            onSave={handleSave}
            onDone={() => {
              // Keep blob so upload can be retried from ERROR
              setDisplayState("READY");
            }}
            uploadProgress={uploadProgress}
            uploadResult={null}
          />
        )}

        {displayState === "SUCCESS" && (
          <ResultScreen
            mode="success"
            previewUrl={previewUrl}
            mimeType={previewMime}
            initialFilename={uploadResult?.name ?? currentFilename}
            onSave={handleSave}
            onDone={() => {
              screenshot.clear();
              setEditedFilename(baseFilename);
              setDisplayState("READY");
            }}
            uploadResult={uploadResult}
            onOpenInDrive={() => {
              if (uploadResult?.webViewLink) window.open(uploadResult.webViewLink, "_blank", "noreferrer");
            }}
          />
        )}

        {displayState === "ERROR" && (
          <ResultScreen
            mode="error"
            previewUrl={previewUrl}
            mimeType={previewMime}
            initialFilename={currentFilename}
            onFilenameChange={setCurrentFilename}
            onSave={handleSave}
            onDone={() => {
              screenshot.clear();
              setResultError(undefined);
              setDisplayState("READY");
            }}
            onRetry={() => {
              setResultError(undefined);
              setDisplayState("UPLOADING");
            }}
            errorMessage={resultError ?? captureErrorMessage ?? undefined}
          />
        )}

        {/* Loading fallback for any transient state without dedicated screen */}
        {!isChecking &&
          displayState !== "AUTH_REQUIRED" &&
          displayState !== "READY" &&
          displayState !== "CAPTURING" &&
          displayState !== "PREVIEW" &&
          displayState !== "UPLOADING" &&
          displayState !== "SUCCESS" &&
          displayState !== "ERROR" && <LoadingIndicator label="Loading" />}
      </main>

      <footer className="popup__footer">
        <span className="badge">MV3 · v0.1.0</span>
        <span className="hint" style={{ fontSize: "var(--text-xs)" }}>
          Tab · Enter · Esc
        </span>
      </footer>

      {/* Live region for screen readers on state change */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {displayState}
      </div>

      <p className="sr-only">Tip: press Ctrl+Shift+P (or Cmd+Shift+P) to cycle mock states.</p>
    </div>
  );
}
