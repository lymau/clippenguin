---
title: "ISSUE-003 — Google OAuth via chrome.identity"
labels: ["auth", "google-api", "priority: high"]
---

## Goal
Connect each extension user to **their own** Google Drive via `chrome.identity`.

### Background
Spec ref: `issue.md` §8 Authentication, §9 Google Cloud Setup, §18 Security, §24 ISSUE-003

Scope **wajib** minimal:
```
https://www.googleapis.com/auth/drive.file
```
JANGAN pakai `https://www.googleapis.com/auth/drive` untuk MVP.

### Tasks
- [ ] Configure Google Cloud Project: enable Drive API, OAuth consent screen, Chrome Extension OAuth client
- [ ] Configure `manifest.json` `oauth2` + `permissions: ["identity"]`:
```json
{
  "permissions": ["identity"],
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/drive.file"]
  }
}
```
- [ ] Implement `src/google/auth.ts`: `getAuthToken(interactive)`, `removeCachedToken`, invalid-token recovery (`chrome.identity.removeCachedAuthToken`)
- [ ] Implement interactive Connect flow — jelaskan permission dulu sebelum trigger OAuth (Flow A)
- [ ] Implement `AUTH_GET_TOKEN` / `AUTH_SIGN_OUT` messages (`src/shared/messages.ts`)
- [ ] Display connected account email via `https://www.googleapis.com/oauth2/v1/userinfo` atau `people` API (jangan log token)
- [ ] Implement disconnect: `removeCachedAuthToken` + clear `chrome.storage.local` auth state
- [ ] Handle errors: user closed login, denied permission, token expired, misconfigured client (§17 OAuth errors)

### Definition of Done
- [ ] Test Account A can authenticate & stays connected after popup reopen
- [ ] Test Account B (different Chrome profile / account switch) authenticates independently
- [ ] No password/token stored in `chrome.storage.local` or logs
- [ ] Denied OAuth shows friendly message, tidak crash

### Security Rules
- Jangan commit `client_id` real ke docs sebagai credential; pakai placeholder + `.env` / `manifest` template
- Jangan log token, jangan kirim token ke backend

### Depends on
ISSUE-001, ISSUE-002
