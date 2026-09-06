---
title: "ISSUE-004 — Screenshot Capture (captureVisibleTab)"
labels: ["capture", "frontend"]
---

## Goal
Capture the visible browser tab and produce preview + file ready for upload.

### Background
Spec ref: `issue.md` §6 Browser APIs — Screenshot, §10 Drive Upload, §12 File Naming, §24 ISSUE-004

> MVP hanya viewport visible, bukan full-page scrolling.

### Tasks
- [ ] Implement `src/capture/screenshot.ts` via `chrome.tabs.captureVisibleTab` (dipanggil dari background service worker, bukan popup langsung)
- [ ] Message `SCREENSHOT_CAPTURE` (`src/shared/messages.ts`) — popup → background → capture
- [ ] Convert Data URL → Blob → File (`image/png`)
- [ ] Generate default filename: `screenshot-YYYY-MM-DD-HH-mm-ss.png` + sanitize (§12)
- [ ] Build preview (`URL.createObjectURL` + `<img>`, revoke on unmount)
- [ ] Allow rename before upload (validate: non-empty, sanitize invalid chars, keep `.png`)
- [ ] Error handling: restricted page (`chrome://`, `chrome-extension://`), activeTab not granted, capture failed (§17 Capture errors) — tampilkan pesan friendly, jangan raw exception

### Definition of Done
- [ ] Screenshot visually correct (pixel sama dengan tab)
- [ ] PNG preview tampil di Result screen
- [ ] User bisa proceed ke Upload
- [ ] Error pada restricted page menampilkan pesan actionable

### Depends on
ISSUE-001, ISSUE-002
