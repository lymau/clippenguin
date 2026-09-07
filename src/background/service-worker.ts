// Clippenguin — Background Service Worker (MV3)
// Minimal lifecycle logging for ISSUE-001. No OAuth/capture logic yet.

const TAG = "[Clippenguin:SW]";

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`${TAG} onInstalled`, details.reason);
});

chrome.runtime.onStartup.addListener(() => {
  console.log(`${TAG} onStartup`);
});

// Keep the worker reachable for future messaging; no-op handler for now.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log(`${TAG} onMessage`, message);
  // Acknowledge so callers don't hit "receiving end does not exist"
  sendResponse({ ok: true, echo: message });
  return false;
});

console.log(`${TAG} service worker loaded — ${new Date().toISOString()}`);

export {};
