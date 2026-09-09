// Clippenguin — Auth persistence helpers
// Spec ref: issue.md §8/§15. No token is ever persisted — only the email.

export const AUTH_STORAGE_KEYS = {
  email: "lastConnectedEmail",
  // Stored inside the ExtensionSettings object as `lastConnectedEmail`; also
  // mirrored as a top-level key for fast lookup without parsing full settings.
  settings: "extensionSettings",
} as const;

export interface PersistedAuthState {
  email?: string;
}

/**
 * Persist only the connected email. Never persist tokens.
 */
export async function persistAuthEmail(email: string | undefined): Promise<void> {
  if (!chrome?.storage?.local) return;
  if (!email) {
    await chrome.storage.local.remove([AUTH_STORAGE_KEYS.email]);
    // Also clear from settings object if present
    const stored = await chrome.storage.local.get([AUTH_STORAGE_KEYS.settings]);
    const settings = stored[AUTH_STORAGE_KEYS.settings] as Record<string, unknown> | undefined;
    if (settings && "lastConnectedEmail" in settings) {
      const next = { ...settings, lastConnectedEmail: undefined };
      await chrome.storage.local.set({ [AUTH_STORAGE_KEYS.settings]: next });
    }
    return;
  }
  await chrome.storage.local.set({ [AUTH_STORAGE_KEYS.email]: email });
  // Mirror into settings for consistency with ExtensionSettings shape
  const stored = await chrome.storage.local.get([AUTH_STORAGE_KEYS.settings]);
  const settings = (stored[AUTH_STORAGE_KEYS.settings] as Record<string, unknown> | undefined) ?? {};
  await chrome.storage.local.set({
    [AUTH_STORAGE_KEYS.settings]: { ...settings, lastConnectedEmail: email },
  });
}

export async function loadAuthEmail(): Promise<string | undefined> {
  if (!chrome?.storage?.local) return undefined;
  const stored = await chrome.storage.local.get([AUTH_STORAGE_KEYS.email, AUTH_STORAGE_KEYS.settings]);
  const direct = stored[AUTH_STORAGE_KEYS.email] as string | undefined;
  if (direct) return direct;
  const settings = stored[AUTH_STORAGE_KEYS.settings] as Record<string, unknown> | undefined;
  const fromSettings = settings?.["lastConnectedEmail"] as string | undefined;
  return fromSettings;
}

export async function clearAuthStorage(): Promise<void> {
  if (!chrome?.storage?.local) return;
  await chrome.storage.local.remove([AUTH_STORAGE_KEYS.email]);
  const stored = await chrome.storage.local.get([AUTH_STORAGE_KEYS.settings]);
  const settings = stored[AUTH_STORAGE_KEYS.settings] as Record<string, unknown> | undefined;
  if (settings) {
    const { lastConnectedEmail: _omit, ...rest } = settings as Record<string, unknown> & { lastConnectedEmail?: string };
    // Keep other settings; set email to undefined explicitly so callers can distinguish
    await chrome.storage.local.set({ [AUTH_STORAGE_KEYS.settings]: { ...rest, lastConnectedEmail: undefined } });
  }
}
