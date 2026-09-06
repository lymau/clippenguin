# Browser Extension — Screen Capture & Screen Record to Google Drive

## 1. Project Overview

Build a Chromium browser extension that allows users to:

1. Capture a screenshot.
2. Record the screen.
3. Preview the result.
4. Give the result a file name.
5. Upload the result directly to the user's Google Drive.
6. Authenticate with the user's Google account before the first upload.
7. Work for different users without requiring a shared backend account or shared Google Drive.

The primary target is a clean, fast, user-friendly Chrome/Chromium extension. The implementation should be easy for a junior programmer or a lower-cost coding model to continue without needing to infer missing requirements.

## 2. Primary Technical Direction

### Platform

- Chrome Extension Manifest V3.
- Chromium-based browsers are the initial target.
- Use extension APIs and standard Web APIs instead of a custom backend where possible.

### Recommended stack

- TypeScript.
- Vite for bundling.
- React for UI, or another lightweight component framework if the repository already uses one.
- CSS/Tailwind for styling.
- Browser APIs for capture/recording.
- Google Drive REST API for uploads.
- `chrome.identity` for Google OAuth2.

### Important architectural decision

Do not introduce a backend for the MVP unless a requirement cannot be implemented client-side.

The user's Google Drive should receive the file using the OAuth token belonging to the current user. Files created through the Drive API with user OAuth credentials are owned by that authenticated user. The Drive API supports uploading file metadata and content through multipart or media upload requests. See the official Drive API documentation.

Recommended Drive scope:

```text
https://www.googleapis.com/auth/drive.file
```

Prefer `drive.file` because it is narrower than full Drive access. Do NOT request `https://www.googleapis.com/auth/drive` for the MVP.

## 3. Product Scope

### MVP — Must Have

- Extension popup UI.
- Google Drive authentication.
- Authenticated Google account display.
- Screenshot of current visible browser tab.
- Screen recording using browser screen-sharing permission.
- Optional microphone/system audio recording where supported by the browser/OS.
- Recording timer.
- Stop recording.
- Screenshot/recording preview.
- File naming.
- Upload progress.
- Upload success state.
- Open uploaded file in Google Drive.
- Sign out / revoke extension authorization state.
- Local status persistence.
- Useful error messages.

### MVP — Explicitly Out of Scope

Do not implement these unless requested in a later issue:

- Team/shared workspace.
- Server-side video processing.
- Server-side storage.
- Cloud transcoding.
- User accounts outside Google.
- Billing/subscriptions.
- Browser history collection.
- Automatic background recording.
- Recording without explicit user interaction.
- Uploading every recording automatically without user confirmation.
- Full-page scrolling screenshots.
- Advanced video editing.
- Annotation editor.
- AI summarization/transcription.

## 4. User Flows

### Flow A — First-time user

```text
Install extension
      ↓
Open extension
      ↓
Authentication screen
      ↓
User clicks "Connect Google Drive"
      ↓
Google OAuth consent
      ↓
Extension receives OAuth access token
      ↓
Show connected account
      ↓
User can capture or record
```

The extension should explain what the permission is for before triggering an interactive OAuth request. Do not silently trigger a confusing Google authorization dialog on extension startup.

### Flow B — Screenshot

```text
Open extension
      ↓
Click "Screenshot"
      ↓
Capture visible tab
      ↓
Preview image
      ↓
Edit filename
      ↓
Click "Save to Google Drive"
      ↓
Upload
      ↓
Success + Drive link
```

### Flow C — Screen recording

```text
Open extension
      ↓
Click "Record Screen"
      ↓
Open/activate recorder surface
      ↓
User selects screen/window/tab
      ↓
Optional audio selection
      ↓
Recording starts
      ↓
Timer + recording controls
      ↓
User clicks Stop
      ↓
Create recorded Blob/File
      ↓
Preview recording
      ↓
Edit filename
      ↓
Click "Save to Google Drive"
      ↓
Upload
      ↓
Success + Drive link
```

The Screen Capture API requires explicit user permission and transient user activation. A recording flow must therefore be initiated by a real user interaction, not silently in the background.

## 5. Architecture

Recommended high-level structure:

```text
┌─────────────────────────────────────┐
│           Extension UI              │
│                                     │
│  Popup / Recorder / Result Screen   │
└─────────────────┬───────────────────┘
                  │ chrome.runtime
                  ▼
┌─────────────────────────────────────┐
│        Background Service Worker    │
│                                     │
│ - messages                           │
│ - active tab operations              │
│ - screenshot orchestration           │
│ - OAuth token access                 │
│ - Drive upload coordination         │
└───────────┬────────────┬────────────┘
            │            │
            ▼            ▼
  Chrome Extension APIs   Google Drive API
            │            │
            │            ▼
            │      User's Google Drive
            │
            ▼
   Capture / Permissions
            │
            ▼
     MediaStream / Blob
```

### Suggested project structure

```text
src/
├── background/
│   └── service-worker.ts
├── popup/
│   ├── App.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Auth.tsx
│   │   ├── Recording.tsx
│   │   └── Result.tsx
│   └── components/
├── recorder/
│   ├── recorder.html
│   ├── recorder.ts
│   └── recorder.css
├── capture/
│   ├── screenshot.ts
│   └── recording.ts
├── google/
│   ├── auth.ts
│   └── drive.ts
├── storage/
│   └── settings.ts
├── shared/
│   ├── messages.ts
│   ├── types.ts
│   └── constants.ts
└── styles/
    └── global.css
```

The exact framework structure can differ, but responsibilities should remain separated.

## 6. Browser APIs

### Screenshot

For a screenshot of the currently visible browser tab, use the Chrome extension `tabs.captureVisibleTab` API from an extension context with the necessary permissions.

Expected output:

```text
Data URL / image data
        ↓
Blob
        ↓
File
        ↓
Google Drive upload
```

For MVP, capture only the visible viewport. Full-page scrolling capture should be a separate feature because it requires page scrolling, stitching, and edge-case handling.

### Screen recording

Use:

```javascript
navigator.mediaDevices.getDisplayMedia()
```

This returns a `MediaStream` containing the user-selected display surface. The stream can be passed to `MediaRecorder` for recording.

Example conceptual flow:

```ts
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: true,
});

const recorder = new MediaRecorder(stream);
const chunks: Blob[] = [];

recorder.ondataavailable = (event) => {
  if (event.data.size > 0) chunks.push(event.data);
};

recorder.onstop = () => {
  const blob = new Blob(chunks, {
    type: recorder.mimeType,
  });
};

recorder.start();
```

Do not assume that the same audio options work on every browser/OS. Screen/system audio support varies by browser and platform.

## 7. Recording Architecture

Do not keep the entire recording logic inside the small popup if it causes the popup lifecycle to interfere with recording.

Recommended approach:

```text
Popup
  ↓
User clicks Record
  ↓
Open dedicated recorder page/window
  ↓
User selects capture source
  ↓
Recorder page owns MediaStream + MediaRecorder
  ↓
Stop
  ↓
Create Blob/File
  ↓
Pass result to result/upload flow
```

The recorder page should remain focused on recording state. The background service worker coordinates extension-level messaging but should not be treated as a permanent long-running recording process.

## 8. Authentication

### OAuth implementation

Use Chrome's `chrome.identity` API to obtain Google OAuth2 access tokens for the extension.

Manifest concept:

```json
{
  "permissions": [
    "identity"
  ],
  "oauth2": {
    "client_id": "YOUR_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/drive.file"
    ]
  }
}
```

The exact client ID must come from Google Cloud Console and must not be hard-coded into documentation as a real credential.

### Authentication rules

1. Do not collect Google passwords.
2. Do not store Google passwords.
3. Do not ask users for access tokens manually.
4. Do not send OAuth tokens to a custom backend.
5. Use the current user's OAuth token for Drive API calls.
6. Handle expired/invalid access tokens by removing the cached token and requesting a fresh one.
7. Keep OAuth permission scope minimal.
8. Provide a visible connected-account state.
9. Provide a way to disconnect the extension from the user's current authorization state.

### Multi-user requirement

The extension must not contain a fixed Google account.

User A:

```text
Extension → OAuth User A → Drive User A
```

User B:

```text
Extension → OAuth User B → Drive User B
```

The same extension package supports both users.

## 9. Google Cloud Setup

Create a Google Cloud project dedicated to the extension.

Enable:

- Google Drive API.

Configure:

- OAuth consent screen.
- Chrome Extension OAuth client.
- Authorized configuration required by Google for the extension/client.
- `drive.file` scope.

For production/public use, review Google's OAuth verification requirements. Do not design the application around full `drive` scope just to avoid configuration work.

Important: Google treats public applications and OAuth scopes according to their sensitivity/restriction levels. The current Drive documentation recommends narrow scopes such as `drive.file` and explains verification requirements.

## 10. Google Drive Upload

Use the Google Drive API `files.create` endpoint.

Preferred MVP behavior:

```text
Capture file
   ↓
Build metadata
   ↓
Multipart upload
   ↓
Drive file created
   ↓
Return file ID / webViewLink
```

Metadata example:

```json
{
  "name": "screen-recording-2026-09-06-21-30.webm",
  "mimeType": "video/webm"
}
```

For screenshots:

```text
image/png
```

For recordings:

```text
video/webm
```

Do not assume WebM is always the best long-term format. Confirm `MediaRecorder.isTypeSupported()` before selecting the MIME type.

Recommended MIME selection strategy:

```ts
const candidates = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

const mimeType = candidates.find((type) =>
  MediaRecorder.isTypeSupported(type)
);
```

If no supported format exists, show a meaningful error instead of creating a corrupt file.

## 11. Google Drive Folder Strategy

MVP default:

```text
My Drive/
└── Browser Captures/
    ├── Screenshot...
    ├── Screen Recording...
    └── ...
```

Recommended behavior:

1. On first upload, create `Browser Captures` if needed.
2. Save the folder ID locally.
3. Reuse the stored folder ID for subsequent uploads.
4. If the folder no longer exists or upload fails because the folder is invalid, recreate/find the folder and retry once.

Do not scan the user's entire Drive unnecessarily.

## 12. File Naming

Default screenshot format:

```text
screenshot-YYYY-MM-DD-HH-mm-ss.png
```

Default recording format:

```text
screen-recording-YYYY-MM-DD-HH-mm-ss.webm
```

Requirements:

- Sanitize invalid characters.
- Prevent empty names.
- Keep the extension consistent with the MIME type.
- Allow users to rename before upload.

Example:

```text
meeting-demo-2026-09-06-21-45.webm
```

## 13. UI / UX Requirements

The extension should feel like a focused productivity tool, not a configuration panel.

### Visual direction

- Clean.
- Modern.
- Compact.
- High contrast.
- Clear primary action.
- Avoid unnecessary settings on the home screen.
- Use one dominant action per state.
- Use clear icons with text labels.
- Support keyboard focus states.
- Do not use dark patterns around OAuth or upload permissions.

### Popup — Home

Suggested structure:

```text
┌──────────────────────────────────┐
│ Capture                           │
│ Connected to Google Drive         │
│                                  │
│ ┌────────────┐  ┌──────────────┐ │
│ │ Screenshot │  │ Record Screen│ │
│ └────────────┘  └──────────────┘ │
│                                  │
│ Recent                           │
│ • screenshot.png       Open ↗    │
│ • demo.webm            Open ↗    │
│                                  │
│ Settings                         │
└──────────────────────────────────┘
```

### First-time state

```text
┌──────────────────────────────────┐
│ Save captures directly to Drive  │
│                                  │
│ Your files stay in your Google   │
│ Drive.                           │
│                                  │
│ [ Connect Google Drive ]         │
│                                  │
│ Access requested: Drive files    │
│ created/used by this extension.  │
└──────────────────────────────────┘
```

### Recording state

Show:

- Recording indicator.
- Elapsed time.
- Stop button.
- Optional pause/resume only if implemented reliably.
- Selected source information where available.
- Audio status if supported.

Example:

```text
┌──────────────────────────────────┐
│ ● Recording                      │
│                                  │
│             04:32                │
│                                  │
│           [ Stop ]               │
└──────────────────────────────────┘
```

### Uploading state

```text
Uploading to Google Drive
████████████████░░░░ 78%

screen-recording-21-30.webm
```

Do not freeze the UI without explaining what is happening.

### Success state

```text
Upload complete

screen-recording-21-30.webm

[ Open in Google Drive ]
[ Done ]
```

## 14. Extension State Machine

Define the UI around explicit states.

```text
AUTH_REQUIRED
     ↓
READY
     ↓
CAPTURING
     ↓
PREVIEW
     ↓
UPLOADING
     ↓
SUCCESS
```

Error states can branch from any operational state:

```text
CAPTURING ───────→ ERROR
UPLOADING ───────→ ERROR
AUTH_REQUIRED ───→ ERROR
```

Recommended shared state:

```ts
type AppState =
  | "AUTH_REQUIRED"
  | "READY"
  | "CAPTURING"
  | "PREVIEW"
  | "UPLOADING"
  | "SUCCESS"
  | "ERROR";
```

## 15. Data Model

No remote database is required for MVP.

Local settings can be stored using `chrome.storage.local`.

Suggested shape:

```ts
interface ExtensionSettings {
  driveFolderId?: string;
  driveFolderName: string;
  lastConnectedEmail?: string;
  preferredCaptureMode?: "screenshot" | "recording";
  preferredAudioMode?: "none" | "microphone" | "system" | "both";
}
```

Do not store raw OAuth access tokens in `chrome.storage.local` when Chrome's identity token cache can be used instead.

Recent upload history may be stored locally:

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

Limit local history to a reasonable small number, such as 10–20 records.

## 16. Messaging

Use typed runtime messages.

Example:

```ts
type Message =
  | { type: "AUTH_GET_TOKEN" }
  | { type: "AUTH_SIGN_OUT" }
  | { type: "SCREENSHOT_CAPTURE" }
  | { type: "UPLOAD_FILE"; file: UploadPayload };
```

Do not scatter string literals such as:

```ts
chrome.runtime.sendMessage({ type: "upload" });
```

across dozens of files.

Centralize message types and handlers.

## 17. Error Handling

Every failure must have:

1. Internal log detail for developers.
2. User-friendly message for users.
3. Recovery action where possible.

### OAuth errors

Examples:

- User closed login.
- User denied Drive permission.
- OAuth token expired.
- OAuth token invalid.
- Extension not configured correctly.

User-facing wording examples:

```text
Google Drive is not connected.
Connect your account to save captures.
```

```text
Google Drive permission was denied.
No file was uploaded.
```

### Capture errors

Examples:

- Active tab cannot be captured.
- Restricted browser page.
- User denied screen capture.
- Screen source was unavailable.
- Operating system blocked capture.

Do not expose raw exception text as the primary user message.

### Upload errors

Examples:

- Network offline.
- Request timeout.
- Token invalid.
- Drive quota exceeded.
- Permission error.
- File too large.
- API rate limit.

Suggested recovery pattern:

```text
Upload failed

Your recording is still available in this session.

[ Retry Upload ]
```

Do not discard the captured Blob immediately after an upload failure.

## 18. Security Requirements

### OAuth

- Minimal scopes.
- Never collect passwords.
- Never log access tokens.
- Never send tokens to analytics.
- Never include tokens in error messages.
- Use HTTPS for Google API requests.

### Content Security Policy

Follow Manifest V3 extension security requirements.

Do not load executable JavaScript from remote URLs.

Do not use arbitrary remote scripts as a shortcut for implementing features.

### Capture privacy

The extension must make capture explicit.

The extension must not:

- Record automatically after installation.
- Capture without user action.
- Upload without user confirmation in the capture flow.
- Read page contents unless a feature explicitly requires it.
- Collect unrelated browsing data.

## 19. Permissions

Keep permissions minimal.

Likely permissions for MVP may include:

```json
{
  "permissions": [
    "activeTab",
    "storage",
    "identity"
  ]
}
```

Additional permissions should be introduced only when a concrete implementation requires them.

Avoid requesting broad permissions such as unrestricted site access unless required.

## 20. Accessibility

Minimum requirements:

- All controls keyboard accessible.
- Visible focus states.
- Buttons have accessible names.
- Color is not the only indicator of status.
- Text remains readable at the supported popup size.
- Error messages are associated with the relevant action.
- Loading states are announced appropriately where practical.

## 21. Performance Requirements

### Screenshot

- UI should respond immediately to click.
- Avoid unnecessary image conversions.
- Convert only once before upload.

### Recording

- Avoid excessive memory copies.
- Store chunks rather than repeatedly rebuilding the entire Blob during recording.
- Stop all MediaStream tracks after recording ends.
- Release object URLs after they are no longer needed.

Example cleanup:

```ts
stream.getTracks().forEach((track) => track.stop());
URL.revokeObjectURL(previewUrl);
```

Large recordings should not be duplicated in memory unnecessarily.

## 22. Testing Strategy

### Unit tests

Test:

- File name generation.
- MIME type selection.
- Filename sanitization.
- Message validation.
- Upload metadata generation.
- State transitions.
- Error mapping.

### Integration tests

Test:

- OAuth success.
- OAuth cancellation.
- Screenshot capture.
- Recording start.
- Recording stop.
- Preview generation.
- Drive upload.
- Invalid token recovery.
- Retry after failed upload.

### Manual browser tests

At minimum:

- Latest Chrome on macOS.
- Latest Chrome on Windows.
- Chrome with one Google account.
- Chrome with multiple Google accounts.
- User denies OAuth.
- User denies screen sharing.
- User stops screen sharing using browser UI.
- Network disconnected during upload.
- Large recording.
- Restricted browser page.

Audio behavior must be validated separately because support varies by operating system and browser.

## 23. Acceptance Criteria

### Authentication

- [ ] New user sees a clear Google Drive connection screen.
- [ ] Clicking Connect Google Drive starts OAuth.
- [ ] Successful OAuth shows the connected account.
- [ ] Denied OAuth does not break the extension.
- [ ] OAuth token is never displayed or logged.
- [ ] Extension can be used by multiple independent Google users.

### Screenshot

- [ ] Clicking Screenshot captures the visible current tab.
- [ ] Screenshot preview is displayed.
- [ ] User can edit the filename.
- [ ] User can upload to Drive.
- [ ] Successful upload returns a Drive file identifier/link.
- [ ] User can open the uploaded file in Drive.

### Recording

- [ ] Clicking Record Screen starts an explicit screen-share selection flow.
- [ ] User can select the capture source.
- [ ] Recording timer updates while recording.
- [ ] Stop ends the recording cleanly.
- [ ] All capture tracks are stopped after recording.
- [ ] Recorded media can be previewed.
- [ ] User can rename the recording.
- [ ] User can upload the recording to Drive.

### Upload

- [ ] Upload progress is visible.
- [ ] Upload failure does not discard the current capture immediately.
- [ ] Retry works for recoverable failures.
- [ ] Uploaded files are saved under the expected Drive folder.
- [ ] File MIME type matches file extension.

### UX

- [ ] First-time experience is understandable without documentation.
- [ ] Primary actions are obvious.
- [ ] Buttons have clear labels.
- [ ] Loading states are visible.
- [ ] Errors are actionable.
- [ ] Success state provides a Drive link.

## 24. Implementation Issues

The following issues should be completed in order.

### ISSUE-001 — Project Bootstrap

**Goal:** Create the Manifest V3 extension foundation.

Tasks:

- [ ] Initialize project.
- [ ] Configure TypeScript.
- [ ] Configure Vite.
- [ ] Create `manifest.json`.
- [ ] Add background service worker.
- [ ] Add popup page.
- [ ] Add icons.
- [ ] Add basic styling.
- [ ] Confirm extension loads from `chrome://extensions`.

Definition of Done:

- Extension installs successfully in developer mode.
- Popup opens.
- Service worker starts.
- No console errors on a clean installation.

### ISSUE-002 — Design System and Popup Shell

**Goal:** Build the reusable UI shell.

Tasks:

- [ ] Define typography.
- [ ] Define spacing scale.
- [ ] Define buttons.
- [ ] Define cards.
- [ ] Define status indicators.
- [ ] Define loading indicator.
- [ ] Define toast/error component.
- [ ] Build Home screen.
- [ ] Build Authentication screen.
- [ ] Build Result screen.

Definition of Done:

- UI works at the extension popup dimensions.
- Keyboard navigation is usable.
- Components are reusable rather than duplicated.

### ISSUE-003 — Google OAuth

**Goal:** Connect extension users to their own Google Drive.

Tasks:

- [ ] Configure Google Cloud project.
- [ ] Enable Drive API.
- [ ] Create Chrome Extension OAuth client.
- [ ] Configure `chrome.identity`.
- [ ] Implement interactive Connect flow.
- [ ] Implement token retrieval.
- [ ] Implement invalid token recovery.
- [ ] Display connected account email.
- [ ] Implement disconnect state.

Definition of Done:

- A test Google account can authenticate.
- A second test Google account can authenticate independently.
- No user credential is stored by the extension.

### ISSUE-004 — Screenshot Capture

**Goal:** Capture the visible browser tab.

Tasks:

- [ ] Implement `captureVisibleTab` integration.
- [ ] Convert result to Blob/File.
- [ ] Generate default filename.
- [ ] Build preview.
- [ ] Add capture error handling.

Definition of Done:

- Screenshot is visually correct.
- PNG can be previewed.
- User can proceed to upload.

### ISSUE-005 — Screen Recorder

**Goal:** Implement explicit screen recording.

Tasks:

- [ ] Build dedicated recorder page.
- [ ] Call `getDisplayMedia()` from user interaction.
- [ ] Detect supported MIME types.
- [ ] Initialize `MediaRecorder`.
- [ ] Store recording chunks.
- [ ] Update timer.
- [ ] Handle browser stop-sharing event.
- [ ] Stop all tracks.
- [ ] Generate Blob/File.
- [ ] Generate preview URL.
- [ ] Cleanup preview URL.

Definition of Done:

- User can select a screen/window/tab.
- User can record for several minutes.
- User can stop recording.
- Result is playable inside the extension UI.

### ISSUE-006 — Google Drive Upload

**Goal:** Upload screenshot/recording to authenticated user's Drive.

Tasks:

- [ ] Implement Drive API client.
- [ ] Build file metadata.
- [ ] Implement multipart/media upload.
- [ ] Create `Browser Captures` folder.
- [ ] Cache folder ID.
- [ ] Add progress UI where technically available.
- [ ] Handle upload errors.
- [ ] Handle expired token.
- [ ] Return file ID and Drive link.

Definition of Done:

- Screenshot appears in authenticated user's Drive.
- Recording appears in authenticated user's Drive.
- Files are owned by the authenticated user.
- Retry works after transient failures.

### ISSUE-007 — Recent Uploads

**Goal:** Give users lightweight access to recent uploads.

Tasks:

- [ ] Store local upload history.
- [ ] Display latest uploads.
- [ ] Add Open in Drive action.
- [ ] Add max history size.
- [ ] Handle missing Drive links.

Definition of Done:

- Recent captures remain visible after reopening the extension.
- History does not grow indefinitely.

### ISSUE-008 — Error and Recovery Layer

**Goal:** Standardize operational error handling.

Tasks:

- [ ] Create error types.
- [ ] Create user-facing error messages.
- [ ] Add retry actions.
- [ ] Add structured developer logging.
- [ ] Prevent sensitive information from entering logs.

Definition of Done:

- Common OAuth/capture/upload errors have explicit UI states.
- Raw API errors are not directly shown to users.

### ISSUE-009 — Security Review

**Goal:** Ensure the extension follows least-privilege and secure extension practices.

Tasks:

- [ ] Review manifest permissions.
- [ ] Review OAuth scopes.
- [ ] Search code for token logging.
- [ ] Search code for remote script loading.
- [ ] Review message validation.
- [ ] Review content security policy.
- [ ] Review captured data lifecycle.

Definition of Done:

- No unnecessary permission remains.
- No OAuth secret is committed.
- No access token is logged or persisted as regular application data.

### ISSUE-010 — Cross-Platform QA

**Goal:** Validate the extension on supported Chrome environments.

Tasks:

- [ ] Test macOS.
- [ ] Test Windows.
- [ ] Test multiple Google accounts.
- [ ] Test OAuth denial.
- [ ] Test screen-share denial.
- [ ] Test stop-sharing externally.
- [ ] Test network failure.
- [ ] Test large recordings.
- [ ] Test restricted pages.
- [ ] Test audio behavior.

Definition of Done:

- Critical user flows work on supported environments.
- Known browser/platform limitations are documented.

## 25. Junior Programmer Rules

1. Do not combine OAuth, capture, Drive upload, and UI rendering inside one file.
2. Do not put Drive API calls directly into React components.
3. Do not put recording logic into the background service worker.
4. Do not duplicate Google API request logic.
5. Use typed interfaces for messages and payloads.
6. Use `async/await` and explicit error handling.
7. Do not swallow errors with empty `catch` blocks.
8. Do not commit OAuth credentials/secrets.
9. Do not request permissions that a feature does not need.
10. Do not silently upload captures.
11. Always clean up MediaStream tracks.
12. Always revoke object URLs when they are no longer needed.
13. Keep UI state explicit.
14. Prefer small single-purpose modules.
15. Write tests for logic that can run without browser APIs.

## 26. AI Coding Rules

When giving this repository to a cheaper coding model, require the model to:

- Read `issue.md` before changing code.
- Inspect the existing project before creating new files.
- Reuse existing components and utilities when possible.
- Make the smallest change that satisfies the current issue.
- Avoid refactoring unrelated modules.
- Preserve existing behavior unless the issue requires a change.
- Explain assumptions in code comments only where they prevent future mistakes.
- Run tests/lint/build after implementation where available.
- Report files changed.
- Report unresolved issues explicitly.
- Never invent Google OAuth credentials.
- Never replace the Drive scope with broader access without a specific requirement.
- Never bypass browser permission prompts.

## 27. Definition of Done — Whole Project

The project is considered MVP-complete when all of the following are true:

- [ ] Extension installs as Manifest V3.
- [ ] User can connect their Google Drive account.
- [ ] User can capture a screenshot.
- [ ] User can record their screen.
- [ ] User can preview captures.
- [ ] User can rename captures.
- [ ] User can upload captures to Google Drive.
- [ ] Different Google accounts upload into their own Drives.
- [ ] Upload failures are recoverable.
- [ ] Recent uploads are visible.
- [ ] UI is usable without reading developer documentation.
- [ ] OAuth and permissions are least-privilege.
- [ ] No password or OAuth token is stored in application data.
- [ ] Recording streams are cleaned up correctly.
- [ ] Core tests pass.
- [ ] Production OAuth/verification requirements have been reviewed.

## 28. Technical References

Use official documentation as the source of truth when browser or Google behavior differs from this issue file.

- Chrome Identity API: https://developer.chrome.com/docs/extensions/reference/api/identity
- Chrome Manifest: https://developer.chrome.com/docs/extensions/mv3/manifest
- Google OAuth 2.0: https://developers.google.com/identity/protocols/oauth2
- Google Drive API authentication/scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Google Drive file creation/upload: https://developers.google.com/workspace/drive/api/guides/create-file
- Screen Capture API: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API
- `getDisplayMedia()`: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
- MediaRecorder: https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API

## 29. Important Notes on Current Platform Behavior

- Manifest V3 uses a service worker as the extension background context.
- Chrome's Identity API provides OAuth2 token access through `chrome.identity`.
- Google's current Drive guidance recommends narrow scopes such as `drive.file` instead of broad full-Drive access where possible.
- `getDisplayMedia()` requires an explicit user permission flow and user interaction; screen capture permission should not be treated as a permanent silent permission.
- `MediaRecorder` is widely available, but supported codecs and screen-audio behavior can vary by browser and operating system.

When a browser API or Google API changes, prefer the latest official documentation over assumptions embedded in this file.
