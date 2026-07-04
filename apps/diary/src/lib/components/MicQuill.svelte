<script module lang="ts">
import { get, writable } from 'svelte/store';

type State = 'idle' | 'recording' | 'processing' | 'error';

const micState = writable<{ phase: State; errorMessage: string; elapsed: number }>({
  phase: 'idle',
  errorMessage: '',
  elapsed: 0,
});

let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let recordingStart = 0;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let cancelled = false;
let starting = false;
let activeInsert: ((text: string) => void) | null = null;
// Identity token of the instance that started the active recording. The
// shared store deliberately mirrors one recording across every mounted quill;
// ownership only decides which instance's unmount must tear the recording down.
let owner: object | null = null;

const MAX_SECONDS = 90;
const HOLD_CANCEL_MS = 800;
const ERROR_DISPLAY_MS = 2500;

function clearElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

let errorResetTimer: ReturnType<typeof setTimeout> | null = null;

function showError(message: string) {
  micState.set({ phase: 'error', errorMessage: message, elapsed: get(micState).elapsed });
  // Restart the reset clock on every error — a second error within the
  // display window must not be dismissed early by the first error's timer.
  if (errorResetTimer) clearTimeout(errorResetTimer);
  errorResetTimer = setTimeout(() => {
    errorResetTimer = null;
    if (get(micState).phase === 'error') {
      micState.set({ phase: 'idle', errorMessage: '', elapsed: 0 });
    }
  }, ERROR_DISPLAY_MS);
}

/** Instance-unmount hook: if `token` owns the active recording, cancel it so
 * the mic doesn't stay hot and the transcription can't be inserted into a
 * destroyed component. Non-owners leave the shared state alone. */
function releaseOwnership(token: object) {
  if (owner !== token) return;
  owner = null;
  // The owner's textarea is gone — a late transcription has nowhere to land.
  activeInsert = null;
  const phase = get(micState).phase;
  if (phase === 'recording') {
    cancelled = true;
    // Stops the recorder and its tracks, clears the elapsed timer, and
    // resets the shared state to idle (cancelled path).
    void stopAndProcess();
  } else if (phase === 'processing') {
    cancelled = true;
  }
}

async function start(insert: (text: string) => void, token: object, onstart?: () => void) {
  if (starting || get(micState).phase !== 'idle') return;
  starting = true;
  owner = token;
  activeInsert = insert;
  cancelled = false;
  chunks = [];
  // Capture the insertion anchor NOW — synchronously, before the async mic
  // acquisition. The host reads the focused textarea's selectionStart; awaiting
  // getUserMedia first opens a gap in which a blur, a reflow, or a permission
  // prompt can move or reset that selection, landing the transcription on the
  // wrong page. Recording may still fail below; a stale anchor is then harmless
  // (no insert happens, and the next recording recaptures it).
  onstart?.();
  /* v8 ignore next 22 */
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    });
    // Trigger periodic dataavailable so Safari has chunks flushed even
    // if the 'stop' event is delayed or never fires.
    mediaRecorder.start(500);
    recordingStart = Date.now();
    micState.set({ phase: 'recording', errorMessage: '', elapsed: 0 });
    elapsedTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStart) / 1000);
      micState.update((state) => ({ ...state, elapsed }));
      if (elapsed >= MAX_SECONDS) void stopAndProcess();
    }, 250);
  } catch (e) {
    // Release the mic if acquisition succeeded but recorder setup threw —
    // otherwise the OS recording indicator stays hot until page unload.
    if (stream) for (const t of stream.getTracks()) t.stop();
    console.warn('Microphone access failed:', e instanceof Error ? e.message : e);
    showError('Microphone access is off. Turn it on in browser settings.');
  } finally {
    starting = false;
  }
}

/* v8 ignore next 60 */
async function stopAndProcess() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
  clearElapsedTimer();

  // Show the spinner immediately so the user sees feedback regardless of
  // when (or whether) the 'stop' event fires. Safari's MediaRecorder has
  // been observed to delay or skip the 'stop' event entirely.
  micState.update((state) => ({ ...state, phase: 'processing' }));

  // Promise that resolves when the recorder fires 'stop'. Fallback after
  // 800ms — Safari quirk.
  const recorder = mediaRecorder;
  const stopped = new Promise<void>((resolve) => {
    const handler = () => resolve();
    recorder.addEventListener('stop', handler, { once: true });
    setTimeout(() => {
      recorder.removeEventListener('stop', handler);
      resolve();
    }, 800);
  });

  try {
    recorder.stop();
  } catch (e) {
    console.warn('mediaRecorder.stop() threw:', e instanceof Error ? e.message : e);
  }
  await stopped;

  // Release the mic now that we have the data.
  const tracks = recorder.stream.getTracks();
  for (const t of tracks) t.stop();

  if (cancelled) {
    micState.set({ phase: 'idle', errorMessage: '', elapsed: 0 });
    chunks = [];
    return;
  }

  if (chunks.length === 0) {
    showError("Didn't catch any audio. Try again.");
    return;
  }

  const type = chunks[0]?.type || 'audio/webm';
  const blob = new Blob(chunks, { type });
  chunks = [];

  const formData = new FormData();
  // Pick an extension that matches what Safari produces (mp4) vs Chrome (webm).
  const ext = type.includes('mp4') ? 'm4a' : 'webm';
  formData.append('audio', blob, `recording.${ext}`);

  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      showError(
        response.status === 503
          ? "Couldn't reach the diary. Try again in a moment."
          : 'The voice helper is having trouble. Try again or type instead.'
      );
      return;
    }
    const data = await response.json();
    if (typeof data?.text === 'string' && data.text.length > 0) {
      activeInsert?.(data.text);
      micState.set({ phase: 'idle', errorMessage: '', elapsed: 0 });
    } else {
      showError("Didn't catch any words. Try speaking again.");
    }
  } catch (e) {
    console.warn('Transcription request failed:', e instanceof Error ? e.message : e);
    showError("Couldn't reach the diary. Try again in a moment.");
  }
}
</script>

<script lang="ts">
import { onDestroy } from 'svelte';

type Props = {
  oninsert: (text: string) => void;
  /** Called the moment recording begins — the host captures the insertion anchor here. */
  onstart?: () => void;
  /** Optional aria-label override. */
  ariaLabel?: string;
};

const { oninsert, onstart, ariaLabel }: Props = $props();

// This instance's identity for recording ownership (see module script).
const ownerToken = {};
onDestroy(() => releaseOwnership(ownerToken));

let holdTimer: ReturnType<typeof setTimeout> | null = null;
// Swallows the synthetic click that follows a hold-to-cancel release. An
// expiry timestamp, not a latch: if the release lands off-button no click
// ever arrives, and a latch would swallow the NEXT genuine tap instead.
const CLICK_SUPPRESS_MS = 350;
let suppressClickUntil = 0;

function onPointerDown() {
  if (get(micState).phase !== 'recording') return;
  holdTimer = setTimeout(() => {
    cancelled = true;
    // The finger release after a hold-cancel still fires a synthetic click;
    // if it lands after phase returns to 'idle', onClick would immediately
    // start a NEW recording the user just cancelled. Swallow that click.
    suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
    void stopAndProcess();
    holdTimer = null;
  }, HOLD_CANCEL_MS);
}

function onPointerUp() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function onClick() {
  if (Date.now() < suppressClickUntil) {
    suppressClickUntil = 0;
    return;
  }
  const phase = get(micState).phase;
  if (phase === 'idle') void start(oninsert, ownerToken, onstart);
  else if (phase === 'recording') void stopAndProcess();
}

const remaining = $derived(Math.max(0, MAX_SECONDS - $micState.elapsed));
const showCountdown = $derived(($micState.phase as State) === 'recording' && remaining <= 10);
</script>

<button
  type="button"
  class="mic-quill"
  class:is-recording={$micState.phase === 'recording'}
  class:is-processing={$micState.phase === 'processing'}
  class:is-error={$micState.phase === 'error'}
  onclick={onClick}
  onpointerdown={onPointerDown}
  onpointerup={onPointerUp}
  onpointerleave={onPointerUp}
  onpointercancel={onPointerUp}
  aria-label={$micState.phase === 'idle'
    ? (ariaLabel ?? 'Start voice writing')
    : $micState.phase === 'recording'
      ? 'Stop voice writing (hold to cancel)'
      : $micState.phase === 'processing'
        ? 'Processing voice'
        : ($micState.errorMessage || 'Voice error')}
  disabled={$micState.phase === 'processing'}
>
  <svg viewBox="0 0 24 24" aria-hidden="true" class="quill-svg">
    <path
      class="quill-feather"
      d="M 18.5 3.5 Q 13.5 5.5 11 9.5 Q 9 13.5 7.5 17.5 Q 11.5 16 15 12.5 Q 18 9 18.5 3.5 Z"
    />
    <path
      class="quill-shaft"
      d="M 18 4 L 7 19"
      stroke-width="1.2"
      stroke-linecap="round"
      fill="none"
    />
    <path
      class="quill-nib"
      d="M 7 19 L 5 20.5 L 6 21.5 L 8 20 Z"
    />
    <circle class="quill-inkdrop" cx="5.5" cy="22" r="0.7" />
  </svg>
  {#if showCountdown}
    <span class="elapsed">{remaining}s</span>
  {/if}
  {#if $micState.phase === 'error'}
    <span class="mic-error" role="status" aria-live="polite">{$micState.errorMessage}</span>
  {/if}
</button>

<style>
  .mic-quill {
    /* Fill the wrapper slot exactly — the wrapper sets the size (3.6cqi
       in the ribbon, 1.5rem on mobile). */
    position: relative;
    width: 100%;
    height: 100%;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    color: #8b6914;
    opacity: 0.7;
    flex-shrink: 0;
    transition: opacity 0.2s ease, color 0.2s ease;
  }

  .mic-quill:hover {
    opacity: 1;
  }

  .quill-svg {
    /* Constrain to the button's own size so the SVG doesn't fall back to
       its 300×150 default. */
    width: 100%;
    height: 100%;
    display: block;
    transform-origin: center;
  }

  .quill-feather {
    fill: currentColor;
    opacity: 0.6;
  }
  .quill-shaft {
    stroke: currentColor;
  }
  .quill-nib {
    fill: currentColor;
  }
  .quill-inkdrop {
    fill: currentColor;
    opacity: 0;
    transition: opacity 0.25s ease;
  }

  /* Recording: red, opaque, ink drop visible, feather breathes. */
  .mic-quill.is-recording {
    color: #c0392b;
    opacity: 1;
  }
  .mic-quill.is-recording .quill-inkdrop {
    opacity: 1;
    animation: ink-drip 1.4s ease-in-out infinite;
  }
  .mic-quill.is-recording .quill-feather {
    animation: feather-breathe 1.8s ease-in-out infinite;
  }

  /* Processing: spin while we wait for whisper. */
  .mic-quill.is-processing {
    color: #8b6914;
    opacity: 0.75;
    cursor: default;
  }
  .mic-quill.is-processing .quill-svg {
    animation: quill-spin 1.1s linear infinite;
  }

  .mic-quill.is-error {
    color: #b85050;
    opacity: 1;
  }

  @keyframes ink-drip {
    0%, 100% { transform: translateY(0); opacity: 1; }
    50%      { transform: translateY(0.6px); opacity: 0.55; }
  }
  @keyframes feather-breathe {
    50% { opacity: 0.85; }
  }
  @keyframes quill-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .quill-inkdrop,
    .quill-feather,
    .quill-svg,
    .mic-quill {
      animation: none !important;
    }
  }

  .elapsed {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 1.4cqi;
    color: #c0392b;
    white-space: nowrap;
  }

  /* Error message — same visual language as the ribbon tooltips
     (cream card, gold border, Rouge Script), anchored below the quill. */
  .mic-error {
    position: absolute;
    top: calc(100% + 0.35rem);
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Rouge Script', cursive;
    font-size: 1rem;
    line-height: 1.25;
    color: #b85050;
    background: rgba(254, 252, 247, 0.96);
    border: 1px solid #dfc9a4;
    padding: 0.12rem 0.55rem;
    border-radius: 0.3rem;
    width: max-content;
    max-width: 16rem;
    text-align: center;
    pointer-events: none;
    z-index: 40;
  }
</style>
