// Clippenguin — Dedicated Recorder Page
// Spec ref: issue.md §6 Screen recording, §7 Recording Architecture, §12 File Naming, §21 Performance, ISSUE-005
//
// Architecture invariant (§7):
//   Popup --click--> Recorder Page (owns MediaStream + MediaRecorder) --> Blob/File --> Preview/Upload
// Never put recording logic in the popup (popup lifecycle kills recording) or background SW.
//
// This module owns:
// - getDisplayMedia (from user gesture), MIME detection, MediaRecorder, chunks
// - Timer UI, Stop/Pause/Resume (pause only if reliably supported)
// - Browser stop-sharing event (track.onended)
// - stopAllTracks + revokeObjectURL cleanup (§21)

import {
  RECORDING_MIME_CANDIDATES,
  RECORDING_EXTENSION,
  getSupportedRecordingMimeType,
  generateDefaultRecordingFilename,
  sanitizeRecordingFilename,
  validateRecordingFilename,
  chunksToBlob,
  blobToFile,
  createPreviewUrl,
  revokePreviewUrl,
  stopAllTracks,
  getAudioStatus,
  recordingErrorFromDomException,
  mimeNotSupportedError,
} from "../capture/recording";

// ─── State ───────────────────────────────────────────────────────────────────

type RecorderState = "idle" | "recording" | "paused" | "preview" | "error";

let state: RecorderState = "idle";
let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let mimeType = "";
let previewUrl: string | null = null;
let startTimeMs = 0;
let elapsedMs = 0;
let timerId: number | null = null;
let pausedAtMs: number | null = null;
let totalPausedMs = 0;
let savedBlob: Blob | null = null;
let savedFilename = "";

// ─── DOM ─────────────────────────────────────────────────────────────────────

const els = {} as Record<string, HTMLElement>;

function qs(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function initEls(): void {
  const ids = [
    "state-badge",
    "view-idle",
    "view-recording",
    "view-preview",
    "btn-start",
    "btn-close-idle",
    "idle-error",
    "idle-hint",
    "btn-stop",
    "btn-pause",
    "btn-cancel",
    "timer",
    "audio-status",
    "mime-status",
    "rec-indicator",
    "rec-error",
    "preview-video",
    "preview-wrap",
    "preview-placeholder",
    "filename-input",
    "filename-hint",
    "filename-error",
    "btn-download",
    "btn-record-again",
    "btn-close-preview",
    "preview-meta",
  ];
  for (const id of ids) els[id] = qs(id);
}

// ─── View helpers ────────────────────────────────────────────────────────────

function setBadge(label: string): void {
  els["state-badge"].textContent = label;
}

function showView(which: "idle" | "recording" | "preview"): void {
  els["view-idle"].style.display = which === "idle" ? "" : "none";
  els["view-recording"].style.display = which === "recording" ? "" : "none";
  els["view-preview"].style.display = which === "preview" ? "" : "none";
}

function showError(targetId: string, msg: string): void {
  const el = els[targetId];
  el.textContent = msg;
  el.style.display = msg ? "" : "none";
}

function clearErrors(): void {
  showError("idle-error", "");
  showError("rec-error", "");
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function effectiveElapsed(): number {
  if (state === "paused" && pausedAtMs !== null) {
    return pausedAtMs - startTimeMs - totalPausedMs;
  }
  if (state === "recording") {
    return Date.now() - startTimeMs - totalPausedMs;
  }
  return elapsedMs;
}

// ─── Timer ───────────────────────────────────────────────────────────────────

function startTimer(): void {
  stopTimer();
  timerId = window.setInterval(() => {
    const e = effectiveElapsed();
    els["timer"].textContent = formatElapsed(e);
  }, 250);
}

function stopTimer(): void {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

// ─── Audio / MIME status ─────────────────────────────────────────────────────

function updateAudioStatus(): void {
  const info = getAudioStatus(mediaStream);
  // Summary already includes count/labels; show succinctly
  els["audio-status"].textContent = info.summary;
  // Append codec hint for debugging
  if (mimeType) els["mime-status"].textContent = `Codec: ${mimeType}`;
  else els["mime-status"].textContent = "";
}

// ─── Pause support check ─────────────────────────────────────────────────────

function isPauseReliable(): boolean {
  // MediaRecorder.pause is widely supported now, but guard anyway.
  // We only expose pause if state transitions work (inactive check).
  try {
    const MR = globalThis.MediaRecorder as unknown as { prototype: { pause?: unknown; resume?: unknown } };
    return typeof MR?.prototype?.pause === "function" && typeof MR?.prototype?.resume === "function";
  } catch {
    return false;
  }
}

// ─── Recording lifecycle ─────────────────────────────────────────────────────

async function startRecording(): Promise<void> {
  clearErrors();
  if (state === "recording" || state === "paused") return;

  // Clean previous preview
  cleanupPreview();
  chunks = [];
  savedBlob = null;
  totalPausedMs = 0;
  pausedAtMs = null;

  // MIME detection (§6)
  const supported = getSupportedRecordingMimeType(RECORDING_MIME_CANDIDATES);
  if (!supported) {
    const appErr = mimeNotSupportedError();
    showError("idle-error", appErr.message);
    // Also surface shortly in recording view if user is there
    return;
  }
  mimeType = supported;

  // getDisplayMedia — must be from user gesture (§6)
  let stream: MediaStream;
  try {
    // Prefer video: true + audio: true. If audio fails platform (some OS), fallback to video-only.
    const md = navigator.mediaDevices as MediaDevices & {
      getDisplayMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
    };
    if (!md?.getDisplayMedia) {
      throw new DOMException("getDisplayMedia is not supported in this browser", "NotSupportedError");
    }
    try {
      stream = await md.getDisplayMedia({ video: true, audio: true } as MediaStreamConstraints);
    } catch (errWithAudio) {
      const name = (errWithAudio as DOMException)?.name ?? "";
      const msg = (errWithAudio as Error)?.message ?? "";
      const isAudioConstraint = /overconstrained|constraint/i.test(`${name} ${msg}`);
      if (isAudioConstraint) {
        // Retry without audio constraint
        stream = await md.getDisplayMedia({ video: true, audio: false } as MediaStreamConstraints);
      } else {
        throw errWithAudio;
      }
    }
  } catch (err) {
    const appErr = recordingErrorFromDomException(err);
    showError("idle-error", appErr.message);
    return;
  }

  mediaStream = stream;
  updateAudioStatus();

  // Handle browser stop-sharing (user clicks "Stop sharing" in browser UI)
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    const onEnded = () => {
      // Browser terminated sharing — treat as stop
      if (state === "recording" || state === "paused") {
        void stopRecordingInternal({ fromTrackEnded: true });
      }
    };
    // Prefer addEventListener; fallback to onended for older
    try {
      videoTrack.addEventListener("ended", onEnded, { once: true });
    } catch {
      // fallback
      (videoTrack as unknown as { onended: (() => void) | null }).onended = onEnded;
    }
    // Also listen for track removal
    stream.addEventListener?.("removetrack", () => {
      if (stream.getVideoTracks().length === 0 && (state === "recording" || state === "paused")) {
        void stopRecordingInternal({ fromTrackEnded: true });
      }
    });
  }

  // MediaRecorder
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch (err) {
    // Fallback: try without mimeType if the specific codec failed at construct time
    try {
      recorder = new MediaRecorder(stream);
      mimeType = recorder.mimeType || RECORDING_MIME_CANDIDATES[2] || "video/webm";
      els["mime-status"].textContent = `Codec (fallback): ${mimeType}`;
    } catch (err2) {
      stopAllTracks(stream);
      mediaStream = null;
      const appErr = recordingErrorFromDomException(err2 ?? err);
      showError("idle-error", appErr.message);
      return;
    }
  }

  mediaRecorder = recorder;
  chunks = [];

  recorder.ondataavailable = (ev: BlobEvent) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  recorder.onerror = (ev: Event) => {
    const err = (ev as unknown as { error?: unknown }).error ?? ev;
    const appErr = recordingErrorFromDomException(err);
    showError("rec-error", appErr.message);
  };

  recorder.onstop = () => {
    // Build blob/file only on natural stop; stopRecordingInternal will decide preview
    // Do not cleanup tracks here — caller does after building.
  };

  // Use 250ms timeslice for frequent ondataavailable without huge memory spikes §21
  try {
    recorder.start(250);
  } catch (err) {
    stopAllTracks(stream);
    mediaStream = null;
    mediaRecorder = null;
    const appErr = recordingErrorFromDomException(err);
    showError("idle-error", appErr.message);
    return;
  }

  // UI transition
  state = "recording";
  startTimeMs = Date.now();
  elapsedMs = 0;
  setBadge("recording");
  showView("recording");
  els["timer"].textContent = "00:00";
  startTimer();
  // Pause button only if reliable
  const pauseBtn = els["btn-pause"] as HTMLButtonElement;
  pauseBtn.style.display = isPauseReliable() ? "" : "none";
  pauseBtn.textContent = "Pause";
  pauseBtn.disabled = false;
  (els["btn-stop"] as HTMLButtonElement).disabled = false;
  updateAudioStatus();
}

async function stopRecordingInternal(opts?: { fromTrackEnded?: boolean }): Promise<void> {
  if (state !== "recording" && state !== "paused") return;

  stopTimer();
  elapsedMs = effectiveElapsed();
  setBadge("stopping…");

  const rec = mediaRecorder;
  const stream = mediaStream;

  // Remove track ended handlers to avoid double-stop
  // (best-effort — stream may already have ended)

  // If recorder is still recording/paused, stop it and wait for onstop to flush chunks
  if (rec && rec.state !== "inactive") {
    await new Promise<void>((resolve) => {
      const done = () => {
        rec.removeEventListener?.("stop", done);
        resolve();
      };
      try {
        rec.addEventListener("stop", done, { once: true } as AddEventListenerOptions);
      } catch {
        // fallback: poll
      }
      try {
        rec.stop();
      } catch {
        resolve();
      }
      // Fallback resolve after timeout in case event doesn't fire
      window.setTimeout(resolve, 1200);
    });
  }

  // Build blob/file + preview
  let blob: Blob;
  if (chunks.length === 0) {
    // No data — show message but still cleanup
    blob = new Blob([], { type: mimeType || "video/webm" });
  } else {
    blob = chunksToBlob(chunks, mimeType || "video/webm");
  }

  // §21: stop all tracks after recording
  stopAllTracks(stream);
  mediaStream = null;
  mediaRecorder = null;

  const filename = sanitizeRecordingFilename(generateDefaultRecordingFilename());

  // Empty recording detection (user cancelled quickly / no frames)
  if (!blob.size) {
    state = "idle";
    setBadge("idle");
    showView("idle");
    const msg = opts?.fromTrackEnded
      ? "Recording was stopped before any data was captured."
      : "No recording data was captured. Try recording for a few seconds.";
    showError("idle-error", msg);
    return;
  }

  savedBlob = blob;
  savedFilename = filename;

  // Preview URL (§21: cleanup revoke on next record / close)
  if (previewUrl) revokePreviewUrl(previewUrl);
  previewUrl = createPreviewUrl(blob);

  // Show preview
  state = "preview";
  setBadge("preview");
  showView("preview");
  const video = els["preview-video"] as HTMLVideoElement;
  const placeholder = els["preview-placeholder"];
  video.src = previewUrl;
  video.style.display = "";
  placeholder.style.display = "none";
  // Load metadata for duration display
  video.onloadedmetadata = () => {
    const dur = isFinite(video.duration) ? video.duration : elapsedMs / 1000;
    els["preview-meta"].textContent =
      `${(blob.size / (1024 * 1024)).toFixed(2)} MB · ${formatElapsed(Math.round(dur * 1000))} · ${mimeType || blob.type} · ${dur ? "" : ""}`.trim();
  };
  try {
    await video.play().catch(() => {});
  } catch {
    // autoplay may be blocked — user can press play
  }

  // Filename input
  const input = els["filename-input"] as HTMLInputElement;
  input.value = filename;
  updateFilenameHint(filename);
  const errEl = els["filename-error"];
  errEl.style.display = "none";
  errEl.textContent = "";

  // Keep for blobToFile on download; no upload yet (ISSUE-006)
  void blobToFile(blob, filename);
}

function updateFilenameHint(raw: string): void {
  const sanitized = sanitizeRecordingFilename(raw.trim() || generateDefaultRecordingFilename());
  els["filename-hint"].textContent = `Will be saved as ${sanitized}`;
  const v = validateRecordingFilename(raw);
  const errEl = els["filename-error"];
  if (v) {
    errEl.textContent = v;
    errEl.style.display = "";
  } else {
    errEl.textContent = "";
    errEl.style.display = "none";
  }
}

function cleanupPreview(): void {
  if (previewUrl) {
    revokePreviewUrl(previewUrl);
    previewUrl = null;
  }
  const video = els["preview-video"] as HTMLVideoElement | null;
  if (video) {
    try {
      video.pause();
    } catch {
      // ignore
    }
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      // ignore
    }
    video.style.display = "none";
  }
  const ph = els["preview-placeholder"];
  if (ph) ph.style.display = "";
}

function handlePauseResume(): void {
  if (!mediaRecorder || !isPauseReliable()) return;
  const pauseBtn = els["btn-pause"] as HTMLButtonElement;
  try {
    if (state === "recording" && mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      state = "paused";
      pausedAtMs = Date.now();
      setBadge("paused");
      pauseBtn.textContent = "Resume";
      // Update audio/mime stays
    } else if (state === "paused" && mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      if (pausedAtMs !== null) {
        totalPausedMs += Date.now() - pausedAtMs;
        pausedAtMs = null;
      }
      state = "recording";
      setBadge("recording");
      pauseBtn.textContent = "Pause";
    }
  } catch (err) {
    const appErr = recordingErrorFromDomException(err);
    showError("rec-error", appErr.message);
  }
}

function handleCancel(): void {
  stopTimer();
  // Stop recorder without saving preview
  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  } catch {
    // ignore
  }
  chunks = [];
  stopAllTracks(mediaStream);
  mediaStream = null;
  mediaRecorder = null;
  savedBlob = null;
  cleanupPreview();
  state = "idle";
  elapsedMs = 0;
  totalPausedMs = 0;
  pausedAtMs = null;
  setBadge("idle");
  showView("idle");
  clearErrors();
}

function handleDownload(): void {
  if (!savedBlob) return;
  const input = els["filename-input"] as HTMLInputElement;
  const raw = input.value.trim() || savedFilename;
  const safe = sanitizeRecordingFilename(raw);
  // Validate before download
  const err = validateRecordingFilename(raw);
  if (err) {
    const errEl = els["filename-error"];
    errEl.textContent = err;
    errEl.style.display = "";
    return;
  }
  savedFilename = safe;
  const file = blobToFile(savedBlob, safe);
  // Trigger download via object URL (reuse previewUrl if same filename, but create fresh for download)
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  // Keep preview URL alive — don't revoke previewUrl here
  updateFilenameHint(safe);
}

function handleRecordAgain(): void {
  cleanupPreview();
  chunks = [];
  savedBlob = null;
  state = "idle";
  setBadge("idle");
  showView("idle");
  clearErrors();
  elapsedMs = 0;
  totalPausedMs = 0;
  pausedAtMs = null;
  // Immediately prompt again
  void startRecording();
}

// ─── Init ────────────────────────────────────────────────────────────────────

function bindEvents(): void {
  (els["btn-start"] as HTMLButtonElement).addEventListener("click", () => void startRecording());
  (els["btn-stop"] as HTMLButtonElement).addEventListener("click", () => void stopRecordingInternal());
  (els["btn-pause"] as HTMLButtonElement).addEventListener("click", handlePauseResume);
  (els["btn-cancel"] as HTMLButtonElement).addEventListener("click", handleCancel);
  (els["btn-download"] as HTMLButtonElement).addEventListener("click", handleDownload);
  (els["btn-record-again"] as HTMLButtonElement).addEventListener("click", handleRecordAgain);

  const close = () => window.close();
  (els["btn-close-idle"] as HTMLButtonElement).addEventListener("click", close);
  (els["btn-close-preview"] as HTMLButtonElement).addEventListener("click", close);

  const filenameInput = els["filename-input"] as HTMLInputElement;
  filenameInput.addEventListener("input", () => updateFilenameHint(filenameInput.value));
  filenameInput.addEventListener("change", () => updateFilenameHint(filenameInput.value));

  // Keyboard: Esc stops, Space pauses
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (state === "recording" || state === "paused")) {
      e.preventDefault();
      void stopRecordingInternal();
    }
    if (e.code === "Space" && (state === "recording" || state === "paused")) {
      // Don't hijack when typing in filename input
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      e.preventDefault();
      handlePauseResume();
    }
  });

  // Cleanup on page unload (§21)
  window.addEventListener("beforeunload", () => {
    stopTimer();
    try {
      if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    } catch {
      // ignore
    }
    stopAllTracks(mediaStream);
    if (previewUrl) revokePreviewUrl(previewUrl);
  });
  window.addEventListener("pagehide", () => {
    if (previewUrl) revokePreviewUrl(previewUrl);
    stopAllTracks(mediaStream);
  });
}

function main(): void {
  initEls();
  bindEvents();
  setBadge("idle");
  showView("idle");
  clearErrors();
  // MIME hint on idle
  const supported = getSupportedRecordingMimeType(RECORDING_MIME_CANDIDATES);
  if (!supported) {
    els["idle-hint"].textContent = `Recording isn't supported here — no supported MIME. Tried: ${RECORDING_MIME_CANDIDATES.join(", ")}.`;
    (els["btn-start"] as HTMLButtonElement).disabled = true;
  } else {
    const ext = RECORDING_EXTENSION;
    els["idle-hint"].textContent =
      `Audio availability depends on OS and browser. Recording will be saved as ${ext} (${supported}).`;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
