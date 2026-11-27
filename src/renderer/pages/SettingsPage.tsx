import { useEffect, useState } from 'react';
import type { AppInfo } from '../../shared/contracts';

export function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.kotoba
      .appInfo()
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Milestone M1</p>
          <h1>Settings</h1>
          <p className="muted">
            This page reads real values from the main process over the typed preload bridge.
            Learning settings arrive with profiles at M3.
          </p>
        </div>
      </header>

      <article className="card card--wide">
        <h2>Application</h2>
        {error !== null && <p className="error">Could not read app info: {error}</p>}
        {info === null && error === null && <p className="muted">Loading…</p>}
        {info !== null && (
          <dl className="details">
            <div>
              <dt>Name</dt>
              <dd>{info.name}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{info.version}</dd>
            </div>
            <div>
              <dt>Electron</dt>
              <dd>{info.electron}</dd>
            </div>
            <div>
              <dt>Chromium</dt>
              <dd>{info.chrome}</dd>
            </div>
            <div>
              <dt>Node</dt>
              <dd>{info.node}</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>{info.platform}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{info.isDev ? 'development' : 'packaged'}</dd>
            </div>
          </dl>
        )}
      </article>

      <article className="card card--wide">
        <h2>Not built yet</h2>
        <ul className="checklist checklist--muted">
          <li>Theme, text size and audio preferences (M3).</li>
          <li>Backup, export and restore (M3).</li>
          <li>Study plan and goal editing (M6).</li>
        </ul>
      </article>
    </section>
  );
}
