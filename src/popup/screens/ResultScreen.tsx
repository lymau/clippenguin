import { useEffect, useId, useState } from "react";
import { Button } from "../components/Button";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { Toast } from "../components/Toast";
import type { UploadProgress, UploadResult } from "../../shared/types";

export type ResultMode = "preview" | "uploading" | "success" | "error";

export interface ResultScreenProps {
  mode: ResultMode;
  previewUrl?: string;
  mimeType?: string;
  initialFilename: string;
  onFilenameChange?: (name: string) => void;
  onSave: (filename: string) => void;
  onDone: () => void;
  onRetry?: () => void;
  uploadProgress?: UploadProgress | null;
  uploadResult?: UploadResult | null;
  errorMessage?: string;
  onOpenInDrive?: () => void;
}

export function ResultScreen({
  mode,
  previewUrl,
  mimeType,
  initialFilename,
  onFilenameChange,
  onSave,
  onDone,
  onRetry,
  uploadProgress,
  uploadResult,
  errorMessage,
  onOpenInDrive,
}: ResultScreenProps) {
  const [filename, setFilename] = useState(initialFilename);
  const inputId = useId();

  useEffect(() => {
    setFilename(initialFilename);
  }, [initialFilename]);

  const isImage = mimeType?.startsWith("image/");
  const isVideo = mimeType?.startsWith("video/");

  const handleSave = () => {
    const trimmed = filename.trim() || initialFilename;
    onSave(trimmed);
  };

  return (
    <div className="popup__body">
      {/* Preview media */}
      <div className="preview" aria-label="Capture preview">
        {previewUrl ? (
          isVideo ? (
            <video src={previewUrl} controls playsInline aria-label={`Preview of ${filename}`} />
          ) : isImage ? (
            <img src={previewUrl} alt={`Preview of ${filename}`} />
          ) : (
            <div className="preview__placeholder">Preview not available for this file type.</div>
          )
        ) : (
          <div className="preview__placeholder">No preview available.</div>
        )}
      </div>

      {/* Uploading */}
      {mode === "uploading" ? (
        <LoadingIndicator
          label="Uploading to Google Drive"
          progress={uploadProgress?.percent}
          filename={uploadProgress?.filename ?? filename}
        />
      ) : null}

      {/* Error */}
      {mode === "error" && errorMessage ? (
        <Toast
          variant="error"
          title="Upload failed"
          message={errorMessage}
          actions={
            onRetry ? (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Retry Upload
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {/* Success */}
      {mode === "success" ? (
        <Toast variant="success" title="Upload complete" message={uploadResult?.name ?? filename} />
      ) : null}

      {/* Filename input — preview & error modes; disabled while uploading/success */}
      {mode === "preview" || mode === "error" ? (
        <div className="field">
          <label htmlFor={inputId} className="field__label">
            Filename
          </label>
          <input
            id={inputId}
            className="input"
            type="text"
            value={filename}
            onChange={(e) => {
              setFilename(e.target.value);
              onFilenameChange?.(e.target.value);
            }}
            placeholder={initialFilename}
            aria-label="Filename for upload"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      ) : mode === "success" ? (
        <p className="text-sm-muted" style={{ margin: 0, wordBreak: "break-all" }} aria-live="polite">
          {uploadResult?.name ?? filename}
        </p>
      ) : null}

      {/* Actions — one dominant action per state (§13) */}
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {mode === "preview" || mode === "error" ? (
          <>
            <Button variant="primary" fullWidth onClick={handleSave} aria-label="Save to Google Drive" disabled={!filename.trim()}>
              Save to Google Drive
            </Button>
            <Button variant="ghost" fullWidth onClick={onDone}>
              Cancel
            </Button>
          </>
        ) : mode === "uploading" ? (
          <Button variant="ghost" fullWidth onClick={onDone} aria-label="Cancel upload">
            Cancel
          </Button>
        ) : (
          <>
            {uploadResult?.webViewLink || onOpenInDrive ? (
              <Button
                variant="primary"
                fullWidth
                onClick={() => {
                  if (onOpenInDrive) onOpenInDrive();
                  else if (uploadResult?.webViewLink) window.open(uploadResult.webViewLink, "_blank", "noreferrer");
                }}
                aria-label="Open in Google Drive"
              >
                Open in Google Drive
              </Button>
            ) : null}
            <Button variant={uploadResult?.webViewLink || onOpenInDrive ? "secondary" : "primary"} fullWidth onClick={onDone} aria-label="Done">
              Done
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
