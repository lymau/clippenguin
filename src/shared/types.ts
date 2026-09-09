// Clippenguin — Shared types
// Spec ref: issue.md §14 Extension State Machine, §15 Data Model, §16 Messaging

// ─── App State Machine ───────────────────────────────────────────────

export type AppState =
  | "AUTH_REQUIRED"
  | "READY"
  | "CAPTURING"
  | "PREVIEW"
  | "UPLOADING"
  | "SUCCESS"
  | "ERROR";

export const APP_STATES: readonly AppState[] = [
  "AUTH_REQUIRED",
  "READY",
  "CAPTURING",
  "PREVIEW",
  "UPLOADING",
  "SUCCESS",
  "ERROR",
] as const;

// ─── Data Model ──────────────────────────────────────────────────────

export interface ExtensionSettings {
  driveFolderId?: string;
  driveFolderName: string;
  lastConnectedEmail?: string;
  preferredCaptureMode?: "screenshot" | "recording";
  preferredAudioMode?: "none" | "microphone" | "system" | "both";
}

export interface RecentUpload {
  id: string;
  name: string;
  mimeType: string;
  driveFileId: string;
  webViewLink?: string;
  createdAt: string;
}

// ─── Capture / Preview payload ───────────────────────────────────────

export type CaptureKind = "screenshot" | "recording";

export interface PreviewData {
  kind: CaptureKind;
  blob: Blob;
  previewUrl: string; // object URL or data URL
  filename: string;
  mimeType: string;
  durationMs?: number; // for recordings
}

export interface UploadProgress {
  percent: number; // 0–100
  filename: string;
}

// ─── Upload Result ───────────────────────────────────────────────────

export interface UploadResult {
  driveFileId: string;
  webViewLink?: string;
  name: string;
}

// ─── Error ───────────────────────────────────────────────────────────

export interface AppError {
  code: string;
  message: string; // user-facing
  details?: string; // dev detail, not shown as primary message
  recoverable: boolean;
}

// ─── Messaging (typed runtime messages) ──────────────────────────────
// Canonical message types live in ./messages.ts — this re-export keeps
// existing imports working. Prefer importing from "./messages" for new code.

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

export type MessageResponse =
  | { ok: true; echo?: unknown; state?: AppState; recentUploads?: RecentUpload[]; email?: string; result?: UploadResult }
  | { ok: false; error: AppError };
