import { useEffect, useState } from "react";
import { StatusIndicator } from "../components/StatusIndicator";
import { Button } from "../components/Button";

export interface CapturingScreenProps {
  elapsedMs?: number;
  sourceLabel?: string;
  audioLabel?: string;
  onStop: () => void;
  onCancel?: () => void;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function CapturingScreen({ elapsedMs: controlledElapsed, sourceLabel, audioLabel, onStop, onCancel }: CapturingScreenProps) {
  const [elapsed, setElapsed] = useState(controlledElapsed ?? 0);

  useEffect(() => {
    if (typeof controlledElapsed === "number") {
      setElapsed(controlledElapsed);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - t0), 250);
    return () => window.clearInterval(id);
  }, [controlledElapsed]);

  return (
    <div className="popup__body" style={{ alignItems: "center", textAlign: "center", gap: "var(--space-5)" }}>
      <StatusIndicator variant="recording" label="Recording" />

      <div>
        <div className="timer__label">Elapsed</div>
        <div className="timer" role="timer" aria-live="off" aria-label={`Recording elapsed ${formatElapsed(elapsed)}`}>
          {formatElapsed(elapsed)}
        </div>
      </div>

      {(sourceLabel || audioLabel) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          {sourceLabel ? (
            <span className="text-sm-muted" aria-label={`Source ${sourceLabel}`}>
              Source: {sourceLabel}
            </span>
          ) : null}
          {audioLabel ? <span className="text-sm-muted">Audio: {audioLabel}</span> : null}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", width: "100%" }}>
        <Button variant="danger" fullWidth size="lg" onClick={onStop} aria-label="Stop recording">
          Stop
        </Button>
        {onCancel ? (
          <Button variant="ghost" fullWidth onClick={onCancel} aria-label="Cancel recording">
            Cancel
          </Button>
        ) : null}
      </div>

      <p className="hint">Press Esc or click Stop to end recording. The preview will appear before upload.</p>
    </div>
  );
}
