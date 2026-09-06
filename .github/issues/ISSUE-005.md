---
title: "ISSUE-005 — Screen Recorder (getDisplayMedia + MediaRecorder)"
labels: ["capture", "recording", "priority: high"]
---

## Goal
Implement explicit screen recording with dedicated recorder page.

### Background
Spec ref: `issue.md` §6 Screen recording, §7 Recording Architecture, §21 Performance, §24 ISSUE-005

Arsitektur wajib:
```
Popup --(user click)--> Recorder Page (owns MediaStream + MediaRecorder) --> Blob/File --> Preview/Upload
```
Jangan taruh recording logic di popup kecil (popup lifecycle akan kill recording) dan jangan di background service worker.

### Tasks
- [ ] Build dedicated recorder page `src/recorder/recorder.html` + `recorder.ts` + `recorder.css` (buka via `chrome.tabs.create` atau `chrome.windows.create`)
- [ ] Call `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })` dari user interaction
- [ ] Detect supported MIME: 
```ts
const candidates = ["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];
const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t));
```
  fallback error jika tidak ada
- [ ] Init `MediaRecorder(stream, { mimeType })`, store `chunks: Blob[]` via `ondataavailable`
- [ ] On stop → `new Blob(chunks, { type: mimeType })` → File
- [ ] Timer UI update while recording, Stop button, optional pause/resume hanya jika reliable
- [ ] Handle browser stop-sharing event (`stream.getVideoTracks()[0].onended`)
- [ ] Stop all tracks after recording: `stream.getTracks().forEach(t => t.stop())` (§21)
- [ ] Generate default filename: `screen-recording-YYYY-MM-DD-HH-mm-ss.webm` + preview URL (`URL.createObjectURL`), cleanup `URL.revokeObjectURL`
- [ ] Expose audio status (mic/system) jika supported

### Definition of Done
- [ ] User dapat select screen/window/tab via native picker
- [ ] Record several minutes tanpa memory leak
- [ ] Stop ends cleanly, result playable di extension UI (`<video>`)
- [ ] Tracks stopped, object URL revoked on cleanup

### Depends on
ISSUE-001, ISSUE-002
