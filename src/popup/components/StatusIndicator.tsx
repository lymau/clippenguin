export type StatusVariant = "default" | "connected" | "recording" | "uploading" | "error" | "success";

export interface StatusIndicatorProps {
  variant?: StatusVariant;
  label: string;
  pulse?: boolean;
}

const VARIANT_CLASS: Record<StatusVariant, string> = {
  default: "",
  connected: "status--connected",
  recording: "status--recording",
  uploading: "status--uploading",
  error: "status--error",
  success: "status--connected",
};

export function StatusIndicator({ variant = "default", label }: StatusIndicatorProps) {
  const cls = ["status", VARIANT_CLASS[variant]].filter(Boolean).join(" ");

  return (
    <span className={cls} role="status" aria-live="polite">
      <span className="status__dot" aria-hidden="true" />
      <span className="status__label">{label}</span>
    </span>
  );
}
