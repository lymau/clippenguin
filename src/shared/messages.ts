// Clippenguin — Centralized typed runtime messages
// Spec ref: issue.md §16 Messaging, ISSUE-003 tasks
//
// Single source of truth for chrome.runtime messages. All call sites should
// import from here instead of scattering string literals.

import type { AppError, ExtensionSettings, RecentUpload, UploadResult, AppState } from "./types";

// ─── Message union ────────────────────────────────────────────────────────

export type Message =
  | { type: "AUTH_GET_TOKEN"; interactive?: boolean }
  | { type: "AUTH_SIGN_OUT" }
  | { type: "AUTH_GET_STATE" }
  | { type: "SCREENSHOT_CAPTURE" }
  | { type: "RECORDING_START"; audioMode?: ExtensionSettings["preferredAudioMode"] }
  | { type: "RECORDING_STOP" }
  | { type: "UPLOAD_FILE"; payload: { blob: Blob; filename: string; mimeType: string } }
  | { type: "PING"; at: number }
  | { type: "GET_STATE" }
  | { type: "GET_RECENT_UPLOADS" };

// Successful responses are keyed by message type via discriminated helper,
// but we keep a broad MessageResponse for backwards compatibility with
// existing screens that only check `ok`.
export type MessageResponse =
  | { ok: true; echo?: unknown; state?: AppState; recentUploads?: RecentUpload[]; email?: string; result?: UploadResult }
  | { ok: false; error: AppError };

// Narrow helpers for auth
export type AuthGetTokenResponse =
  | { ok: true; email: string }
  | { ok: false; error: AppError };

export type AuthSignOutResponse =
  | { ok: true }
  | { ok: false; error: AppError };

// ─── Runtime helper ──────────────────────────────────────────────────────

/**
 * Typed wrapper around chrome.runtime.sendMessage.
 * Falls back to a rejected promise when the extension runtime is unavailable
 * (e.g. running via `vite dev` outside the extension context).
 */
export function sendMessage<M extends Message>(message: M): Promise<MessageResponse> {
  return new Promise((resolve, reject) => {
    try {
      const runtime = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.runtime;
      if (!runtime?.sendMessage) {
        reject(new Error("Extension runtime not available (are you running inside the extension?)"));
        return;
      }
      runtime.sendMessage(message, (response: MessageResponse | undefined) => {
        const lastError = runtime.lastError ?? (globalThis as unknown as { chrome?: { runtime: { lastError?: { message?: string } } } }).chrome?.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message ?? "Unknown runtime error"));
          return;
        }
        // MV3: if no listener responded, response is undefined — treat as error
        if (response === undefined) {
          reject(new Error("No response from background service worker"));
          return;
        }
        resolve(response);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

// Convenience wrappers for auth so callers don't need to cast.
export function requestAuthToken(interactive = true): Promise<AuthGetTokenResponse> {
  return sendMessage({ type: "AUTH_GET_TOKEN", interactive }) as Promise<AuthGetTokenResponse>;
}

export function requestSignOut(): Promise<AuthSignOutResponse> {
  return sendMessage({ type: "AUTH_SIGN_OUT" }) as Promise<AuthSignOutResponse>;
}
