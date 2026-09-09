import { Button } from "../components/Button";
import { StatusIndicator } from "../components/StatusIndicator";
import type { RecentUpload } from "../../shared/types";

export interface HomeScreenProps {
  connectedEmail?: string;
  recentUploads?: RecentUpload[];
  onScreenshot: () => void;
  onRecord: () => void;
  onDisconnect?: () => void;
  isSigningOut?: boolean;
  onOpenSettings?: () => void;
  onOpenRecent?: (item: RecentUpload) => void;
}

export function HomeScreen({
  connectedEmail,
  recentUploads = [],
  onScreenshot,
  onRecord,
  onDisconnect,
  isSigningOut = false,
  onOpenSettings,
  onOpenRecent,
}: HomeScreenProps) {
  return (
    <div className="popup__body">
      {/* Connection status — text + dot, not color-only (§20) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <StatusIndicator variant={connectedEmail ? "connected" : "default"} label={connectedEmail ? `Connected · ${connectedEmail}` : "Not connected"} />
        {connectedEmail && onDisconnect ? (
          <Button variant="ghost" size="sm" onClick={onDisconnect} loading={isSigningOut} disabled={isSigningOut} aria-label="Disconnect Google Drive">
            Disconnect
          </Button>
        ) : null}
      </div>

      <div>
        <h2 className="heading-sm" style={{ marginBottom: 8 }}>
          Capture
        </h2>
        <div className="capture-grid" role="group" aria-label="Capture actions">
          <button type="button" className="capture-tile" onClick={onScreenshot} aria-label="Take screenshot">
            <span className="capture-tile__icon" aria-hidden="true">
              📸
            </span>
            <span className="capture-tile__label">Screenshot</span>
            <span className="capture-tile__hint">Current tab</span>
          </button>
          <button type="button" className="capture-tile" onClick={onRecord} aria-label="Record screen">
            <span className="capture-tile__icon" aria-hidden="true">
              ●
            </span>
            <span className="capture-tile__label">Record Screen</span>
            <span className="capture-tile__hint">Tab / window</span>
          </button>
        </div>
      </div>

      <hr className="divider" />

      <section aria-labelledby="recent-heading">
        <div className="section-header">
          <h2 id="recent-heading" className="section-title">
            Recent
          </h2>
        </div>

        {recentUploads.length === 0 ? (
          <p className="recent-empty">No captures yet. Take a screenshot or record your screen to see it here.</p>
        ) : (
          <ul className="recent-list" role="list" aria-label="Recent uploads">
            {recentUploads.map((item) => (
              <li key={item.id} className="recent-item">
                <span className="recent-item__icon" aria-hidden="true">
                  {item.mimeType.startsWith("video") ? "🎬" : "🖼️"}
                </span>
                <div className="recent-item__meta">
                  <div className="recent-item__name" title={item.name}>
                    {item.name}
                  </div>
                  <div className="recent-item__sub">{new Date(item.createdAt).toLocaleString()}</div>
                </div>
                {item.webViewLink ? (
                  <a
                    href={item.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="recent-item__link"
                    aria-label={`Open ${item.name} in Google Drive`}
                    onClick={(e) => {
                      // allow parent handler to intercept in extension context
                      if (onOpenRecent) {
                        e.preventDefault();
                        onOpenRecent(item);
                      }
                    }}
                  >
                    Open ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="divider" />

      <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label="Open settings">
        <span aria-hidden="true">⚙️</span> Settings
      </Button>
    </div>
  );
}
