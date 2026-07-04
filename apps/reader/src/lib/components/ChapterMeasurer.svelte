<script lang="ts">
/**
 * The DOM half of measurement pagination — the diary layout's `measureEl`
 * effect (apps/diary/src/routes/(authenticated)/+layout.svelte) adapted
 * per-app. The diary probes a hidden <textarea> mirroring the editor; the
 * reader probes a hidden, real PageView, so every probe renders EXACTLY the
 * markup the live page renders (word spans, em/strong emphasis). Identity by
 * construction — there is no second HTML builder to drift out of sync.
 *
 * Mount one instance anywhere on the page; call `paginate` after layout
 * exists. `referenceEl` is the live page's text container: its computed box
 * and font metrics are copied onto the hidden host so probe text wraps
 * identically. Keep the reference container padding-free (put page padding on
 * a wrapper) — div scrollHeight/clientHeight padding accounting is the one
 * place the probe and the live page could disagree.
 */
import { flushSync, mount, unmount } from 'svelte';
import type { EmphasisRange } from '$lib/epub/model.js';
import { computeSplitPoints } from '$lib/pagination.js';
import PageView from './PageView.svelte';

// biome-ignore lint/style/useConst: bind:this requires let
let hostEl: HTMLDivElement | undefined = $state();

/** Compute one chapter's split points (absolute char offsets, see pagination.ts). */
export function paginate(
  referenceEl: HTMLElement,
  text: string,
  emphasis: EmphasisRange[]
): number[] {
  const host = hostEl;
  if (!host) return [];
  const style = getComputedStyle(referenceEl);
  host.style.width = style.width;
  host.style.height = style.height;
  host.style.font = style.font;
  host.style.lineHeight = style.lineHeight;
  host.style.padding = style.padding;
  const maxHeight = referenceEl.clientHeight;

  // Reactive props let one mounted probe serve every binary-search step;
  // flushSync makes each prop write render synchronously before measuring.
  const props = $state({
    text: '',
    sliceStart: 0,
    emphasis,
    currentCharIndex: null as number | null,
  });
  const probe = mount(PageView, { target: host, props });
  try {
    return computeSplitPoints(text, (slice, start) => {
      props.text = slice;
      props.sliceStart = start;
      flushSync();
      // The PageView root (height:100%, overflow:hidden) reports its full
      // content height via scrollHeight even while clipping.
      const inner = host.firstElementChild as HTMLElement;
      return inner.scrollHeight <= maxHeight;
    });
  } finally {
    unmount(probe);
  }
}
</script>

<div bind:this={hostEl} class="measure-host" aria-hidden="true"></div>

<style>
  /* Off-screen but laid out — display:none would zero every measurement. */
  .measure-host {
    position: absolute;
    top: 0;
    left: -99999px;
    visibility: hidden;
    pointer-events: none;
  }
</style>
