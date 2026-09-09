// Clippenguin — Screenshot Capture
// Spec ref: issue.md §6 Screenshot, §10 Upload, §12 File Naming, §17 Capture errors, §19 Permissions
// ISSUE-004: captureVisibleTab via background service worker.
//
// Security / correctness invariants:
// - captureVisibleTab is ONLY called from the background service worker.
//   Popup must go through SCREENSHOT_CAPTURE message.
// - Never surface raw chrome.runtime.lastError text as primary user message.
// - Sanitize filenames (§12), keep .png, prevent empty names.

import type { AppError } from "../shared/types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const SCREENSHOT_MIME = "image/png" as const;
export const SCREENSHOT_EXTENSION = ".png" as const;

/**
 * URL prefixes that Chrome cannot capture. Attempting captureVisibleTab on
 * these surfaces fails with a lastError. We pre-check to give an actionable
 * message instead of a cryptic provider error (§17).
 * Spec lists chrome:// and chrome-extension://; we also cover edge://,
 * about:, chrome-search://, and moz-extension:// defensively.
 */
const RESTRICTED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "chrome-search://",
  "moz-extension://",
] as const;

// ─── File naming (§12) ──────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Generate default screenshot filename: screenshot-YYYY-MM-DD-HH-mm-ss.png
 * Uses local time (matches user's file system expectation). Zero-padded.
 */
export function generateDefaultScreenshotFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const mo = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const h = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const s = pad2(now.getSeconds());
  return `screenshot-${y}-${mo}-${d}-${h}-${mi}-${s}${SCREENSHOT_EXTENSION}`;
}

/**
 * Invalid filename characters on Windows/macOS/Linux + control chars.
 * Covers <>:"/\|?* and 0x00-0x1F. Also trims leading/trailing dots/spaces
 * which cause issues on Windows.
 */
const INVALID_FILENAME_RE = /[<>:"/\\|?*\x00-\x1F]/g;

/**
 * Ensure the filename ends with .png (case-insensitive). If no extension or
 * a different extension, replace/append to keep MIME ↔ extension consistent.
 */
export function ensurePngExtension(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return generateDefaultScreenshotFilename();
  const lower = trimmed.toLowerCase();
  if (lower.endsWith(SCREENSHOT_EXTENSION)) return trimmed;
  // If it already has some extension, replace it.
  const lastDot = trimmed.lastIndexOf(".");
  // Only replace if extension looks like an extension (1-8 alnum chars at end)
  if (lastDot > 0 && lastDot > trimmed.length - 9) {
    const withoutExt = trimmed.slice(0, lastDot).trimEnd();
    if (withoutExt) return `${withoutExt}${SCREENSHOT_EXTENSION}`;
  }
  // No extension — just append
  return `${trimmed}${SCREENSHOT_EXTENSION}`;
}

/**
 * Sanitize a user-provided filename for filesystem / Drive upload.
 * - Trims whitespace
 * - Replaces invalid chars with "-"
 * - Collapses consecutive dashes / spaces
 * - Strips leading/trailing dots and dashes
 * - Prevents empty result → falls back to generated default
 * - Keeps .png extension consistent
 */
export function sanitizeFilename(input: string, fallbackDate?: Date): string {
  let name = (input ?? "").trim();

  if (!name) {
    return generateDefaultScreenshotFilename(fallbackDate);
  }

  // Replace invalid chars
  name = name.replace(INVALID_FILENAME_RE, "-");

  // Collapse whitespace to single dash, collapse multiple dashes
  name = name.replace(/\s+/g, "-").replace(/-+/g, "-");

  // Strip leading/trailing dots, dashes, spaces
  name = name.replace(/^[.\-\s]+|[.\-\s]+$/g, "");

  if (!name || name === SCREENSHOT_EXTENSION) {
    return generateDefaultScreenshotFilename(fallbackDate);
  }

  // Ensure .png
  name = ensurePngExtension(name);

  // After ensuring extension, re-check emptiness
  if (!name || name === SCREENSHOT_EXTENSION) {
    return generateDefaultScreenshotFilename(fallbackDate);
  }

  // Guard against extremely long names (Drive + FS limits). Keep <= 100 chars.
  const MAX_BASE = 100 - SCREENSHOT_EXTENSION.length;
  const dotIdx = name.toLowerCase().lastIndexOf(SCREENSHOT_EXTENSION);
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  if (base.length > MAX_BASE) {
    return `${base.slice(0, MAX_BASE).replace(/-+$/g, "")}${SCREENSHOT_EXTENSION}`;
  }

  return name;
}

/**
 * Lightweight validation for UI: non-empty after trim, not just dots/dashes.
 * Returns error string or null when valid.
 */
export function validateFilenameInput(input: string): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return "Filename cannot be empty.";
  // Strip invalid chars and see if anything meaningful remains
  const stripped = trimmed.replace(INVALID_FILENAME_RE, "").replace(/^[.\-\s]+|[.\-\s]+$/g, "");
  // Remove a trailing .png for the emptiness check ("... .png" alone is invalid)
  const withoutExt = stripped.toLowerCase().endsWith(SCREENSHOT_EXTENSION)
    ? stripped.slice(0, -SCREENSHOT_EXTENSION.length).replace(/[.\-\s]+$/g, "")
    : stripped;
  if (!withoutExt) return "Filename is invalid. Use letters, numbers, or dashes.";
  return null;
}

// ─── Restricted URL check ───────────────────────────────────────────────────

export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return RESTRICTED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function getRestrictedPageError(url: string | undefined): AppError {
  const hint = url ? ` (${url.slice(0, 48)}…)` : "";
  return {
    code: "CAPTURE_RESTRICTED_PAGE",
    message:
      "Can't capture this page. Chrome doesn't allow screenshots of system pages like chrome:// or extension pages. Open a regular website and try again.",
    details: `Restricted URL${hint}`,
    recoverable: true,
  };
}

// ─── Friendly error mapping (§17) ───────────────────────────────────────────

function toCaptureError(rawMessage: string, url?: string): AppError {
  const lower = rawMessage.toLowerCase();

  if (lower.includes("permission") || lower.includes("not allowed") || lower.includes("activeTab") || lower.includes("no tab")) {
    return {
      code: "CAPTURE_PERMISSION_DENIED",
      message: "No active tab to capture. Open a regular web page and try again.",
      details: rawMessage,
      recoverable: true,
    };
  }

  if (
    lower.includes("chrome://") ||
    lower.includes("chrome-extension://") ||
    lower.includes("restricted") ||
    lower.includes("cannot access") ||
    isRestrictedUrl(url)
  ) {
    return getRestrictedPageError(url);
  }

  if (lower.includes("no active tab") || lower.includes("no tab with id") || lower.includes("no window")) {
    return {
      code: "CAPTURE_NO_ACTIVE_TAB",
      message: "No active tab found. Open a regular web page and try again.",
      details: rawMessage,
      recoverable: true,
    };
  }

  // Fallback — never surface rawMessage as primary message (§17)
  return {
    code: "CAPTURE_FAILED",
    message: "Screenshot failed. Please try again.",
    details: rawMessage,
    recoverable: true,
  };
}

// ─── Data URL → Blob → File (§6) ──────────────────────────────────────────

/**
 * Convert a Data URL (as returned by captureVisibleTab) to a Blob.
 * Handles both base64 and non-base64 (utf8) data URLs.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) throw new Error("Invalid Data URL: missing comma separator");

  const header = dataUrl.slice(0, commaIdx);
  const dataPart = dataUrl.slice(commaIdx + 1);

  const isBase64 = header.includes(";base64");
  const mimeMatch = header.match(/data:([^;,]+)?/);
  const mimeType = mimeMatch?.[1]?.trim() || SCREENSHOT_MIME;

  if (isBase64) {
    // atob is available in window + service worker; avoid Buffer to keep no @types/node dependency
    const binary = atob(dataPart);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || SCREENSHOT_MIME });
  }

  // Non-base64: percent-decoded UTF-8
  const decoded = decodeURIComponent(dataPart);
  return new Blob([decoded], { type: mimeType || SCREENSHOT_MIME });
}

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const blob = dataUrlToBlob(dataUrl);
  const safeName = sanitizeFilename(filename);
  // File constructor is available in both popup and SW (MV3 service worker has it)
  return new File([blob], safeName, { type: blob.type || SCREENSHOT_MIME });
}

// ─── captureVisibleTab wrappers ─────────────────────────────────────────────

/**
 * Promise wrapper for chrome.tabs.captureVisibleTab.
 * Resolves with the Data URL string; rejects with lastError message.
 *
 * Must be called from the background service worker extension context.
 */
export function captureVisibleTabDataUrl(options?: { format?: "png" | "jpeg"; quality?: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const runtime = (globalThis as unknown as { chrome?: typeof chrome }).chrome;
      if (!runtime?.tabs?.captureVisibleTab) {
        reject(new Error("chrome.tabs.captureVisibleTab is not available in this context"));
        return;
      }

      const captureOptions: { format?: "png" | "jpeg"; quality?: number } = {
        format: options?.format ?? "png",
        quality: options?.quality,
      };

      // Use windowId = current window implicitly (omit first arg) to stay simple
      // MV3 supports promise form when chrome types are promisified; fall back to callback.
      const maybePromise = (
        runtime.tabs.captureVisibleTab as unknown as (
          opts: { format?: "png" | "jpeg"; quality?: number },
          cb?: (dataUrl: string) => void,
        ) => Promise<string> | void
      )(captureOptions, (dataUrl?: string) => {
        const lastError = runtime.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message ?? "captureVisibleTab failed"));
          return;
        }
        if (typeof dataUrl !== "string" || dataUrl.length === 0) {
          reject(new Error("captureVisibleTab returned empty data"));
          return;
        }
        resolve(dataUrl);
      });

      // If promisified (e.g. mocked or future typings), handle thenable
      if (maybePromise && typeof (maybePromise as Promise<string>).then === "function") {
        (maybePromise as Promise<string>).then(resolve, (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          reject(new Error(msg));
        });
      }
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export interface CaptureScreenshotResult {
  dataUrl: string;
  blob: Blob;
  file: File;
  filename: string;
}

/**
 * High-level screenshot capture for the service worker.
 * - Checks active tab URL for restricted pages first (§17 friendly error)
 * - Calls captureVisibleTab
 * - Converts to Blob/File with sanitized default filename
 *
 * @param preferredFilename - optional user-provided name; sanitized; defaults to generated timestamp
 */
export async function captureScreenshot(preferredFilename?: string): Promise<CaptureScreenshotResult> {
  // Pre-check: resolve active tab to detect restricted pages early
  let activeUrl: string | undefined;
  try {
    const tabsApi = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.tabs;
    if (tabsApi?.query) {
      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        try {
          const maybe = (tabsApi.query as unknown as (q: chrome.tabs.QueryInfo, cb?: (tabs: chrome.tabs.Tab[]) => void) => Promise<chrome.tabs.Tab[]> | void)(
            { active: true, currentWindow: true },
            (result?: chrome.tabs.Tab[]) => {
              const err = chrome.runtime.lastError;
              if (err) resolve([]);
              else resolve(result ?? []);
            },
          );
          if (maybe && typeof (maybe as Promise<chrome.tabs.Tab[]>).then === "function") {
            (maybe as Promise<chrome.tabs.Tab[]>).then(resolve, () => resolve([]));
          }
        } catch {
          resolve([]);
        }
      });
      activeUrl = tabs[0]?.url;
    }
  } catch {
    // Non-fatal — proceed to capture; it'll fail with its own message
  }

  if (isRestrictedUrl(activeUrl)) {
    throw getRestrictedPageError(activeUrl);
  }

  let dataUrl: string;
  try {
    dataUrl = await captureVisibleTabDataUrl({ format: "png" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Never leak raw chrome internals as primary message
    throw toCaptureError(msg, activeUrl);
  }

  // Build filename — sanitized, with timestamp default
  const filename = sanitizeFilename(preferredFilename?.trim() ? preferredFilename : generateDefaultScreenshotFilename());

  let blob: Blob;
  let file: File;
  try {
    blob = dataUrlToBlob(dataUrl);
    file = dataUrlToFile(dataUrl, filename);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw {
      code: "CAPTURE_CONVERT_FAILED",
      message: "Screenshot was captured but could not be prepared. Please try again.",
      details: msg,
      recoverable: true,
    } satisfies AppError;
  }

  return { dataUrl, blob, file, filename: file.name };
}

// ─── Preview helpers (popup) ────────────────────────────────────────────────

/**
 * Create an object URL for preview. Caller is responsible for revoking via
 * revokePreviewUrl when the preview unmounts or is replaced.
 */
export function createPreviewUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function revokePreviewUrl(url: string | undefined): void {
  if (!url) return;
  // Only revoke blob: URLs; don't revoke data: URLs
  if (url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}
