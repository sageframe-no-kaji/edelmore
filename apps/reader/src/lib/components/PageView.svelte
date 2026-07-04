<script lang="ts">
/**
 * Read-only page renderer — the diary ReaderView idiom copied and adapted
 * per-app, NOT imported. Renders one page slice as word/whitespace spans so a
 * future narration highlight can address individual words, with emphasis
 * rendered as real `em`/`strong` semantics.
 *
 * Layout discipline: nothing on a word span may affect layout. The diary's
 * ReaderView needed a padding + negative-margin pair that had to cancel
 * exactly, or the rendered wrapping stopped matching the splitPoints computed
 * against the editor. The reader avoids that hazard entirely — no padding,
 * margin, or border on spans; the highlight is background + box-shadow only.
 * ChapterMeasurer measures a real PageView, so emphasis (which legitimately
 * changes glyph widths) is identical between measurement and render.
 *
 * TODO(illustrations): PlateRef rendering is deliberately skipped in this
 * substrate, pending the illustration decision. Plates anchor at character
 * offsets but occupy no characters, so pagination and this renderer are
 * unaffected by chapters that contain them.
 */
import type { EmphasisRange } from '$lib/epub/model.js';
import { findWordIndex, tokenize } from '$lib/tokenize.js';

const {
  text,
  sliceStart,
  emphasis = [],
  currentCharIndex = null,
}: {
  /** This page's slice of the chapter text. */
  text: string;
  /** Chapter-absolute offset of `text[0]` — keys into the offset spine. */
  sliceStart: number;
  /** Chapter-absolute emphasis ranges; only those overlapping the slice apply. */
  emphasis?: EmphasisRange[];
  /**
   * Chapter-absolute narration position. Renders the word highlight when it
   * falls on this page; no audio wiring yet (reserved for the narration ho).
   */
  currentCharIndex?: number | null;
} = $props();

const tokens = $derived(tokenize(text, sliceStart, emphasis));
const currentSpanIndex = $derived(
  currentCharIndex === null ? -1 : findWordIndex(tokens, currentCharIndex)
);
</script>

<!-- Token spans hug their delimiters: any stray whitespace between template
     nodes would add text the measurer never saw and shift wrapping. -->
<div class="page-text">{#each tokens as tok, i}<span
      class={tok.isWord ? 'page-word' : 'page-ws'}
      class:is-current={tok.isWord && i === currentSpanIndex}
      data-tok-idx={i}>{#if tok.emphasis.length === 0}{tok.text}{:else if tok.emphasis.includes('em') && tok.emphasis.includes('strong')}<em><strong>{tok.text}</strong></em>{:else if tok.emphasis.includes('em')}<em>{tok.text}</em>{:else}<strong>{tok.text}</strong>{/if}</span>{/each}</div>

<style>
  .page-text {
    font: inherit;
    line-height: inherit;
    color: inherit;
    white-space: pre-wrap;
    word-break: normal;
    overflow-wrap: break-word;
    overflow: hidden;
    height: 100%;
  }

  /* Highlight is deliberately layout-inert: background + box-shadow only.
     No padding/margin/border on any span — see the header comment. */
  .page-word.is-current {
    background-color: rgba(133, 190, 69, 0.25);
    box-shadow: 0 0 0 3px rgba(133, 190, 69, 0.25);
    border-radius: 3px;
  }
</style>
