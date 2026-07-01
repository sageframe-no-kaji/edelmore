<script lang="ts" module>
export interface VoiceOption {
  uri: string;
  name: string;
  lang: string;
  isDefault: boolean;
  source: 'kokoro';
}

/** Ordered list of featured Kokoro voices the picker offers. Hardcoded in v1;
 * promotable to a prop once a third consumer wants a different list. */
export const KOKORO_FEATURED_VOICES = ['bf_emma', 'am_echo', 'af_bella', 'bm_daniel'] as const;
export const KOKORO_VOICE_LABELS: Record<string, string> = {
  bf_emma: 'Emma (British)',
  am_echo: 'Echo (American)',
  af_bella: 'Bella (American)',
  bm_daniel: 'Daniel (British)',
};
</script>

<script lang="ts">
import { untrack } from 'svelte';
import { audioBlobUrlFromBase64, isKokoroVoiceUri } from './narration.js';

interface Props {
  value: string | null;
  onChange: (uri: string | null) => void;
  showPreviewButton?: boolean;
}

let { value, onChange, showPreviewButton = true }: Props = $props();

// Kokoro is the only narration engine in this system. No browser-voice
// fallback. If the server is unreachable, the picker still shows the four
// featured voices (so settings remains usable) but flags the server as
// offline so the user knows narration won't work until it's back.
let voices: VoiceOption[] = $state(buildFeaturedVoices());
let serverOffline = $state(false);

function buildFeaturedVoices(filter?: Set<string>): VoiceOption[] {
  const ids = filter
    ? KOKORO_FEATURED_VOICES.filter((id) => filter.has(id))
    : ([...KOKORO_FEATURED_VOICES] as string[]);
  return ids.map((id) => ({
    uri: id,
    name: KOKORO_VOICE_LABELS[id] ?? id,
    lang: 'en',
    isDefault: false,
    source: 'kokoro' as const,
  }));
}

// Check Kokoro reachability once on mount, and prune the voice list to what
// the server actually has. Either way, default `value` to the first voice if
// the consumer hasn't picked one.
$effect(() => {
  if (typeof window === 'undefined') return;
  fetch('/api/speak/voices')
    .then(async (res) => {
      if (!res.ok) {
        serverOffline = true;
        seedDefaultIfNeeded();
        return;
      }
      const payload = await res.json();
      const available = new Set<string>(
        (payload.voices ?? []).map((v: { id: string }) => v.id)
      );
      if (available.size === 0) {
        serverOffline = true;
        seedDefaultIfNeeded();
        return;
      }
      voices = buildFeaturedVoices(available);
      serverOffline = voices.length === 0;
      seedDefaultIfNeeded();
    })
    .catch(() => {
      serverOffline = true;
      seedDefaultIfNeeded();
    });
});

function seedDefaultIfNeeded() {
  // If value isn't a Kokoro slug (legacy browser URI saved from before
  // Kokoro-only mode, or null), nudge it to the first available voice.
  if (voices.length === 0) return;
  if (!isKokoroVoiceUri(untrack(() => value))) {
    onChange(voices[0].uri);
  }
}

function onSelect(e: Event) {
  const target = e.currentTarget as HTMLSelectElement;
  onChange(target.value || null);
}

function previewVoice() {
  if (typeof window === 'undefined' || !value) return;
  fetch('/api/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Welcome to Edelmore.', voice: value, speed: 1.0 }),
  })
    .then(async (res) => {
      if (!res.ok) return;
      const body = await res.text();
      const firstLine = body.split('\n').find((l) => l.trim());
      if (!firstLine) return;
      let chunk: { audio?: string; format?: string };
      try {
        chunk = JSON.parse(firstLine);
      } catch {
        return;
      }
      if (!chunk.audio || !chunk.format) return;
      const url = audioBlobUrlFromBase64(chunk.audio, chunk.format);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      void audio.play();
    })
    .catch(() => {
      // Preview failure is silent — cosmetic.
    });
}
</script>

<div class="flex items-center gap-2">
  <select
    value={value ?? ''}
    onchange={onSelect}
    class="flex-1 bg-transparent border-b border-stone-300 text-ink-900 text-sm pb-1 outline-none focus:border-stone-500 transition-colors"
  >
    {#each voices as v (v.uri)}
      <option value={v.uri}>{v.name}</option>
    {/each}
  </select>
  {#if showPreviewButton}
    <button
      type="button"
      onclick={previewVoice}
      aria-label="Preview voice"
      class="w-7 h-7 border border-stone-300 text-stone-500 text-sm leading-none hover:border-stone-500 hover:text-ornament-gold transition-colors flex items-center justify-center"
      >▶</button
    >
  {/if}
</div>
{#if serverOffline}
  <p class="text-[0.6rem] italic text-stone-400 mt-1">
    Voice server is offline — narration will not work until it's reachable.
  </p>
{/if}
