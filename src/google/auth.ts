// Clippenguin — Google OAuth via chrome.identity
// Spec ref: issue.md §8 Authentication, §17 OAuth errors, §18 Security
//
// Security invariants:
// - Never log access tokens.
// - Never persist tokens in chrome.storage.
// - Only persist the connected email (non-sensitive identifier).
// - Use minimal scope: drive.file (configured in manifest.json).

import type { AppError } from "../shared/types";
import { clearAuthStorage, persistAuthEmail } from "../shared/auth-state";

// ─── Error mapping ───────────────────────────────────────────────────────

function toAppError(raw: unknown): AppError {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "");
  const lower = msg.toLowerCase();

  // User closed the OAuth popup / cancelled sign-in
  if (lower.includes("user closed") || lower.includes("user cancelled") || lower.includes("canceled") || lower.includes("not signed in")) {
    return {
      code: "OAUTH_USER_CLOSED",
      message: "Sign-in was cancelled. Try connecting again when you're ready.",
      details: msg,
      recoverable: true,
    };
  }

  // User denied the drive.file permission
  if (lower.includes("denied") || lower.includes("not approved") || lower.includes("access_denied") || lower.includes("the user did not approve")) {
    return {
      code: "OAUTH_DENIED",
      message: "Google Drive permission was denied. No file was uploaded. You can connect again to grant access.",
      details: msg,
      recoverable: true,
    };
  }

  // Misconfigured OAuth client (common during setup)
  if (
    lower.includes("bad client id") ||
    lower.includes("invalid client") ||
    lower.includes("oauth2 not granted") ||
    lower.includes("not configured") ||
    lower.includes("client id") && lower.includes("invalid") ||
    lower.includes("unauthorized_client")
  ) {
    return {
      code: "OAUTH_MISCONFIGURED",
      message: "Google sign-in isn't configured correctly for this extension. Check the OAuth client ID in manifest.json.",
      details: msg,
      recoverable: false,
    };
  }

  if (lower.includes("network") || lower.includes("offline") || lower.includes("fetch failed") || lower.includes("failed to fetch")) {
    return {
      code: "OAUTH_NETWORK_ERROR",
      message: "Network error while connecting to Google. Check your connection and try again.",
      details: msg,
      recoverable: true,
    };
  }

  if (lower.includes("no token") || lower.includes("token") && lower.includes("expired") || lower.includes("invalid token")) {
    return {
      code: "OAUTH_TOKEN_EXPIRED",
      message: "Google Drive is not connected. Connect your account to save captures.",
      details: msg,
      recoverable: true,
    };
  }

  // Fallback — don't surface raw provider text as the primary message (§17)
  return {
    code: "OAUTH_UNKNOWN",
    message: "Could not connect to Google Drive. Please try again.",
    details: msg,
    recoverable: true,
  };
}

// ─── Low-level chrome.identity promisified ───────────────────────────────

function hasIdentityApi(): boolean {
  try {
    const id = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.identity as
      | { getAuthToken?: unknown; removeCachedAuthToken?: unknown }
      | undefined;
    return Boolean(id?.getAuthToken && id?.removeCachedAuthToken);
  } catch {
    return false;
  }
}

export function getRawToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!hasIdentityApi()) {
      reject(new Error("chrome.identity API is not available in this context"));
      return;
    }
    try {
      // @types/chrome modern: callback receives GetAuthTokenResult { token?: string }
      // Older typings: callback receives string | undefined directly.
      chrome.identity.getAuthToken({ interactive }, (result: unknown) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message ?? "getAuthToken failed"));
          return;
        }
        let token: string | undefined;
        if (typeof result === "string") token = result;
        else if (result && typeof result === "object" && "token" in (result as Record<string, unknown>)) {
          token = (result as { token?: string }).token;
        }
        if (typeof token !== "string" || token.length === 0) {
          reject(new Error("No token returned from chrome.identity"));
          return;
        }
        resolve(token);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export function removeCachedToken(token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!hasIdentityApi()) {
      // No-op outside extension context — still clear storage at call site
      resolve();
      return;
    }
    try {
      // Do not log token
      chrome.identity.removeCachedAuthToken({ token }, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          // Non-fatal: token may already be invalidated
          // Still resolve — caller will clear storage anyway
          console.warn("[Clippenguin:Auth] removeCachedAuthToken warning:", lastError.message);
          resolve();
          return;
        }
        resolve();
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Best-effort: clear all cached tokens (Chrome 118+). Falls back to no-op.
 */
export async function clearAllCachedTokens(): Promise<void> {
  const api = chrome?.identity as unknown as { clearAllCachedAuthTokens?: () => Promise<void> | void };
  if (typeof api?.clearAllCachedAuthTokens === "function") {
    try {
      await api.clearAllCachedAuthTokens();
    } catch {
      // ignore — removeCachedAuthToken is the reliable path
    }
  }
}

// ─── User info ───────────────────────────────────────────────────────────

/**
 * Resolve the connected account email using the OAuth2 userinfo endpoint.
 * Caller must hold a valid token; this function never logs the token.
 *
 * Tries v1 then v2 for resilience. Throws on non-2xx.
 */
export async function fetchUserEmail(token: string): Promise<string> {
  // Never log token — ensure no code path interpolates it into logs
  const headers = { Authorization: `Bearer ${token}` };

  const endpoints = [
    "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
    "https://www.googleapis.com/oauth2/v2/userinfo",
  ];

  let lastStatus = 0;
  let lastBody = "";

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers, method: "GET" });
      lastStatus = res.status;
      if (!res.ok) {
        // Read body for diagnostics but never include token
        try {
          lastBody = await res.text();
        } catch {
          lastBody = "";
        }
        // Retry on 5xx; 401/403 should propagate to caller for recovery
        if (res.status >= 500) continue;
        throw new Error(`userinfo ${res.status}: ${lastBody.slice(0, 200)}`);
      }
      const data = (await res.json()) as { email?: string; id?: string };
      if (data.email && typeof data.email === "string") return data.email;
      // Some responses nest email differently — fall through to next endpoint
      lastBody = JSON.stringify(data).slice(0, 200);
    } catch (err) {
      // Network failure — rethrow with context, don't swallow
      if (err instanceof Error && err.message.startsWith("userinfo 401")) throw err;
      if (err instanceof Error && err.message.startsWith("userinfo 403")) throw err;
      // For network/type errors on first endpoint, try next
      const isLast = url === endpoints[endpoints.length - 1];
      if (isLast) throw err;
    }
  }

  throw new Error(`Could not resolve account email (last status ${lastStatus}) ${lastBody.slice(0, 120)}`);
}

// ─── High-level flows ────────────────────────────────────────────────────

/**
 * Obtain an access token and resolve the connected email.
 * Handles invalid-token recovery once: if userinfo returns 401/invalid_token,
 * the cached token is removed and a fresh interactive token is requested.
 *
 * @param interactive - if true, shows Google consent UI when needed (Flow A).
 *                      if false, only returns a token when already granted.
 */
export async function getAuthToken(interactive: boolean): Promise<{ token: string; email: string }> {
  let token: string;
  try {
    token = await getRawToken(interactive);
  } catch (err) {
    throw toAppError(err);
  }

  try {
    const email = await fetchUserEmail(token);
    await persistAuthEmail(email);
    return { token, email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    const isInvalidToken =
      lower.includes("401") ||
      lower.includes("403") ||
      lower.includes("insufficient") ||
      lower.includes("invalid") ||
      lower.includes("unauthorized") ||
      lower.includes("token has been revoked");

    if (isInvalidToken) {
      // Invalid-token recovery (§8 rule 6): purge cached token and retry once
      try {
        await removeCachedToken(token);
      } catch {
        // ignore removal error
      }
      if (!interactive) {
        // Non-interactive recovery can't prompt — surface as expired
        throw {
          code: "OAUTH_TOKEN_EXPIRED",
          message: "Google Drive is not connected. Connect your account to save captures.",
          details: msg,
          recoverable: true,
        } satisfies AppError;
      }
      // One retry with interactive=true
      try {
        const fresh = await getRawToken(true);
        const email = await fetchUserEmail(fresh);
        await persistAuthEmail(email);
        return { token: fresh, email };
      } catch (retryErr) {
        throw toAppError(retryErr);
      }
    }

    // Network or other userinfo failure — token itself may still be cached,
    // but we should not treat this as authenticated without an email.
    // Invalidate for safety on 401/403, otherwise rethrow mapped error.
    if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("offline")) {
      throw toAppError(err);
    }
    // Include invalid-token phrasing already handled; fallback mapping
    throw toAppError(err);
  }
}

/**
 * Lightweight "is still connected?" check used on popup open.
 * Tries non-interactive token + userinfo; falls back to stored email only
 * when the identity API is unavailable (e.g. vite dev server).
 */
export async function getAuthState(): Promise<{ connected: boolean; email?: string }> {
  // Outside extension context: rely on storage
  if (!hasIdentityApi()) {
    try {
      const email = await loadEmailFromStorage();
      return { connected: Boolean(email), email: email ?? undefined };
    } catch {
      return { connected: false };
    }
  }

  try {
    const { email } = await getAuthToken(false);
    return { connected: true, email };
  } catch (err) {
    const appErr = err as AppError;
    // Token expired / not connected is expected when user hasn't connected yet
    if (appErr?.code === "OAUTH_TOKEN_EXPIRED" || appErr?.code === "OAUTH_UNKNOWN") {
      // Check storage for stale email — don't claim connected
      return { connected: false, email: undefined };
    }
    // For user-closed / denied during silent check, also not connected
    return { connected: false };
  }
}

async function loadEmailFromStorage(): Promise<string | null> {
  if (!chrome?.storage?.local) return null;
  const keys = ["lastConnectedEmail", "extensionSettings"] as const;
  const stored = await chrome.storage.local.get([...keys]);
  const direct = stored["lastConnectedEmail"] as string | undefined;
  if (direct) return direct;
  const settings = stored["extensionSettings"] as { lastConnectedEmail?: string } | undefined;
  return settings?.lastConnectedEmail ?? null;
}

/**
 * Disconnect: purge cached token(s) and clear auth state from storage.
 * Never leaves a token in storage (we never store one).
 */
export async function signOut(): Promise<void> {
  // Try to remove the currently cached token non-interactively, if any
  if (hasIdentityApi()) {
    try {
      const token = await getRawToken(false);
      if (token) await removeCachedToken(token);
    } catch {
      // No cached token — nothing to remove, still clear storage
    }
    // Also clear all if API exists (handles multiple accounts edge)
    await clearAllCachedTokens();
  }

  await clearAuthStorage();
  // Extra safety: remove any legacy token keys if they somehow exist
  if (chrome?.storage?.local) {
    try {
      await chrome.storage.local.remove(["oauthToken", "accessToken", "googleToken"]);
    } catch {
      // ignore
    }
  }
}

/**
 * Exposed for Drive upload flows that need a token with interactive fallback.
 * Returns the raw token after ensuring it can fetch userinfo (valid).
 * Prefer `getAuthToken` above when you also need the email.
 */
export async function getValidToken(interactive: boolean): Promise<string> {
  const { token } = await getAuthToken(interactive);
  return token;
}
