---
title: "ISSUE-008 — Error and Recovery Layer"
labels: ["ux", "error-handling"]
---

## Goal
Standardize error handling: dev log + user-friendly message + recovery action.

### Background
Spec ref: `issue.md` §17 Error Handling, §24 ISSUE-008

Setiap failure wajib punya: internal detail, user message, recovery.

### Tasks
- [ ] Create `src/shared/errors.ts` — error types: `AuthError`, `CaptureError`, `UploadError` dengan `code` enum
- [ ] Create `src/shared/errorMessages.ts` — mapping code → user-facing string (contoh: "Google Drive permission was denied. No file was uploaded.")
- [ ] Add retry actions: `Retry Upload`, `Reconnect Drive`, `Try Again` (jangan discard Blob setelah upload gagal)
- [ ] Structured developer logging (`console.error` dengan context, tanpa token/sensitive data)
- [ ] Prevent sensitive info entering logs (token, file content) — audit
- [ ] Centralize message validation (`src/shared/messages.ts`) — jangan scatter string literals

### Definition of Done
- [ ] OAuth/capture/upload errors punya explicit UI state (ERROR state)
- [ ] Raw API errors tidak ditampilkan langsung ke user
- [ ] Retry preserves captured Blob

### Depends on
ISSUE-003, ISSUE-004, ISSUE-005, ISSUE-006
