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
  /* Provisional card — the real home for these controls is the ribbon
     (practitioner design ho). Until then: a visible parchment card in the
     family language, nothing more. */
  .dev-narration-controls {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.95rem;
    color: #4a3728;
    background: rgba(254, 252, 247, 0.94);
    border: 1px solid #dfc9a4;
    border-radius: 0.6rem;
    padding: 0.45rem 0.9rem;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
  }
  .dev-narration-controls button {
    font: inherit;
    color: #8b6914;
    background: transparent;
    border: 1px solid #dfc9a4;
    border-radius: 0.35rem;
    padding: 0.15rem 0.65rem;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .dev-narration-controls button:hover:not(:disabled) {
    opacity: 0.7;
  }
  .dev-narration-controls button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .rate-group {
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
  }
</style>
