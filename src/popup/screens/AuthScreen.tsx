import { Button } from "../components/Button";
import { Card } from "../components/Card";

export interface AuthScreenProps {
  onConnect: () => void;
  loading?: boolean;
  errorMessage?: string;
}

export function AuthScreen({ onConnect, loading = false, errorMessage }: AuthScreenProps) {
  return (
    <div className="popup__body">
      <Card title="Save captures directly to Drive" description="Your files stay in your own Google Drive. The extension only accesses files it creates.">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <Button variant="primary" fullWidth size="lg" onClick={onConnect} loading={loading} disabled={loading} aria-label="Connect Google Drive">
            Connect Google Drive
          </Button>

          {errorMessage ? (
            <p role="alert" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--danger)", lineHeight: "var(--leading-normal)" }}>
              {errorMessage}
            </p>
          ) : null}

          <div className="hint--disclosure" role="note" aria-label="Permission disclosure">
            <strong style={{ color: "var(--text)" }}>Access requested:</strong> Drive files created or used by this extension only (
            <code style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>drive.file</code> scope). No access to your other Drive files.
          </div>
        </div>
      </Card>

      <p className="hint">
        You can disconnect anytime from extension settings or your Google Account permissions.
      </p>
    </div>
  );
}
