/**
 * Main-process study timer.
 *
 * The renderer can only ask for state changes; every elapsed second is
 * computed here from a monotonic clock and checkpointed into session segments.
 * A crash or suspend can never turn into study time because a running session
 * is interrupted at startup and only its last checkpoint is kept.
 */

import { randomUUID } from 'node:crypto';
import type { Db } from '../database/connection';
import type { ActivityType } from '../../shared/goals';
import type { TimerStatus } from '../../shared/contracts';
import { todayInZone } from '../../shared/date';
import { AppError } from '../../shared/errors';
import { capCheckpointGap, elapsedForCheckpoint, splitSegmentAtMidnight } from '../../shared/timer';
import {
  getRunningSession,
  getSession,
  insertSegment,
  insertSession,
  listAllUnfinishedSessions,
  listInterruptedSessions,
  markInterrupted,
  updateSession,
} from '../database/repositories/study';
import { getActiveProfile } from '../database/repositories/profiles';

const CHECKPOINT_MS = 10_000;
const GAP_CAP_MS = 60_000;

export type TimerClock = {
  readonly now: () => number;
  readonly monotonic: () => number;
  readonly schedule: (fn: () => void, ms: number) => { cancel(): void } | null;
};

type ActiveTimer = {
  readonly sessionId: string;
  readonly profileId: string;
  readonly activityType: ActivityType;
  readonly timezone: string;
  /** Only capped checkpoint deltas are ever added here. */
  countedMs: number;
  lastCheckpointMonotonic: number;
  lastCheckpointWall: number;
};

function defaultClock(): TimerClock {
  return {
    now: () => Date.now(),
    monotonic: () => performance.now(),
    schedule: (fn, ms) => {
      const handle = setInterval(fn, ms);
      handle.unref();
      return { cancel: () => clearInterval(handle) };
    },
  };
}

export class TimerService {
  #db: () => Db;
  #clock: TimerClock;
  #handle: { cancel(): void } | null = null;
  #active: ActiveTimer | null = null;

  constructor(db: () => Db, clock: Partial<TimerClock> = {}) {
    this.#db = db;
    this.#clock = { ...defaultClock(), ...clock };
  }

  dispose(): void {
    this.#handle?.cancel();
    this.#handle = null;
  }

  #requireProfile(): { readonly id: string; readonly timezone: string } {
    const profile = getActiveProfile(this.#db());
    if (profile === null) {
      throw AppError.notFound('No profile exists yet. Finish setup first.');
    }
    return { id: profile.id, timezone: profile.timezone };
  }

  start(activityType: ActivityType): TimerStatus {
    const profile = this.#requireProfile();
    if (this.#active !== null || getRunningSession(this.#db(), profile.id) !== null) {
      throw AppError.conflict('A study session is already active for this profile.');
    }

    const nowMs = this.#clock.now();
    const monotonic = this.#clock.monotonic();
    const sessionId = randomUUID();
    const nowIso = new Date(nowMs).toISOString();

    insertSession(this.#db(), {
      id: sessionId,
      profileId: profile.id,
      activityType,
      startedAt: nowIso,
      status: 'running',
      source: 'timer',
      lastCheckpointAt: nowIso,
    });

    this.#active = {
      sessionId,
      profileId: profile.id,
      activityType,
      timezone: profile.timezone,
      countedMs: 0,
      lastCheckpointMonotonic: monotonic,
      lastCheckpointWall: nowMs,
    };

    this.#handle = this.#clock.schedule(() => this.checkpoint(), CHECKPOINT_MS);
    return this.status();
  }

  #writeSegments(active: ActiveTimer, fromWallMs: number, toWallMs: number): void {
    for (const part of splitSegmentAtMidnight(fromWallMs, toWallMs, active.timezone)) {
      const seconds = Math.floor(part.ms / 1000);
      if (seconds <= 0) continue;
      insertSegment(this.#db(), {
        id: randomUUID(),
        sessionId: active.sessionId,
        dayKey: part.dayKey,
        startedAt: new Date(fromWallMs).toISOString(),
        endedAt: new Date(toWallMs).toISOString(),
        activeSeconds: seconds,
      });
    }
  }

  #elapsedMs(active: ActiveTimer): number {
    const running = getSession(this.#db(), active.sessionId)?.status === 'running';
    const pending = running
      ? capCheckpointGap(this.#clock.monotonic() - active.lastCheckpointMonotonic, GAP_CAP_MS)
      : 0;
    return active.countedMs + pending;
  }

  checkpoint(): void {
    const active = this.#active;
    if (active === null) return;

    const monotonic = this.#clock.monotonic();
    const wall = this.#clock.now();
    const delta = elapsedForCheckpoint(
      monotonic,
      active.lastCheckpointMonotonic,
      wall,
      active.lastCheckpointWall,
      GAP_CAP_MS,
    );

    this.#writeSegments(active, active.lastCheckpointWall, active.lastCheckpointWall + delta);
    active.countedMs += delta;
    active.lastCheckpointMonotonic = monotonic;
    active.lastCheckpointWall += delta;

    updateSession(this.#db(), active.sessionId, {
      activeSeconds: Math.floor(active.countedMs / 1000),
      lastCheckpointAt: new Date(active.lastCheckpointWall).toISOString(),
    });
  }

  pause(): TimerStatus {
    const active = this.#active;
    if (active === null) {
      throw AppError.conflict('There is no active study session.');
    }
    const session = getSession(this.#db(), active.sessionId);
    if (session?.status !== 'running') return this.status();

    this.checkpoint();
    updateSession(this.#db(), active.sessionId, { status: 'paused' });
    this.#handle?.cancel();
    this.#handle = null;
    return this.status();
  }

  resume(): TimerStatus {
    const active = this.#active;
    if (active === null) {
      throw AppError.conflict('There is no active study session.');
    }
    const session = getSession(this.#db(), active.sessionId);
    if (session?.status !== 'paused') return this.status();

    const monotonic = this.#clock.monotonic();
    active.lastCheckpointMonotonic = monotonic;
    active.lastCheckpointWall = this.#clock.now();
    updateSession(this.#db(), active.sessionId, { status: 'running' });
    this.#handle = this.#clock.schedule(() => this.checkpoint(), CHECKPOINT_MS);
    return this.status();
  }

  stop(): TimerStatus {
    const active = this.#active;
    if (active === null) {
      throw AppError.conflict('There is no active study session.');
    }
    this.pause();
    updateSession(this.#db(), active.sessionId, {
      status: 'stopped',
      endedAt: new Date(this.#clock.now()).toISOString(),
    });
    this.#active = null;
    this.#handle?.cancel();
    this.#handle = null;
    return this.status();
  }

  status(): TimerStatus {
    const active = this.#active;

    if (active === null) {
      // Before onboarding there is no profile to query. Status must still be
      // safe to call: the app checks it on quit even during first launch.
      const profile = getActiveProfile(this.#db());
      const interrupted =
        profile === null ? [] : listInterruptedSessions(this.#db(), profile.id).map((session) => session.id);
      return {
        active: false,
        sessionId: null,
        activityType: null,
        status: null,
        elapsedSeconds: 0,
        dayKey: null,
        interruptedSessions: interrupted,
      };
    }

    const interrupted = listInterruptedSessions(this.#db(), active.profileId).map(
      (session) => session.id,
    );

    const session = getSession(this.#db(), active.sessionId);
    return {
      active: true,
      sessionId: active.sessionId,
      activityType: active.activityType,
      status: session?.status ?? 'running',
      elapsedSeconds: Math.floor(this.#elapsedMs(active) / 1000),
      dayKey: todayInZone(active.timezone, this.#clock.now()),
      interruptedSessions: interrupted,
    };
  }

  /**
   * Called once at startup, before any IPC can start a new session.
   * A paused row is just as orphaned as a running one after a crash: no
   * in-memory timer owns it, so it must be interrupted too or the profile
   * would be locked out of starting another session forever.
   */
  recover(): void {
    for (const session of listAllUnfinishedSessions(this.#db())) {
      markInterrupted(this.#db(), session.id);
    }
  }

  acknowledgeInterrupted(sessionId: string): TimerStatus {
    const session = getSession(this.#db(), sessionId);
    if (session === null || session.status !== 'interrupted') {
      throw AppError.notFound('That interrupted session no longer exists.');
    }
    updateSession(this.#db(), sessionId, {
      status: 'stopped',
      endedAt: session.lastCheckpointAt,
    });
    return this.status();
  }
}
