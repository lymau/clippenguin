import type { ReactNode } from "react";

export type ToastVariant = "error" | "success" | "info" | "warning";

export interface ToastProps {
  variant?: ToastVariant;
  title: string;
  message?: string;
  actions?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}

const ICON: Record<ToastVariant, string> = {
  error: "⛔",
  success: "✅",
  info: "ℹ️",
  warning: "⚠️",
};

export function Toast({ variant = "info", title, message, actions, onDismiss, dismissLabel = "Dismiss" }: ToastProps) {
  return (
    <div className={`toast toast--${variant}`} role={variant === "error" ? "alert" : "status"} aria-live={variant === "error" ? "assertive" : "polite"}>
      <span className="toast__icon" aria-hidden="true">
        {ICON[variant]}
      </span>
      <div className="toast__body">
        <p className="toast__title">{title}</p>
        {message ? <p className="toast__message">{message}</p> : null}
        {actions ? <div className="toast__actions">{actions}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="toast__dismiss" onClick={onDismiss} aria-label={dismissLabel}>
          ✕
        </button>
      ) : null}
    </div>
  );
}

// Convenience: inline error block used inside screens
export function ErrorBlock({
  title = "Something went wrong",
  message,
  onRetry,
  onDismiss,
  retryLabel = "Retry",
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryLabel?: string;
}) {
  return (
    <Toast
      variant="error"
      title={title}
      message={message}
      onDismiss={onDismiss}
      actions={
        onRetry ? (
          <button type="button" className="btn btn--sm btn--secondary" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : undefined
      }
    />
  );
}
