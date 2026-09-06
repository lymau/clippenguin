#!/usr/bin/env bash
set -euo pipefail
REPO="lymau/clippenguin"

echo "Ensuring labels exist in $REPO..."
# Buat semua label dulu — gh issue create akan gagal kalau label belum ada
# || true agar set -e tidak exit jika label sudah ada
gh label create "setup"          --repo "$REPO" --color "0e8a16" --description "Project setup" 2>/dev/null || true
gh label create "priority: high" --repo "$REPO" --color "d73a4a" --description "High priority" 2>/dev/null || true
gh label create "ui/ux"          --repo "$REPO" --color "1d76db" --description "UI/UX" 2>/dev/null || true
gh label create "frontend"       --repo "$REPO" --color "1d76db" --description "Frontend" 2>/dev/null || true
gh label create "auth"           --repo "$REPO" --color "5319e7" --description "Authentication" 2>/dev/null || true
gh label create "google-api"     --repo "$REPO" --color "0052cc" --description "Google API" 2>/dev/null || true
gh label create "capture"        --repo "$REPO" --color "fbca04" --description "Capture" 2>/dev/null || true
gh label create "recording"      --repo "$REPO" --color "fbca04" --description "Recording" 2>/dev/null || true
gh label create "upload"         --repo "$REPO" --color "0e8a16" --description "Upload" 2>/dev/null || true
gh label create "feature"        --repo "$REPO" --color "c2e0c6" --description "Feature" 2>/dev/null || true
gh label create "storage"        --repo "$REPO" --color "c2e0c6" --description "Storage" 2>/dev/null || true
gh label create "ux"             --repo "$REPO" --color "d4c5f9" --description "UX" 2>/dev/null || true
gh label create "error-handling" --repo "$REPO" --color "d73a4a" --description "Error handling" 2>/dev/null || true
gh label create "security"       --repo "$REPO" --color "b60205" --description "Security" 2>/dev/null || true
gh label create "review"         --repo "$REPO" --color "ededed" --description "Review" 2>/dev/null || true
gh label create "qa"             --repo "$REPO" --color "006b75" --description "QA" 2>/dev/null || true
gh label create "testing"        --repo "$REPO" --color "006b75" --description "Testing" 2>/dev/null || true

echo "Creating 10 issues in $REPO..."
echo ""

gh issue create --repo "$REPO" --title "ISSUE-001 — Project Bootstrap — Manifest V3 Extension Foundation" --label "setup,priority: high" --body-file ".github/issues/ISSUE-001.md"
gh issue create --repo "$REPO" --title "ISSUE-002 — Design System and Popup Shell" --label "ui/ux,frontend" --body-file ".github/issues/ISSUE-002.md"
gh issue create --repo "$REPO" --title "ISSUE-003 — Google OAuth via chrome.identity" --label "auth,google-api,priority: high" --body-file ".github/issues/ISSUE-003.md"
gh issue create --repo "$REPO" --title "ISSUE-004 — Screenshot Capture (captureVisibleTab)" --label "capture,frontend" --body-file ".github/issues/ISSUE-004.md"
gh issue create --repo "$REPO" --title "ISSUE-005 — Screen Recorder (getDisplayMedia + MediaRecorder)" --label "capture,recording,priority: high" --body-file ".github/issues/ISSUE-005.md"
gh issue create --repo "$REPO" --title "ISSUE-006 — Google Drive Upload (files.create + Folder Strategy)" --label "google-api,upload,priority: high" --body-file ".github/issues/ISSUE-006.md"
gh issue create --repo "$REPO" --title "ISSUE-007 — Recent Uploads (Local History)" --label "feature,storage" --body-file ".github/issues/ISSUE-007.md"
gh issue create --repo "$REPO" --title "ISSUE-008 — Error and Recovery Layer" --label "ux,error-handling" --body-file ".github/issues/ISSUE-008.md"
gh issue create --repo "$REPO" --title "ISSUE-009 — Security Review (Least-Privilege)" --label "security,review" --body-file ".github/issues/ISSUE-009.md"
gh issue create --repo "$REPO" --title "ISSUE-010 — Cross-Platform QA & Acceptance" --label "qa,testing" --body-file ".github/issues/ISSUE-010.md"

echo ""
echo "Done. Cek: gh issue list --repo $REPO"
