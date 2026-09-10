import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import baseManifest from "./src/manifest.json";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Never commit a real client ID — inject from env at build time if provided.
  // Supports both VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID for flexibility.
  const oauthClientId =
    env.VITE_GOOGLE_CLIENT_ID?.trim() ||
    env.GOOGLE_CLIENT_ID?.trim() ||
    (baseManifest as { oauth2?: { client_id?: string } }).oauth2?.client_id;

  const manifest = {
    ...baseManifest,
    oauth2: {
      ...(baseManifest as { oauth2?: Record<string, unknown> }).oauth2,
      client_id: oauthClientId,
      scopes: (baseManifest as { oauth2?: { scopes?: string[] } }).oauth2?.scopes ?? [
        "https://www.googleapis.com/auth/drive.file",
      ],
    },
  };

  if (!oauthClientId || oauthClientId.includes("YOUR_")) {
    console.warn(
      "[vite] Google OAuth client_id is still a placeholder. " +
        "Set VITE_GOOGLE_CLIENT_ID in .env (see .env.example) before building for real auth.",
    );
  }

  return {
    plugins: [react(), crx({ manifest: manifest as unknown as typeof baseManifest })],
    server: {
      port: 5173,
      strictPort: true,
      hmr: {
        port: 5173,
      },
    },
    build: {
      rollupOptions: {
        input: {
          recorder: "src/recorder/recorder.html",
        },
      },
    },
  };
});
