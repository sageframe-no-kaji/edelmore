<script lang="ts">
import { formatDisplayDate } from '$lib/dates.js';
import type { EntryDatePreview } from '$lib/db.js';
import { onMount, tick, untrack } from 'svelte';

type Props = {
  entries: EntryDatePreview[];
  onNavigate: (date: string) => void;
};

const { entries, onNavigate }: Props = $props();

// biome-ignore lint/style/useConst: $state with bind:this — Svelte assigns via binding
let pageEl: HTMLDivElement | null = $state(null);
// biome-ignore lint/style/useConst: $state with bind:this — Svelte assigns via binding
let listEl: HTMLUListElement | null = $state(null);
let visibleCount = $state(untrack(() => entries.length));

const orderedEntries = $derived(
  [...entries].sort((left, right) => right.entry_date.localeCompare(left.entry_date))
);

function updateVisibleCount() {
  if (!pageEl || !listEl) return;
  const availableHeight = listEl.clientHeight;
  if (availableHeight <= 0) {
    visibleCount = orderedEntries.length;
    return;
  }

  const items = Array.from(listEl.children) as HTMLElement[];
  let nextVisibleCount = 0;

  for (const item of items) {
    const itemBottom = item.offsetTop + item.offsetHeight;
    if (itemBottom > availableHeight) break;
    nextVisibleCount += 1;
  }

  visibleCount = Math.max(1, nextVisibleCount);
}

onMount(() => {
  if (typeof ResizeObserver === 'undefined') {
    void tick().then(updateVisibleCount);
    return;
  }

  const resizeObserver = new ResizeObserver(() => {
    void tick().then(updateVisibleCount);
  });

  if (pageEl) resizeObserver.observe(pageEl);
  if (listEl) resizeObserver.observe(listEl);

  void tick().then(updateVisibleCount);

  return () => resizeObserver.disconnect();
});

$effect(() => {
  void orderedEntries;
  void tick().then(updateVisibleCount);
});
</script>

<div bind:this={pageEl} class="px-8 py-10 h-full overflow-hidden flex flex-col">
  <h2 class="toc-title">
    Recent Entries
  </h2>

  {#if orderedEntries.length === 0}
    <p class="font-serif text-xs text-cream-500 italic">No entries yet.</p>
  {:else}
    <ul bind:this={listEl} class="space-y-3 overflow-hidden flex-1 min-h-0">
      {#each orderedEntries.slice(0, visibleCount) as entry}
        <li data-entry-date={entry.entry_date}>
          <button
            type="button"
            onclick={() => onNavigate(entry.entry_date)}
            class="w-full text-left font-serif text-sm text-ink-900 hover:text-ornament-gold transition-colors"
          >
            {formatDisplayDate(entry.entry_date)}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .toc-title {
    font-family: 'Rouge Script', cursive;
    font-size: clamp(2.8rem, 7.6cqw, 5.2rem);
    color: #8b6914;
    margin: 0 0 1.2rem;
    border-bottom: 1px solid #e4cfa8;
    padding-bottom: 0.75rem;
    letter-spacing: 0.04em;
  }
</style>
