<script lang="ts">
import { findWordIndex, tokenize } from '$lib/tokenize.js';
import { tick } from 'svelte';

let {
  text,
  sliceStart,
  currentCharIndex,
  placeholderText,
}: {
  text: string;
  sliceStart: number;
  currentCharIndex: number | null;
  placeholderText?: string;
} = $props();

const tokens = $derived(tokenize(text));
let containerEl: HTMLDivElement | undefined = $state();
let currentSpanIndex = $state(-1);

$effect(() => {
  if (currentCharIndex === null) {
    currentSpanIndex = -1;
    return;
  }
  const localCharIndex = currentCharIndex - sliceStart;
  if (localCharIndex < 0 || localCharIndex >= text.length) {
    currentSpanIndex = -1;
    return;
  }
  const idx = findWordIndex(tokens, localCharIndex);
  if (idx !== currentSpanIndex) {
    currentSpanIndex = idx;
    void scrollCurrentIntoView();
  }
});

async function scrollCurrentIntoView() {
  if (currentSpanIndex < 0 || !containerEl) return;
  await tick();
  const span = containerEl.querySelector(`[data-tok-idx="${currentSpanIndex}"]`);
  if (span && 'scrollIntoView' in span) {
    (span as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
</script>

<div class="reader-view" bind:this={containerEl}>
  {#if tokens.length === 0}
    <span class="reader-placeholder">{placeholderText ?? ''}</span>
  {:else}
    {#each tokens as tok, i}
      {#if tok.isWord}
        <span
          class="reader-word"
          class:is-current={i === currentSpanIndex}
          data-tok-idx={i}>{tok.text}</span>
      {:else}
        <span class="reader-ws" data-tok-idx={i}>{tok.text}</span>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .reader-view {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    color: inherit;
    padding: inherit;
    white-space: pre-wrap;
    word-break: normal;
    overflow-wrap: break-word;
    overflow-y: auto;
    height: 100%;
  }

  .reader-placeholder {
    color: rgba(0, 0, 0, 0.3);
    font-style: italic;
  }
</style>
