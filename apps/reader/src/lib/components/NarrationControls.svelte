<script lang="ts">
/**
 * NarrationControls — provisional, DELIBERATELY UNSTYLED narration controls for
 * the dev route. This is scaffolding: the real control surface is the
 * physical-book ribbon (play/pause/forward/volume/library), practitioner-
 * designed later. These are plain buttons whose only job is to make the engine
 * audible end-to-end in the testbed.
 *
 * Presentational only: it renders from `phase`/`rate` and emits intents. The
 * route owns the engine and maps the primary button to play/pause/resume by
 * phase, so this component carries no engine state of its own.
 */
import { RATE_MAX, RATE_MIN, type NarrationPhase } from '$lib/narration-engine.js';

const {
  phase,
  rate,
  onPlay,
  onPause,
  onResume,
  onStop,
  onSlower,
  onResetRate,
  onFaster,
}: {
  phase: NarrationPhase;
  rate: number;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSlower: () => void;
  onResetRate: () => void;
  onFaster: () => void;
} = $props();

// The primary button is context-aware: idle → start, playing → pause,
// paused → resume. While loading it is inert (the request is in flight).
function onPrimary(): void {
  if (phase === 'playing') onPause();
  else if (phase === 'paused') onResume();
  else if (phase === 'idle') onPlay();
  // loading: no-op (button is disabled)
}

const primaryLabel = $derived(
  phase === 'playing'
    ? 'Pause'
    : phase === 'paused'
      ? 'Resume'
      : phase === 'loading'
        ? 'Preparing…'
        : 'Play'
);
</script>

<div class="dev-narration-controls" data-phase={phase}>
  <button type="button" onclick={onPrimary} disabled={phase === 'loading'} data-role="primary">
    {primaryLabel}
  </button>
  <button type="button" onclick={onStop} disabled={phase === 'idle'} data-role="stop">
    Stop
  </button>
  <span class="rate-group">
    <button
      type="button"
      onclick={onSlower}
      disabled={rate <= RATE_MIN}
      data-role="slower">Slower</button
    >
    <button
      type="button"
      onclick={onResetRate}
      disabled={rate === 1.0}
      data-role="reset-rate">{rate.toFixed(2)}×</button
    >
    <button
      type="button"
      onclick={onFaster}
      disabled={rate >= RATE_MAX}
      data-role="faster">Faster</button
    >
  </span>
</div>

<style>
  /* No design here — the ribbon is practitioner territory. Just enough to keep
     the provisional buttons legible against the dev route's dim backdrop. */
  .dev-narration-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-family: monospace;
    font-size: 0.8rem;
    color: #e8ddb5;
  }
  .rate-group {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
  }
</style>
