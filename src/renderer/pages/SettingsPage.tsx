import { useCallback, useState } from 'react';
import { THEME_CHOICES, type ThemeChoice } from '../../shared/enums';
import { useAsync } from '../lib/useAsync';
import { useTheme } from '../theme';

const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsPage() {
  const { choice, setChoice } = useTheme();
  const appInfo = useAsync(useCallback(() => window.kotoba.appInfo(), []));
  const dataRoot = useAsync(useCallback(() => window.kotoba.dataRoot(), []));
  const backups = useAsync(useCallback(() => window.kotoba.backup.list(), []));

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const createBackup = async () => {
    setBusy('create');
    setNotice(null);
    const result = await window.kotoba.backup.create();
    setBusy(null);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice(`Created ${result.data.fileName}`);
    backups.reload();
  };

  const restoreBackup = async (fileName: string) => {
    const confirmed = window.confirm(
      `Restore ${fileName}?\n\nYour current database is snapshotted first, then Kotoba reloads.`,
    );
    if (!confirmed) return;

    setBusy(fileName);
    setNotice(null);
    const result = await window.kotoba.backup.restore({ fileName });
    setBusy(null);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    window.location.reload();
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Application</p>
          <h1>Settings</h1>
          <p className="muted">
            Local preferences and data tools. Everything is read from and written to the main
            process over the typed bridge.
          </p>
        </div>
      </header>

      <article className="card card--wide">
        <h2>Appearance</h2>
        <div className="chip-row" role="group" aria-label="Theme">
          {THEME_CHOICES.map((value) => (
            <button
              key={value}
              type="button"
              className={choice === value ? 'chip chip--on' : 'chip'}
              aria-pressed={choice === value}
              onClick={() => void setChoice(value)}
            >
              {THEME_LABELS[value]}
            </button>
          ))}
        </div>
        <p className="muted">
          Stored in the profile database, not in browser storage. Learning data never uses
          localStorage.
        </p>
      </article>

      <article className="card card--wide">
        <h2>Where your data lives</h2>
        {dataRoot.state.status === 'error' && <p className="error">{dataRoot.state.error}</p>}
        {dataRoot.state.status === 'ready' && (
          <dl className="details">
            <div>
              <dt>Data root</dt>
              <dd className="mono">{dataRoot.state.data.root}</dd>
            </div>
            <div>
              <dt>Profile database</dt>
              <dd className="mono">{dataRoot.state.data.databaseFile}</dd>
            </div>
            <div>
              <dt>Backups</dt>
              <dd className="mono">{dataRoot.state.data.backupsDir}</dd>
            </div>
            <div>
              <dt>Chosen by</dt>
              <dd>
                {dataRoot.state.data.source === 'env'
                  ? 'KOTOBA_DATA_ROOT'
                  : dataRoot.state.data.source === 'dev'
                    ? 'development default (-dev)'
                    : 'Electron userData'}
              </dd>
            </div>
          </dl>
        )}
        <p className="muted">
          Uninstalling the app does not delete this folder, and running the development build uses
          a separate <span className="mono">-dev</span> folder so it can never touch your real
          profile.
        </p>
      </article>

      <article className="card card--wide">
        <h2>Backups</h2>
        <div className="button-row">
          <button
            type="button"
            className="button"
            onClick={() => void createBackup()}
            disabled={busy !== null}
          >
            {busy === 'create' ? 'Creating…' : 'Create backup now'}
          </button>
          <button type="button" className="button button--ghost" onClick={backups.reload}>
            Refresh list
          </button>
        </div>

        {notice !== null && <p className="muted">{notice}</p>}
        {backups.state.status === 'error' && <p className="error">{backups.state.error}</p>}

        {backups.state.status === 'ready' && backups.state.data.length === 0 && (
          <p className="muted">No backups yet. One is taken automatically each study day.</p>
        )}

        {backups.state.status === 'ready' && backups.state.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Created</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Size</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {backups.state.data.map((backup) => (
                  <tr key={backup.fileName}>
                    <th scope="row" className="mono">
                      {backup.fileName}
                    </th>
                    <td>{new Date(backup.createdAt).toLocaleString()}</td>
                    <td>{backup.reason}</td>
                    <td>{formatSize(backup.sizeBytes)}</td>
                    <td>
                      <button
                        type="button"
                        className="button button--small"
                        onClick={() => void restoreBackup(backup.fileName)}
                        disabled={busy !== null}
                      >
                        {busy === backup.fileName ? 'Restoring…' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="muted">
          Backups are consistent snapshots taken with SQLite&rsquo;s <span className="mono">VACUUM INTO</span>,
          not file copies. The newest 14 daily snapshots and a few safety snapshots are kept; a
          restore always snapshots the current database first.
        </p>
      </article>

      <article className="card card--wide">
        <h2>Application</h2>
        {appInfo.state.status === 'error' && <p className="error">{appInfo.state.error}</p>}
        {appInfo.state.status === 'ready' && (
          <dl className="details">
            <div>
              <dt>Name</dt>
              <dd>{appInfo.state.data.name}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{appInfo.state.data.version}</dd>
            </div>
            <div>
              <dt>Electron</dt>
              <dd>{appInfo.state.data.electron}</dd>
            </div>
            <div>
              <dt>Chromium</dt>
              <dd>{appInfo.state.data.chrome}</dd>
            </div>
            <div>
              <dt>Node</dt>
              <dd>{appInfo.state.data.node}</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>{appInfo.state.data.platform}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{appInfo.state.data.isDev ? 'development' : 'packaged'}</dd>
            </div>
          </dl>
        )}
      </article>
    </section>
  );
}
