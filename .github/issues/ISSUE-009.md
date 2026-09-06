---
title: "ISSUE-009 — Security Review (Least-Privilege)"
labels: ["security", "review"]
---

## Goal
Ensure extension follows least-privilege & MV3 secure practices.

### Background
Spec ref: `issue.md` §18 Security Requirements, §19 Permissions, §24 ISSUE-009

### Tasks
- [ ] Review `manifest.json` permissions — hanya `activeTab`, `storage`, `identity`; hapus yang tidak dipakai
- [ ] Review OAuth scopes — hanya `drive.file`, bukan `drive`
- [ ] Search code for token logging: `grep -R "access_token\|getAuthToken" --include="*.ts"`
- [ ] Search code for remote script loading: `eval`, `new Function`, `<script src="http`, `import("http`
- [ ] Review message validation — typed messages, validate origin/payload
- [ ] Review CSP — tidak load executable JS dari remote (MV3 default CSP)
- [ ] Review captured data lifecycle — Blob dibersihkan, object URL revoked, tidak persist capture tanpa consent
- [ ] Ensure: no OAuth secret committed, no password collected, HTTPS only

### Checklist (Definition of Done)
- [ ] No unnecessary permission remains
- [ ] No OAuth secret committed (`git log --all --full-history -- "*client_secret*"`)
- [ ] No access token logged or persisted as regular app data
- [ ] `npm run build` passes CSP checks

### Depends on
ISSUE-003, ISSUE-006, ISSUE-008

### Junior Rules Ref
- Do not commit OAuth credentials/secrets
- Do not request permissions a feature doesn't need
- Do not silently upload captures
