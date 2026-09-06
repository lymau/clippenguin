---
title: "ISSUE-001 — Project Bootstrap — Manifest V3 Extension Foundation"
labels: ["setup", "priority: high"]
---

## Goal
Create the Manifest V3 extension foundation so the extension loads cleanly in developer mode.

### Background
Spec ref: `issue.md` §5 Architecture, §19 Permissions, §24 ISSUE-001

The extension must be Chromium Manifest V3, TypeScript + Vite + React, no backend for MVP.

### Tasks
- [ ] Initialize project (`npm`/`pnpm`/`yarn`, `package.json`)
- [ ] Configure TypeScript (`tsconfig.json`, strict mode)
- [ ] Configure Vite (`vite.config.ts` + `vite-plugin` for MV3 / `crxjs` atau manual build)
- [ ] Create `manifest.json` (Manifest V3, `action.default_popup`, `background.service_worker`, `permissions: ["activeTab","storage","identity"]`, `oauth2` placeholder, `host_permissions` minimal)
- [ ] Add background service worker (`src/background/service-worker.ts`) — minimal lifecycle log
- [ ] Add popup page (`src/popup/index.html` + `src/popup/App.tsx`)
- [ ] Add icons (`public/icons/16,48,128`)
- [ ] Add basic styling (`src/styles/global.css` / Tailwind)
- [ ] Confirm extension loads from `chrome://extensions` → Load unpacked

### Definition of Done
- [ ] Extension installs successfully in developer mode
- [ ] Popup opens without blank/errors
- [ ] Service worker starts (visible in `chrome://extensions` > Service Worker)
- [ ] No console errors on clean install
- [ ] `npm run build` produces valid `dist/` with `manifest.json`

### Out of Scope
OAuth logic, capture logic, Drive upload — hanya fondasi.

### References
- https://developer.chrome.com/docs/extensions/mv3/manifest
- https://developer.chrome.com/docs/extensions/reference/api/identity

### Depends on
None (first issue)
