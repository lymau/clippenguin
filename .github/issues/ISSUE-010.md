---
title: "ISSUE-010 — Cross-Platform QA & Acceptance"
labels: ["qa", "testing"]
---

## Goal
Validate extension on supported Chrome environments & document limitations.

### Background
Spec ref: `issue.md` §22 Testing Strategy, §23 Acceptance Criteria, §27 Definition of Done — Whole Project, §24 ISSUE-010

### Manual Test Matrix
- [ ] Latest Chrome on macOS
- [ ] Latest Chrome on Windows
- [ ] Chrome with one Google account
- [ ] Chrome with multiple Google accounts (account switch)
- [ ] User denies OAuth → friendly error
- [ ] User denies screen sharing → friendly error
- [ ] User stops screen sharing using browser UI (picker X) → recording stops gracefully
- [ ] Network disconnected during upload → retry works
- [ ] Large recording (5+ min) → no OOM, upload succeeds
- [ ] Restricted page (`chrome://extensions`, `chrome://settings`) → screenshot error handled
- [ ] Audio behavior validated (microphone/system/both) — document OS/browser variance

### Acceptance Criteria (from §23)
**Auth:** new user sees Connect screen, OAuth works, denied doesn't break, token never displayed, multi-user works
**Screenshot:** capture visible tab, preview, rename, upload, Drive link, open in Drive
**Recording:** explicit picker, source select, timer, stop, tracks stopped, preview, rename, upload
**Upload:** progress visible, failure doesn't discard capture, retry, correct folder, MIME matches extension
**UX:** first-time understandable, primary actions obvious, loading visible, errors actionable, success has Drive link

### Definition of Done
- [ ] Critical flows work on supported envs
- [ ] Known browser/platform limitations documented in `QA.md` or `README.md`
- [ ] Core unit tests pass (`filename`, `MIME`, `sanitization`, `state transitions`)

### Depends on
ISSUE-001 → ISSUE-008 (all)
