<script lang="ts">
import { untrack } from 'svelte';
import type { PageData } from './$types';

const { data }: { data: PageData } = $props();

// biome-ignore lint/style/useConst: $state runes must be let — Svelte 5 requires reassignment
let content = $state(untrack(() => data.content));
let saved = $state(false);

$effect(() => {
  const timer = setTimeout(async () => {
    await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: data.date, content }),
    });
    saved = true;
    setTimeout(() => {
      saved = false;
    }, 1000);
  }, 1500);
  return () => clearTimeout(timer);
});
</script>

<div class="flex min-h-screen flex-col bg-stone-50 px-4 py-8">
  <div class="mx-auto w-full max-w-2xl space-y-4">
    <div class="flex items-baseline justify-between">
      <h1 class="font-serif text-lg text-stone-500">{data.displayDate}</h1>
      <span
        class="text-xs text-stone-400 transition-opacity duration-500 {saved
          ? 'opacity-100'
          : 'opacity-0'}"
      >
        Saved
      </span>
    </div>

    <textarea
      bind:value={content}
      class="min-h-[60vh] w-full resize-none rounded-sm border-none bg-white p-6 font-serif text-base leading-relaxed text-stone-800 shadow-sm focus:outline-none"
      placeholder="Write something…"
      spellcheck="true"
    ></textarea>

    <div class="flex justify-end">
      <a href="/logout" class="text-xs text-stone-400 hover:text-stone-600">Log out</a>
    </div>
  </div>
</div>
