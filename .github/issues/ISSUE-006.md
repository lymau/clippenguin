---
title: "ISSUE-006 — Google Drive Upload (files.create + Folder Strategy)"
labels: ["google-api", "upload", "priority: high"]
---

## Goal
Upload screenshot/recording ke authenticated user's Drive dengan folder `Browser Captures`.

### Background
Spec ref: `issue.md` §10 Google Drive Upload, §11 Folder Strategy, §12 File Naming, §17 Upload errors, §24 ISSUE-006

Flow: `Build metadata → Multipart upload → Drive file created → return fileId/webViewLink`

### Tasks
- [ ] Implement `src/google/drive.ts` Drive API client (`fetch https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`)
- [ ] Build file metadata: `{ name, mimeType, parents?: [folderId] }` (screenshot `image/png`, recording `video/webm`)
- [ ] Implement multipart/media upload (boundary, metadata + blob)
- [ ] Folder strategy: cari/create `Browser Captures` folder (`mimeType: application/vnd.google-apps.folder`), cache `driveFolderId` di `chrome.storage.local` (`ExtensionSettings`), reuse; jika folder invalid → recreate + retry once
- [ ] Progress UI where technically available (XHR `onprogress` atau fetch readable stream fallback — jangan freeze UI)
- [ ] Handle expired token: 401 → `removeCachedAuthToken` → retry once dengan fresh token
- [ ] Handle upload errors: offline, timeout, quota, permission, file too large, rate limit (§17) — tampilkan Retry, jangan discard Blob
- [ ] Return `fileId` + `webViewLink` (`fields=id,name,webViewLink,mimeType`)
- [ ] Wire `UPLOAD_FILE` message

### Definition of Done
- [ ] Screenshot appears in authenticated user's Drive under `Browser Captures`
- [ ] Recording appears in authenticated user's Drive
- [ ] Files owned by authenticated user (bukan service account)
- [ ] Retry works after transient failures (network/offline/401)
- [ ] Progress visible during upload

### Depends on
ISSUE-003, ISSUE-004, ISSUE-005
