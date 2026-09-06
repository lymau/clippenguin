---
title: "ISSUE-007 — Recent Uploads (Local History)"
labels: ["feature", "storage"]
---

## Goal
Beri user akses ringan ke upload terbaru tanpa remote DB.

### Background
Spec ref: `issue.md` §15 Data Model, §24 ISSUE-007 — `chrome.storage.local` only, max 10–20 records.

```ts
interface RecentUpload {
  id: string;
  name: string;
  mimeType: string;
  driveFileId: string;
  webViewLink?: string;
  createdAt: string;
}
```

### Tasks
- [ ] Implement `src/storage/settings.ts` + history helpers (`getRecentUploads`, `addRecentUpload`, `cap max 20`)
- [ ] Persist after successful upload (ISSUE-006)
- [ ] Display latest uploads di Home screen: `• name  Open ↗`
- [ ] `Open in Drive` action → `chrome.tabs.create({ url: webViewLink })` (handle missing link → fallback `https://drive.google.com/file/d/${fileId}/view`)
- [ ] Handle missing Drive links gracefully
- [ ] Limit history, newest first, survive popup reopen

### Definition of Done
- [ ] Recent captures tetap visible setelah reopen extension
- [ ] History tidak grow indefinitely (capped)
- [ ] Open link works, missing link tidak crash

### Depends on
ISSUE-002, ISSUE-006
