// Clippenguin — Screen Recording helpers
// Spec ref: issue.md §6 Screen recording, §7 Recording Architecture, §12 File Naming, §21 Performance, ISSUE-005
//
// Provides pure helpers that are safe to import from both the popup and the
// dedicated recorder page. The recorder page owns MediaStream + MediaRecorder
// (never the popup or background service worker).

import type { AppError } from "../shared/types";

// ─── MIME candidates (§6) ────────────────────────────────────────────────────

export const RECORDING_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

export const RECORDING_EXTENSION = ".webm" as const;
export const RECORDING_FALLBACK_MIME = "video/webm" as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// ─── MIME detection ────────────────────────────────────────────────────────

/**
 * Return the first candidate that MediaRecorder.isTypeSupported reports as
 * supported, or undefined if none are supported.
 *
 * Guarded for non-browser environments (tests, vite dev without recorder API).
 */
export function getSupportedRecordingMimeType(
  candidates: readonly string[] = RECORDING_MIME_CANDIDATES,
): string | undefined {
  const MR = (globalThis as unknown as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } }).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== "function") return undefined;
  for (const c of candidates) {
    try {
      if (MR.isTypeSupported(c)) return c;
    } catch {
      // ignore malformed candidate
    }
  }
  return undefined;
}

export function isMediaRecorderSupported(): boolean {
  const g = globalThis as unknown as { MediaRecorder?: unknown; navigator?: { mediaDevices?: unknown } };
  return typeof g.MediaRecorder !== "undefined" && Boolean(g.navigator?.mediaDevices);
}

// ─── File naming (§12) ────────────────────────────────────────────────────

/**
 * Generate default recording filename: screen-recording-YYYY-MM-DD-HH-mm-ss.webm
 * Local time, zero-padded (§12 Recording).
 */
export function generateDefaultRecordingFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const mo = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const h = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const s = pad2(now.getSeconds());
  return `screen-recording-${y}-${mo}-${d}-${h}-${mi}-${s}${RECORDING_EXTENSION}`;
}

const INVALID_FILENAME_RE = /[<>:"/\\|?*\x00-\x1F]/g;

export function ensureWebmExtension(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return generateDefaultRecordingFilename();
  const lower = trimmed.toLowerCase();
  if (lower.endsWith(RECORDING_EXTENSION)) return trimmed;
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot > 0 && lastDot > trimmed.length - 9) {
    const withoutExt = trimmed.slice(0, lastDot).trimEnd();
    if (withoutExt) return `${withoutExt}${RECORDING_EXTENSION}`;
  }
  return `${trimmed}${RECORDING_EXTENSION}`;
}

export function sanitizeRecordingFilename(input: string, fallbackDate?: Date): string {
  let name = (input ?? "").trim();
  if (!name) return generateDefaultRecordingFilename(fallbackDate);
  name = name.replace(INVALID_FILENAME_RE, "-");
  name = name.replace(/\s+/g, "-").replace(/-+/g, "-");
  name = name.replace(/^[.\-\s]+|[.\-\s]+$/g, "");
  if (!name || name === RECORDING_EXTENSION) return generateDefaultRecordingFilename(fallbackDate);
  name = ensureWebmExtension(name);
  if (!name || name === RECORDING_EXTENSION) return generateDefaultRecordingFilename(fallbackDate);
  const MAX_BASE = 100 - RECORDING_EXTENSION.length;
  const dotIdx = name.toLowerCase().lastIndexOf(RECORDING_EXTENSION);
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  if (base.length > MAX_BASE) {
    return `${base.slice(0, MAX_BASE).replace(/-+$/g, "")}${RECORDING_EXTENSION}`;
  }
  return name;
}

export function validateRecordingFilename(input: string): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return "Filename cannot be empty.";
  const stripped = trimmed.replace(INVALID_FILENAME_RE, "").replace(/^[.\-\s]+|[.\-\s]+$/g, "");
  const withoutExt = stripped.toLowerCase().endsWith(RECORDING_EXTENSION)
    ? stripped.slice(0, -RECORDING_EXTENSION.length).replace(/[.\-\s]+$/g, "")
    : stripped;
  if (!withoutExt) return "Filename is invalid. Use letters, numbers, or dashes.";
  return null;
}

// ─── Blob / File (§6, §21) ────────────────────────────────────────────────

export function chunksToBlob(chunks: Blob[], mimeType: string): Blob {
  return new Blob(chunks, { type: mimeType });
}

export function blobToFile(blob: Blob, filename: string): File {
  const safe = sanitizeRecordingFilename(filename);
  return new File([blob], safe, { type: blob.type || RECORDING_FALLBACK_MIME });
}

// ─── Preview URL helpers (§21) ────────────────────────────────────────────

export function createPreviewUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function revokePreviewUrl(url: string | undefined): void {
  if (!url) return;
  if (url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}

// ─── Track helpers (§21) ──────────────────────────────────────────────────

export function stopAllTracks(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

// ─── Audio status ─────────────────────────────────────────────────────────

/**
 * Inspect a MediaStream for audio presence.
 * Returns a user-facing label like "System audio", "No audio", etc.
 */
export function getAudioStatus(stream: MediaStream | null | undefined): {
  hasAudio: boolean;
  trackCount: number;
  labels: string[];
  summary: string;
} {
  if (!stream) return { hasAudio: false, trackCount: 0, labels: [], summary: "No audio" };
  const audioTracks = stream.getAudioTracks();
  const labels = audioTracks.map((t) => t.label || "audio");
  const hasAudio = audioTracks.length > 0;
  // Heuristic: Chrome labels system audio tracks with "system" or display surface name.
  // We keep it simple: report count + labels for the UI.
  let summary: string;
  if (!hasAudio) summary = "No audio";
  else if (audioTracks.length === 1) summary = `Audio: ${labels[0] || "system/mic"}`;
  else summary = `Audio: ${audioTracks.length} tracks`;
  return { hasAudio, trackCount: audioTracks.length, labels, summary };
}

// ─── Error mapping (§17, §21) ────────────────────────────────────────────

export function recordingErrorFromDomException(err: unknown): AppError {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const name = err instanceof DOMException ? err.name : (err as { name?: string })?.name ?? "";
  const combined = `${name} ${raw}`.toLowerCase();

  if (combined.includes("notallowed") || combined.includes("permission denied") || combined.includes("notallowederror")) {
    return {
      code: "RECORDING_PERMISSION_DENIED",
      message: "Screen recording was cancelled or permission was denied. Click Start Recording again and choose a screen or window to share.",
      details: raw,
      recoverable: true,
    };
  }
  if (combined.includes("notfound") || combined.includes("notfounderror") || combined.includes("no media")) {
    return {
      code: "RECORDING_NO_SOURCE",
      message: "No screen source was selected. Try starting the recording again and pick a screen, window, or tab.",
      details: raw,
      recoverable: true,
    };
  }
  if (combined.includes("notreadable") || combined.includes("notreadableerror") || combined.includes("in use")) {
    return {
      code: "RECORDING_SOURCE_BUSY",
      message: "The selected screen is busy or cannot be captured right now. Close other capture apps and try again.",
      details: raw,
      recoverable: true,
    };
  }
  if (combined.includes("overconstrained") || combined.includes("constraint")) {
    return {
      code: "RECORDING_CONSTRAINT_ERROR",
      message: "Display capture isn't supported with the current constraints. Try again without extra audio options.",
      details: raw,
      recoverable: true,
    };
  }
  if (combined.includes("abort")) {
    return {
      code: "RECORDING_ABORTED",
      message: "Recording was interrupted. Try starting again.",
      details: raw,
      recoverable: true,
    };
  }
  return {
    code: "RECORDING_FAILED",
    message: "Could not start screen recording. Please try again.",
    details: raw,
    recoverable: true,
  };
}

export function mimeNotSupportedError(): AppError {
  return {
    code: "RECORDING_MIME_UNSUPPORTED",
    message: `Screen recording isn't supported in this browser. No supported MIME type found. Candidates tried: ${RECORDING_MIME_CANDIDATES.join(", ")}.`,
    details: RECORDING_MIME_CANDIDATES.join(", "),
    recoverable: false,
  };
}

// ─── Recorder opening helper (popup → recorder page) ──────────────────────

/**
 * Open the dedicated recorder page. MUST be called from a user gesture
 * (popup click) so the resulting tab/window retains user-activation for
 * getDisplayMedia. Prefers chrome.tabs.create, falls back to windows.create,
 * then window.open.
 *
 * Spec ref: issue.md §7 — don't keep recording logic in the popup or SW.
 */
export async function openRecorderPage(): Promise<void> {
  const g = globalThis as unknown as {
    chrome?: {
      runtime?: { getURL?: (p: string) => string };
      tabs?: { create?: (opts: { url: string; active?: boolean }, cb?: (tab: unknown) => void) => void };
      windows?: { create?: (opts: { url: string; type?: string; focused?: boolean }, cb?: (w: unknown) => void) => void };
    };
  };
  const chromeNs = g.chrome;
  const path = "src/recorder/recorder.html";

  // chrome.tabs.create path (preferred)
  if (chromeNs?.runtime?.getURL && chromeNs?.tabs?.create) {
    const url = chromeNs.runtime.getURL(path);
    await new Promise<void>((resolve, reject) => {
      try {
        chromeNs.tabs!.create!({ url, active: true }, () => {
          const lastErr = (chromeNs as unknown as { runtime: { lastError?: { message?: string } } }).runtime?.lastError;
          if (lastErr?.message) reject(new Error(lastErr.message));
          else resolve();
        });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }).catch(async () => {
      // Fallback to windows.create or window.open if tabs.create failed
      if (chromeNs.windows?.create) {
        const url2 = chromeNs.runtime!.getURL!(path);
        await new Promise<void>((res) => {
          try {
            chromeNs.windows!.create!({ url: url2, type: "popup", focused: true }, () => res());
          } catch {
            res();
          }
        });
        return;
      }
      window.open((chromeNs.runtime as unknown as { getURL: (p: string) => string }).getURL(path), "_blank");
    });
    return;
  }

  // windows.create fallback
  if (chromeNs?.runtime?.getURL && chromeNs?.windows?.create) {
    const url = chromeNs.runtime.getURL(path);
    await new Promise<void>((res) => {
      try {
        chromeNs.windows!.create!({ url, type: "popup", focused: true }, () => res());
      } catch {
        res();
      }
    });
    return;
  }

  // chrome available but no tabs/windows (e.g. limited context) — window.open with extension URL
  if (chromeNs?.runtime?.getURL) {
    const maybeGetUrl = chromeNs.runtime.getURL as unknown as ((p: string) => string) | undefined;
    if (maybeGetUrl) window.open(maybeGetUrl(path), "_blank");
    return;
  }

  // Vite dev fallback — no extension runtime
  window.open(`/src/recorder/recorder.html`, "_blank");
}
