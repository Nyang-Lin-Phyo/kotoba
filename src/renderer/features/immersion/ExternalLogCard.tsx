import { useCallback, useState } from 'react';
import type { ImmersionLogDTO } from '../../../shared/contracts';
import { ACTIVITY_LABELS, ACTIVITY_TYPES, type ActivityType } from '../../../shared/goals';
import { useAsync } from '../../lib/useAsync';

export function ExternalLogCard() {
  const logs = useAsync(
    useCallback(() => window.kotoba.immersion.list({ offset: 0, limit: 30 }), []),
  );
  const [minutes, setMinutes] = useState(30);
  const [activityType, setActivityType] = useState<ActivityType>('listening');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [deliberate, setDeliberate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<ImmersionLogDTO | null>(null);
  const [correctMinutes, setCorrectMinutes] = useState(0);
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = () => logs.reload();

  const add = async () => {
    setError(null);
    setAdding(true);
    const result = await window.kotoba.immersion.add({
      eventId: crypto.randomUUID(),
      durationSeconds: Math.max(60, minutes * 60),
      activityType,
      title,
      notes,
      deliberate,
    });
    setAdding(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setTitle('');
    setNotes('');
    reload();
  };

  const saveCorrection = async () => {
    if (correcting === null) return;
    setError(null);
    setSaving(true);
    const result = await window.kotoba.immersion.correct({
      eventId: crypto.randomUUID(),
      id: correcting.id,
      durationSeconds: Math.max(60, correctMinutes * 60),
      reason,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCorrecting(null);
    setReason('');
    reload();
  };

  return (
    <article className="card card--wide">
      <h2>External study log</h2>
      <p className="muted">
        Log study done outside the app. Deliberate minutes count toward today&rsquo;s goal; passive
        exposure is recorded but excluded.
      </p>

      <div className="field-row">
        <label className="field">
          <span>Minutes</span>
          <input type="number" min={1} max={1440} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
        </label>
        <label className="field">
          <span>Activity</span>
          <select value={activityType} onChange={(event) => setActivityType(event.target.value as ActivityType)}>
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>{ACTIVITY_LABELS[type]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Title</span>
          <input type="text" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What did you study?" />
        </label>
      </div>
      <label className="field">
        <span>Notes (optional)</span>
        <input type="text" maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={deliberate} onChange={(event) => setDeliberate(event.target.checked)} />
        <span>This was deliberate study (counts toward the goal)</span>
      </label>
      <div className="button-row">
        <button type="button" className="button" disabled={adding} onClick={() => void add()}>{adding ? 'Adding…' : 'Add log'}</button>
      </div>

      {error !== null && <p className="error">{error}</p>}

      {logs.state.status === 'error' && (
        <p className="error">{logs.state.error} <button type="button" className="button button--ghost button--small" onClick={reload}>Retry</button></p>
      )}

      {logs.state.status === 'ready' && logs.state.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th scope="col">When</th><th scope="col">Activity</th><th scope="col">Minutes</th><th scope="col">Kind</th><th scope="col">Action</th></tr>
            </thead>
            <tbody>
              {logs.state.data.map((log) => (
                <tr key={log.id}>
                  <th scope="row">{new Date(log.startedAt).toLocaleString()}</th>
                  <td>{log.title || ACTIVITY_LABELS[log.activityType]}</td>
                  <td>{Math.round(log.durationSeconds / 60)}</td>
                  <td>{log.deliberate ? 'Deliberate' : 'Passive'}</td>
                  <td>
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() => {
                        setCorrecting(log);
                        setCorrectMinutes(Math.round(log.durationSeconds / 60));
                      }}
                    >
                      Correct
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {correcting !== null && (
        <section className="word-step">
          <h3>Correct {correcting.title || ACTIVITY_LABELS[correcting.activityType]}</h3>
          <p className="muted">The original is preserved; your change is recorded with a reason.</p>
          <div className="field-row">
            <label className="field">
              <span>Minutes</span>
              <input type="number" min={1} value={correctMinutes} onChange={(event) => setCorrectMinutes(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Reason</span>
              <input type="text" maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          </div>
          <div className="button-row">
            <button type="button" className="button" disabled={saving || reason.trim().length < 2} onClick={() => void saveCorrection()}>
              Save correction
            </button>
            <button type="button" className="button button--ghost" onClick={() => setCorrecting(null)}>Cancel</button>
          </div>
        </section>
      )}
    </article>
  );
}
