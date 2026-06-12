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

const MAX_SECONDS = 90;
const HOLD_CANCEL_MS = 800;
const ERROR_DISPLAY_MS = 2500;

function clearElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

function showError(message: string) {
  micState.set({ phase: 'error', errorMessage: message, elapsed: get(micState).elapsed });
  setTimeout(() => {
    if (get(micState).phase === 'error') {
      micState.set({ phase: 'idle', errorMessage: '', elapsed: 0 });
    }
  }, ERROR_DISPLAY_MS);
}

async function start(insert: (text: string) => void, onstart?: () => void) {
  if (starting || get(micState).phase !== 'idle') return;
  starting = true;
  activeInsert = insert;
  cancelled = false;
  chunks = [];
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
    // Recording has actually begun — let the host capture the insertion anchor
    // (the absolute content offset the transcription will land at).
    onstart?.();
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
type Props = {
  oninsert: (text: string) => void;
  /** Called the moment recording begins — the host captures the insertion anchor here. */
  onstart?: () => void;
  /** Optional aria-label override. */
  ariaLabel?: string;
};

const { oninsert, onstart, ariaLabel }: Props = $props();

let holdTimer: ReturnType<typeof setTimeout> | null = null;
// Swallows the synthetic click that follows a hold-to-cancel release.
let suppressClick = false;

function onPointerDown() {
  if (get(micState).phase !== 'recording') return;
  holdTimer = setTimeout(() => {
    cancelled = true;
    // The finger release after a hold-cancel still fires a synthetic click;
    // if it lands after phase returns to 'idle', onClick would immediately
    // start a NEW recording the user just cancelled. Swallow that click.
    suppressClick = true;
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
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const phase = get(micState).phase;
  if (phase === 'idle') void start(oninsert, onstart);
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
</button>

<style>
  .mic-quill {
    /* Fill the wrapper slot exactly — the wrapper sets the size (3.6cqi
       in the ribbon, 1.5rem on mobile). */
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
</style>
