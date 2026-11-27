import { useCallback, useEffect, useState } from 'react';
import type { TimerStatus } from '../../shared/contracts';
import type { Result } from '../../shared/errors';
import { ACTIVITY_LABELS, ACTIVITY_TYPES, type ActivityType } from '../../shared/goals';

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function TimerControls() {
  const [status, setStatus] = useState<TimerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<ActivityType>('kana');

  const refresh = useCallback(async () => {
    const result = await window.kotoba.study.getStatus();
    if (result.ok) {
      setStatus(result.data);
    } else {
      setError(result.error.message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handle = setInterval(() => void refresh(), 1_000);
    return () => clearInterval(handle);
  }, [refresh]);

  const act = async (run: () => Promise<Result<unknown>>) => {
    setError(null);
    const result = await run();
    if (!result.ok) {
      setError(result.error.message);
    }
    await refresh();
  };

  if (status === null) {
    return <span className="muted">Timer unavailable</span>;
  }

  return (
    <div className="timer-controls">
      {!status.active ? (
        <>
          <label className="field field--inline">
            <span>Activity</span>
            <select
              value={activityType}
              onChange={(event) => setActivityType(event.target.value as ActivityType)}
              aria-label="Study activity"
            >
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button--small"
            onClick={() => void act(() => window.kotoba.study.start({ activityType }))}
          >
            Start
          </button>
        </>
      ) : (
        <>
          <span className="timer-elapsed" aria-live="off">
            {formatElapsed(status.elapsedSeconds)}
          </span>
          {status.status === 'running' ? (
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => void act(() => window.kotoba.study.pause())}
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => void act(() => window.kotoba.study.resume())}
            >
              Resume
            </button>
          )}
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => void act(() => window.kotoba.study.stop())}
          >
            Stop
          </button>
        </>
      )}

      {error !== null && <span className="timer-error">{error}</span>}

      {status.interruptedSessions.length > 0 && (
        <span className="timer-recovery">
          Interrupted session — counted only up to its last checkpoint.{' '}
          {status.interruptedSessions.map((id) => (
            <button
              key={id}
              type="button"
              className="button button--ghost button--small"
              onClick={() =>
                void act(() => window.kotoba.study.acknowledgeInterrupted({ sessionId: id }))
              }
            >
              Dismiss
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
