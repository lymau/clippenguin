// Clippenguin — Screenshot hook (popup side)
// Spec ref: issue.md §6 Screenshot, §10 Upload, §12 File Naming, §17 Capture errors
// ISSUE-004: popup → background via SCREENSHOT_CAPTURE; preview via Blob URL.
//
// Responsibilities:
// - Request screenshot via chrome.runtime message (never call captureVisibleTab directly)
// - Convert Data URL → Blob → object URL for preview
// - Provide filename helpers (generate/sanitize/validate) via shared capture module
// - Handle revocation of previous preview URLs on replacement / unmount

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppError } from "../../shared/types";
import { sendMessage } from "../../shared/messages";
import {
  createPreviewUrl,
  dataUrlToBlob,
  revokePreviewUrl,
  sanitizeFilename,
  SCREENSHOT_MIME,
} from "../../capture/screenshot";

export interface UseScreenshotReturn {
  // Data for the Result / PREVIEW screen
  previewUrl: string | null;
  dataUrl: string | null;
  blob: Blob | null;
  filename: string;
  mimeType: string;
  error: AppError | null;
  isCapturing: boolean;
  // Actions
  capture: () => Promise<boolean>;
  setFilename: (name: string) => void;
  clear: () => void;
  clearError: () => void;
}

export function useScreenshot(): UseScreenshotReturn {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [filename, setFilenameState] = useState<string>("");
  const [mimeType, setMimeType] = useState<string>(SCREENSHOT_MIME);
  const [error, setError] = useState<AppError | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Keep previous preview URL for revocation
  const prevPreviewRef = useRef<string | null>(null);

  const revokePrevPreview = useCallback(() => {
    if (prevPreviewRef.current) {
      revokePreviewUrl(prevPreviewRef.current);
      prevPreviewRef.current = null;
    }
    if (previewUrl) {
      revokePreviewUrl(previewUrl);
    }
  }, [previewUrl]);

  const setFilename = useCallback((name: string) => {
    // Allow typing anything; sanitization happens on save / when generating file
    // But ensure we normalise empty → keep user's raw typing for UX
    // ResultScreen also validates; here we just store.
    setFilenameState(name);
  }, []);

  const clear = useCallback(() => {
    revokePrevPreview();
    setPreviewUrl(null);
    setDataUrl(null);
    setBlob(null);
    setFilenameState("");
    setMimeType(SCREENSHOT_MIME);
    setError(null);
    setIsCapturing(false);
  }, [revokePrevPreview]);

  const clearError = useCallback(() => setError(null), []);

  const capture = useCallback(async (): Promise<boolean> => {
    setIsCapturing(true);
    setError(null);

    try {
      const res = await sendMessage({ type: "SCREENSHOT_CAPTURE" });

      if (!res.ok) {
        const appErr = (res as { ok: false; error: AppError }).error;
        setError(appErr);
        return false;
      }

      const okRes = res as { ok: true; dataUrl?: string; filename?: string; mimeType?: string };
      const returnedDataUrl = okRes.dataUrl;
      const returnedFilename = okRes.filename ?? "";
      const returnedMime = okRes.mimeType ?? SCREENSHOT_MIME;

      if (!returnedDataUrl || typeof returnedDataUrl !== "string" || !returnedDataUrl.startsWith("data:")) {
        setError({
          code: "CAPTURE_INVALID_DATA",
          message: "Screenshot data was invalid. Please try again.",
          details: `Missing/invalid dataUrl (len ${String(returnedDataUrl).slice(0, 40)})`,
          recoverable: true,
        });
        return false;
      }

      // Revoke previous preview URL before creating a new one
      if (prevPreviewRef.current) revokePreviewUrl(prevPreviewRef.current);
      if (previewUrl) revokePreviewUrl(previewUrl);

      let nextBlob: Blob;
      try {
        nextBlob = dataUrlToBlob(returnedDataUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError({
          code: "CAPTURE_CONVERT_FAILED",
          message: "Screenshot was captured but could not be prepared. Please try again.",
          details: msg,
          recoverable: true,
        });
        return false;
      }

      const nextPreview = createPreviewUrl(nextBlob);
      prevPreviewRef.current = nextPreview;

      setDataUrl(returnedDataUrl);
      setBlob(nextBlob);
      setPreviewUrl(nextPreview);
      setFilenameState(sanitizeFilename(returnedFilename || ""));
      setMimeType(returnedMime || nextBlob.type || SCREENSHOT_MIME);

      return true;
    } catch (err) {
      const fallback = err instanceof Error ? err.message : String(err);
      // Distinguish runtime-unavailable (vite dev) from real capture errors
      if (fallback.toLowerCase().includes("runtime not available") || fallback.includes("Extension runtime")) {
        setError({
          code: "RUNTIME_UNAVAILABLE",
          message: "Screenshot is only available inside the extension. Open the popup from chrome://extensions.",
          details: fallback,
          recoverable: true,
        });
      } else {
        setError({
          code: "CAPTURE_FAILED",
          message: "Screenshot failed. Please try again.",
          details: fallback,
          recoverable: true,
        });
      }
      return false;
    } finally {
      setIsCapturing(false);
    }
  }, [previewUrl]);

  // Revoke on unmount
  useEffect(() => {
    return () => {
      if (prevPreviewRef.current) revokePreviewUrl(prevPreviewRef.current);
    };
  }, []);

  // When previewUrl is replaced externally, update ref for next revoke
  useEffect(() => {
    if (previewUrl) prevPreviewRef.current = previewUrl;
  }, [previewUrl]);

  return {
    previewUrl,
    dataUrl,
    blob,
    filename,
    mimeType,
    error,
    isCapturing,
    capture,
    setFilename,
    clear,
    clearError,
  };
}
