---
title: "ISSUE-002 — Design System and Popup Shell"
labels: ["ui/ux", "frontend"]
---

## Goal
Build the reusable UI shell and design system for the popup.

### Background
Spec ref: `issue.md` §13 UI/UX Requirements, §14 Extension State Machine, §15 Data Model, §24 ISSUE-002

Popup size: compact, high-contrast, one dominant action per state.

### Tasks
- [ ] Define typography, spacing scale, colors (Tailwind config / CSS variables)
- [ ] Define `Button`, `Card`, `StatusIndicator`, `LoadingIndicator`, `Toast/Error` components (`src/popup/components/`)
- [ ] Build `Home` screen — Capture (Screenshot + Record Screen) + Recent placeholder + Settings link (lihat §13 Popup — Home)
- [ ] Build `Auth` screen — "Save captures directly to Drive" + `[ Connect Google Drive ]` + scope disclosure (§13 First-time state)
- [ ] Build `Result` screen — preview, filename input, `[ Save to Google Drive ]`, success state `[ Open in Google Drive ] [ Done ]`
- [ ] Wire `AppState` type: `AUTH_REQUIRED | READY | CAPTURING | PREVIEW | UPLOADING | SUCCESS | ERROR` (`src/shared/types.ts`)
- [ ] Ensure keyboard navigation, visible focus states, accessible button names (§20 Accessibility)

### Definition of Done
- [ ] UI works at extension popup dimensions (360–400px width)
- [ ] Keyboard navigation usable (Tab, Enter, Esc)
- [ ] Components reusable (no duplicated button/card styles)
- [ ] All states render without real API (mock props)

### Depends on
ISSUE-001
