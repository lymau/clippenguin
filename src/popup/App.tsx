export default function App() {
  return (
    <div className="popup">
      <header className="popup__header">
        <div className="popup__logo" aria-hidden="true">
          🐧
        </div>
        <div>
          <h1 className="popup__title">Clippenguin</h1>
          <p className="popup__subtitle">Screen capture to Drive — foundation ready</p>
        </div>
      </header>

      <main className="popup__body">
        <div className="card">
          <h2 className="card__title">Extension loaded</h2>
          <p className="card__text">
            Manifest V3 foundation is installed. Popup and service worker are running.
          </p>
          <ul className="checklist">
            <li>Popup renders without errors</li>
            <li>Service worker starts (check chrome://extensions)</li>
            <li>No console errors on clean install</li>
          </ul>
        </div>

        <button
          className="btn btn--primary"
          type="button"
          onClick={() => chrome.runtime.sendMessage({ type: "PING", at: Date.now() })}
        >
          Ping service worker
        </button>

        <p className="hint">
          Placeholder actions only — OAuth, capture, and Drive upload land in later issues.
        </p>
      </main>

      <footer className="popup__footer">
        <span className="badge">MV3 · v0.1.0</span>
      </footer>
    </div>
  );
}
