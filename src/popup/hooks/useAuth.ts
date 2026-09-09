// Clippenguin — Popup auth hook
// Wraps chrome.runtime messaging for AUTH_* with local state.
// Never holds or logs tokens — only the connected email.

import { useCallback, useEffect, useState } from "react";
import type { AppError } from "../../shared/types";
import { sendMessage } from "../../shared/messages";

export interface UseAuthReturn {
  connectedEmail: string | undefined;
  isChecking: boolean;
  isConnecting: boolean;
  isSigningOut: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
  connect: () => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(): UseAuthReturn {
  const [connectedEmail, setConnectedEmail] = useState<string | undefined>(undefined);
  const [isChecking, setIsChecking] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const refresh = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await sendMessage({ type: "AUTH_GET_STATE" });
      if (res.ok && "email" in res && typeof (res as { email?: string }).email === "string") {
        const email = (res as { email?: string }).email as string;
        setConnectedEmail(email || undefined);
      } else if (res.ok) {
        // Not connected — treat as no email, not an error
        setConnectedEmail(undefined);
      } else {
        // Unexpected error from background on GET_STATE — don't crash
        setConnectedEmail(undefined);
      }
    } catch {
      // Running outside extension context (vite dev) — stay disconnected
      setConnectedEmail(undefined);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true);
    setError(null);
    try {
      const res = await sendMessage({ type: "AUTH_GET_TOKEN", interactive: true });
      if (res.ok && "email" in res) {
        const email = (res as { email?: string }).email as string | undefined;
        if (email) setConnectedEmail(email);
        else await refresh();
        return true;
      }
      const appErr = (res as { ok: false; error: AppError }).error;
      setError(appErr);
      return false;
    } catch (err) {
      const fallback = err instanceof Error ? err.message : String(err);
      // Outside extension context — show friendly message, don't crash
      setError({
        code: "RUNTIME_UNAVAILABLE",
        message: "Extension runtime is not available. Open the popup from chrome://extensions.",
        details: fallback,
        recoverable: true,
      });
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    setIsSigningOut(true);
    setError(null);
    try {
      const res = await sendMessage({ type: "AUTH_SIGN_OUT" });
      if (!res.ok) {
        const appErr = (res as { ok: false; error: AppError }).error;
        setError(appErr);
        return;
      }
      setConnectedEmail(undefined);
    } catch (err) {
      const fallback = err instanceof Error ? err.message : String(err);
      setError({
        code: "SIGN_OUT_FAILED",
        message: "Could not disconnect. Please try again.",
        details: fallback,
        recoverable: true,
      });
    } finally {
      setIsSigningOut(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { connectedEmail, isChecking, isConnecting, isSigningOut, error, refresh, connect, signOut, clearError };
}
