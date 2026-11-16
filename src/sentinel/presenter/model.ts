import type { PersonId } from '../data/team.ts';
import { isPersonId } from '../data/team.ts';
import { isWhatIf } from '../engine/whatif.ts';
import type { WhatIfId } from '../engine/whatif.ts';

export type ShowId = 'executive' | 'cyber' | 'ransomware' | 'fraud' | 'cloud' | 'plans' | 'approval' | 'mac' | 'full';
export type Duration = 2 | 5 | 8 | 12 | 20 | 30;
export const DURATIONS: Duration[] = [2, 5, 8, 12, 20, 30];
export type PresenterStatus = 'idle' | 'running' | 'paused' | 'qa' | 'done';

export type PresenterState = {
  v: 1;
  showId: ShowId; duration: Duration; status: PresenterStatus;
  scene: number; beat: number;
  startedAt: number | null; sceneStartedAt: number | null; pausedAt: number | null;
  pausedTotal: number; scenePausedTotal: number;
  /** returnTo.done: the questions were opened from the end card, so closing them returns there. */
  qa: { questionId: string | null; returnTo: { scene: number; beat: number; done?: boolean } | null };
  relay: PersonId[];
  narration: 'auto' | 'manual' | 'off';
  audienceCaptions: boolean;
  /** Opt-in. When on, Next records any gate the presenter skipped (labelled as fast-forward). Off by default:
   *  manual action gates never complete just because a scene was skipped. */
  keepInStep: boolean;
  /** Last automatic catch-up, shown privately in the console. */
  notice: string | null;
  /** A professor's what-if shown on the projector during questions (computed on a private copy, never recorded). */
  whatIf: WhatIfId | null;
  /** "Do it for me" in progress: the gate's form fills itself on the projector before it is signed (transient). */
  fill: { gate: string; at: number } | null;
};

export const DEFAULT_RELAY: PersonId[] = ['karan', 'victor', 'nadia', 'sarah', 'vanessa', 'pierre', 'karan'];

export function blankPresenter(): PresenterState {
  return {
    v: 1, showId: 'full', duration: 8, status: 'idle', scene: 0, beat: 0,
    startedAt: null, sceneStartedAt: null, pausedAt: null, pausedTotal: 0, scenePausedTotal: 0,
    qa: { questionId: null, returnTo: null }, relay: [...DEFAULT_RELAY], narration: 'auto', audienceCaptions: true,
    keepInStep: false, notice: null, whatIf: null, fill: null,
  };
}

const SHOWS: ShowId[] = ['executive', 'cyber', 'ransomware', 'fraud', 'cloud', 'plans', 'approval', 'mac', 'full'];
export function sanitizePresenter(raw: unknown): PresenterState {
  const b = blankPresenter();
  if (!raw || typeof raw !== 'object') return b;
  const r = raw as Partial<PresenterState>;
  const relay = Array.isArray(r.relay) && r.relay.length === 7 && r.relay.every(isPersonId) ? r.relay as PersonId[] : b.relay;
  return {
    ...b,
    showId: SHOWS.includes(r.showId as ShowId) ? r.showId as ShowId : b.showId,
    duration: DURATIONS.includes(r.duration as Duration) ? r.duration as Duration : b.duration,
    relay,
    narration: r.narration === 'manual' || r.narration === 'off' ? r.narration : 'auto',
    audienceCaptions: r.audienceCaptions !== false,
    keepInStep: r.keepInStep === true,
    whatIf: isWhatIf(r.whatIf) ? r.whatIf : null,
    // A reload never resumes a half-finished presentation silently: it comes back paused at the same scene.
    status: r.status === 'running' || r.status === 'qa' ? 'paused' : r.status === 'paused' || r.status === 'done' ? r.status : 'idle',
    scene: Number.isInteger(r.scene) ? Math.max(0, r.scene as number) : 0,
    beat: Number.isInteger(r.beat) ? Math.max(0, r.beat as number) : 0,
    startedAt: typeof r.startedAt === 'number' ? r.startedAt : null,
    sceneStartedAt: typeof r.sceneStartedAt === 'number' ? r.sceneStartedAt : null,
    pausedAt: typeof r.pausedAt === 'number' ? r.pausedAt : (r.status === 'running' ? Date.now() : null),
    pausedTotal: typeof r.pausedTotal === 'number' ? r.pausedTotal : 0,
    scenePausedTotal: typeof r.scenePausedTotal === 'number' ? r.scenePausedTotal : 0,
  };
}
