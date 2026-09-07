export interface LoadingIndicatorProps {
  label?: string;
  size?: "sm" | "md";
  progress?: number; // 0–100, shows bar when provided
  filename?: string;
}

export function LoadingIndicator({ label, size = "md", progress, filename }: LoadingIndicatorProps) {
  const showProgress = typeof progress === "number" && Number.isFinite(progress);

  return (
    <div className="loading" role="status" aria-live="polite" aria-busy="true">
      <div className={size === "sm" ? "loading__spinner loading__spinner--sm" : "loading__spinner"} aria-hidden="true" />
      {label ? <span className="loading__label">{label}</span> : null}
      {filename ? (
        <span className="loading__label" style={{ fontSize: "var(--text-xs)", wordBreak: "break-all" }}>
          {filename}
        </span>
      ) : null}
      {showProgress ? (
        <>
          <div className="loading__progress" role="progressbar" aria-valuenow={Math.round(progress!)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Upload progress"}>
            <div className="loading__bar" style={{ width: `${Math.min(100, Math.max(0, progress!))}%` }} />
          </div>
          <span className="loading__percent">{Math.round(progress!)}%</span>
        </>
      ) : null}
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}
