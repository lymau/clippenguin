// Clippenguin — Background Service Worker (MV3)
// Spec ref: issue.md §8 Authentication, §14 State Machine, §16 Messaging, §17 Errors

import type { Message, MessageResponse } from "../shared/messages";
import { getAuthToken, signOut, getAuthState } from "../google/auth";
import { loadAuthEmail } from "../shared/auth-state";
import { captureScreenshot, SCREENSHOT_MIME } from "../capture/screenshot";

const TAG = "[Clippenguin:SW]";

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`${TAG} onInstalled`, details.reason);
});

chrome.runtime.onStartup.addListener(() => {
  console.log(`${TAG} onStartup`);
});

// Centralized message router — typed, no string scattering (§16)
chrome.runtime.onMessage.addListener((rawMessage: Message, _sender, sendResponse: (r: MessageResponse) => void) => {
  // Async handling: return true to keep the message channel open
  void handleMessage(rawMessage)
    .then((response) => sendResponse(response))
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`${TAG} unhandled message error`, message);
      sendResponse({
        ok: false,
        error: {
          code: "UNKNOWN",
          message: "Something went wrong. Please try again.",
          details: message,
          recoverable: true,
        },
      });
    });
  return true;
});

async function handleMessage(message: Message): Promise<MessageResponse> {
  switch (message.type) {
    case "AUTH_GET_TOKEN": {
      const interactive = message.interactive ?? true;
      try {
        const { email } = await getAuthToken(interactive);
        // Never return the token to callers that don't need it; popup only
        // needs the email to render connected state. Future upload callers
        // will obtain tokens via background-only Drive helpers (ISSUE-006).
        // If a future caller does need the token, add a separate drive-scoped
        // message handler there — not here.
        console.log(`${TAG} AUTH_GET_TOKEN ok`);
        return { ok: true, email };
      } catch (err) {
        const error =
          err && typeof err === "object" && "code" in err
            ? (err as MessageResponse & { code: string } as unknown as { code: string; message: string; details?: string; recoverable: boolean })
            : null;
        // getAuthToken already maps to AppError shape
        if (error && typeof error.message === "string") {
          console.warn(`${TAG} AUTH_GET_TOKEN failed`, error.code);
          return { ok: false, error: error as unknown as Extract<MessageResponse, { ok: false }>["error"] };
        }
        const fallback = err instanceof Error ? err.message : String(err);
        console.warn(`${TAG} AUTH_GET_TOKEN failed (fallback)`, fallback.slice(0, 120));
        return {
          ok: false,
          error: {
            code: "OAUTH_UNKNOWN",
            message: "Could not connect to Google Drive. Please try again.",
            details: fallback,
            recoverable: true,
          },
        };
      }
    }

    case "AUTH_SIGN_OUT": {
      try {
        await signOut();
        console.log(`${TAG} AUTH_SIGN_OUT ok`);
        return { ok: true };
      } catch (err) {
        const fallback = err instanceof Error ? err.message : String(err);
        console.warn(`${TAG} AUTH_SIGN_OUT failed`, fallback.slice(0, 120));
        return {
          ok: false,
          error: {
            code: "SIGN_OUT_FAILED",
            message: "Could not disconnect. Please try again.",
            details: fallback,
            recoverable: true,
          },
        };
      }
    }

    case "AUTH_GET_STATE": {
      try {
        // Prefer silent auth check; fall back to stored email for display
        const state = await getAuthState();
        if (state.connected && state.email) return { ok: true, email: state.email };
        const stored = await loadAuthEmail();
        // If getAuthState returned not connected but storage has an email,
        // the token is expired/missing — report not connected; popup will
        // show AUTH_REQUIRED but can still display last email as hint.
        if (stored && state.connected) return { ok: true, email: stored };
        if (state.email) return { ok: true, email: state.email };
        // Return ok:true with no email means "not connected" — not an error
        return { ok: true, email: undefined };
      } catch (err) {
        const fallback = err instanceof Error ? err.message : String(err);
        console.warn(`${TAG} AUTH_GET_STATE failed`, fallback.slice(0, 120));
        return { ok: true, email: undefined };
      }
    }

    case "SCREENSHOT_CAPTURE": {
      try {
        const result = await captureScreenshot();
        console.log(`${TAG} SCREENSHOT_CAPTURE ok`, result.filename);
        return {
          ok: true,
          dataUrl: result.dataUrl,
          filename: result.filename,
          mimeType: result.blob.type || SCREENSHOT_MIME,
        };
      } catch (err) {
        // captureScreenshot throws AppError-shaped objects
        const appErr =
          err && typeof err === "object" && "code" in err && "message" in err
            ? (err as Extract<MessageResponse, { ok: false }>["error"])
            : null;
        if (appErr && typeof appErr.message === "string") {
          console.warn(`${TAG} SCREENSHOT_CAPTURE failed`, appErr.code);
          return { ok: false, error: appErr };
        }
        const fallback = err instanceof Error ? err.message : String(err);
        console.warn(`${TAG} SCREENSHOT_CAPTURE failed (fallback)`, fallback.slice(0, 160));
        return {
          ok: false,
          error: {
            code: "CAPTURE_FAILED",
            message: "Screenshot failed. Please try again.",
            details: fallback,
            recoverable: true,
          },
        };
      }
    }

    case "GET_STATE":
    case "PING":
    case "GET_RECENT_UPLOADS":
    case "RECORDING_START":
    case "RECORDING_STOP":
    case "UPLOAD_FILE":
      // Forward-compatible stubs — ISSUE-005/006 implement these.
      // For now echo back so callers don't hang; log without sensitive data.
      console.log(`${TAG} ${message.type} (not yet implemented)`);
      return { ok: true, echo: message };

    default: {
      const exhaustive: never = message;
      console.warn(`${TAG} unknown message`, exhaustive);
      return {
        ok: false,
        error: {
          code: "UNKNOWN_MESSAGE",
          message: "Unknown request. Please update the extension.",
          recoverable: false,
        },
      };
    }
  }
}

console.log(`${TAG} service worker loaded — ${new Date().toISOString()}`);

export {};
