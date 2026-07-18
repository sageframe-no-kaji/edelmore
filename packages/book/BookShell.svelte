<script lang="ts">
import type { Snippet } from 'svelte';
import './styles.css';

type Props = {
  // 0..1; progress through the book. Drives left/right page-stack thickness.
  progress: number;
  // Cover or back-cover state. Hides seam + stacks, fades leather frame in/out.
  isClosed?: boolean;
  // Front-cover only. Hides the rectangular shadow backdrop (cover artwork
  // provides its own).
  isCoverState?: boolean;
  // Back-cover only. Same shadow handling as cover.
  isBackCoverState?: boolean;
  // Front endpaper. Fades the left page-stack visual.
  hideLeftStack?: boolean;
  // Back endpaper. Fades the right page-stack visual.
  hideRightStack?: boolean;
  // The content that lives inside the shell — typically <Spread> with the
  // consumer's leftPage/rightPage snippets.
  children?: Snippet;
  // Overlay content rendered as a sibling of the shell inside the book-frame.
  // Container-query context comes from .book-frame. Used by the diary's spell
  // ribbon and the reader's narration ribbon. Conditional rendering (e.g. hide
  // on cover) is the consumer's responsibility — wrap in {#if} inside the
  // snippet.
  overlay?: Snippet;
};

const {
  progress,
  isClosed = false,
  isCoverState = false,
  isBackCoverState = false,
  hideLeftStack = false,
  hideRightStack = false,
  children,
  overlay,
}: Props = $props();

// Page-stack thickness — driven by progress through the book.
const compressedProgress = $derived(progress ** 0.85);
const leftStack = $derived(compressedProgress);
const rightStack = $derived(1 - compressedProgress);

// ── Page-flip primitive (View Transitions; reader Ho-04, Phase E) ───────────
//
// The browser snapshots the live DOM (parent CSS context intact), runs
// mutate(), and animates OLD → NEW. The 3D book turn is styled on the
// ::view-transition pseudo-elements in styles.css, with the flip direction
// carried on <html data-page-flip>. Without View Transitions support the
// page changes instantly (Decision 9: one animation path, no clone fallback —
// the clone-rotate mechanism this replaced lived here until Phase E; see the
// ho document for its architecture and why it was retired).

let isFlipping = $state(false);
// biome-ignore lint/style/useConst: bind:this requires let — Biome doesn't see template bindings
let bookShellEl: HTMLDivElement | null = $state(null);

export async function flip(
  direction: 'forward' | 'backward',
  mutate: () => void | Promise<void>
): Promise<void> {
  if (isFlipping) return;
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vt =
    typeof document !== 'undefined' && typeof document.startViewTransition === 'function';
  if (!bookShellEl || reducedMotion || !vt) {
    await mutate();
    return;
  }

  // AT-02 / Decision 11: isFlipping is released whether the transition
  // completes or mutate() rejects; the transition owns its own
  // pseudo-elements, so cleanup is the flag and the direction attribute.
  isFlipping = true;
  document.documentElement.setAttribute('data-page-flip', direction);
  try {
    const transition = document.startViewTransition(() => Promise.resolve(mutate()));
    // finished rejects iff mutate() rejects (surfacing to the caller);
    // otherwise it resolves when the animation ends, holding isFlipping
    // for the whole turn.
    await transition.finished;
  } finally {
    document.documentElement.removeAttribute('data-page-flip');
    isFlipping = false;
  }
}
</script>

<div
  class="book-frame relative aspect-[331/194]"
  class:is-closed={isClosed}
  class:is-cover-state={isCoverState}
  class:is-back-cover-state={isBackCoverState}
>
  <div class="book-shadow-backdrop" aria-hidden="true"></div>
  <div
    bind:this={bookShellEl}
    class="book-shell"
    class:is-closed={isClosed}
    class:hide-left-stack={hideLeftStack}
    class:hide-right-stack={hideRightStack}
    style="--left-stack: {leftStack}; --right-stack: {rightStack};"
  >
    <div class="book-shell-inner">
      <div class="shell-stack shell-stack-left" aria-hidden="true"></div>
      <div class="shell-stack shell-stack-right" aria-hidden="true"></div>
      {@render children?.()}
      <div class="shell-seam" aria-hidden="true"></div>
    </div>
  </div>
  {#if overlay}{@render overlay()}{/if}
</div>

<style>
  /* Scoped chrome styles. Apply only to Svelte-rendered elements. Styles for
   * imperatively-created DOM (flip clones) and imperatively-added classes
   * (.flip-hidden) live in styles.css. */

  .book-frame {
    /* container query context for .overlay children (diary's spell-anchor,
     * reader's narration ribbon). cqi units in those overlays resolve
     * against this container. */
    container-type: inline-size;
    transform: translateY(-2.4rem);
  }

  /* Leather edge is on a pseudo so we can fade it (image backgrounds can't
   * transition smoothly between url() and none). Consumer apps supply
   * /edge.png in their static/ directory. */
  .book-frame::before {
    content: '';
    position: absolute;
    inset: 0;
    background: url('/edge.png') center / 100% 100% no-repeat;
    z-index: -1;
    transition: opacity 700ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .book-frame.is-closed::before {
    opacity: 0;
    /* Closing: the open-book chrome must get out of the way faster than the
       cover lands — a 700ms fade leaves an open-book-sized frame ghost
       around the (half-size) closed book. Opening keeps the base 700ms
       fade-in, coordinated under the turning cover. */
    transition-duration: 250ms;
  }

  .book-shell {
    position: absolute;
    width: 93%;
    height: 93%;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    container-type: inline-size;
    /* Depth shadow lives on .book-shadow-backdrop (sibling). The rotating
     * flip wrapper is appended to .book-shell as a sibling of
     * .book-shell-inner. */
    /* Smooth the open ↔ closed structural transition so the book reshapes
     * in sync with the page-flip rotation. */
    transition:
      width 700ms cubic-bezier(0.4, 0, 0.2, 1),
      height 700ms cubic-bezier(0.4, 0, 0.2, 1),
      top 700ms cubic-bezier(0.4, 0, 0.2, 1),
      left 700ms cubic-bezier(0.4, 0, 0.2, 1),
      transform 700ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* .book-shell stays at 93%×93% in all states (open and closed). Keeping
   * the size constant means the physical book doesn't appear to change
   * size when opened — only the leather frame and the page rotation
   * animate. */

  /* Wraps the static content (stacks + spread + seam). No filter — depth
   * shadow lives on .book-shadow-backdrop which the flip never touches. */
  .book-shell-inner {
    position: absolute;
    inset: 0;
  }

  /* Static depth shadow. Sized to match the visible book silhouette.
   * Sits behind .book-shell, has no children, no flips touch it — its
   * box-shadow never recomputes during a flip, so there's no flash. */
  .book-shadow-backdrop {
    position: absolute;
    width: 93%;
    height: 93%;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.45),
      0 6px 18px  rgba(0, 0, 0, 0.30),
      0 2px 4px   rgba(0, 0, 0, 0.20);
    pointer-events: none;
    z-index: 0;
    border-radius: 4px;
    transition:
      width 700ms cubic-bezier(0.4, 0, 0.2, 1),
      height 700ms cubic-bezier(0.4, 0, 0.2, 1),
      top 700ms cubic-bezier(0.4, 0, 0.2, 1),
      left 700ms cubic-bezier(0.4, 0, 0.2, 1),
      transform 700ms cubic-bezier(0.4, 0, 0.2, 1),
      opacity 700ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Cover/back-cover (closed): hide the rectangular backdrop. The
   * consumer's cover artwork provides its own shadow. Fast fade-out for the
   * same reason as the leather frame — the open-size shadow must not ghost
   * around the closed book. */
  .book-frame.is-cover-state .book-shadow-backdrop,
  .book-frame.is-back-cover-state .book-shadow-backdrop {
    opacity: 0;
    transition-duration: 250ms;
  }

  /* Shell stack suppression for endpaper states */
  .book-shell.hide-left-stack .shell-stack-left {
    opacity: 0;
  }

  .book-shell.hide-right-stack .shell-stack-right {
    opacity: 0;
  }

  /* ── Shell stacks (procedural, no DOM per leaf) ──────────────────────── */

  .shell-stack {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 0;
    transition: opacity 700ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .shell-stack-left {
    left: calc(-1 * var(--left-stack) * 3cqw);
    width: calc(var(--left-stack) * 3cqw);
    border-radius: 3px 0 0 3px;
    background:
      linear-gradient(to right, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.10) 100%),
      repeating-linear-gradient(
        to right,
        #f0e3c6 0,             #f0e3c6 2px,
        rgba(0,0,0,0.28) 2px,  rgba(0,0,0,0.28) 2.5px,
        #ece0bc 2.5px,         #ece0bc 4.5px,
        rgba(0,0,0,0.22) 4.5px, rgba(0,0,0,0.22) 5px,
        #f3e7cb 5px,           #f3e7cb 7px,
        rgba(0,0,0,0.25) 7px,  rgba(0,0,0,0.25) 7.5px,
        #e8d9b2 7.5px,         #e8d9b2 9.5px,
        rgba(0,0,0,0.22) 9.5px, rgba(0,0,0,0.22) 10px
      );
    mask-image: linear-gradient(to right, black 60%, rgba(0, 0, 0, 0.75) 100%);
  }

  .shell-stack-right {
    right: calc(-1 * var(--right-stack) * 3cqw);
    width: calc(var(--right-stack) * 3cqw);
    border-radius: 0 3px 3px 0;
    background:
      linear-gradient(to left, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.10) 100%),
      repeating-linear-gradient(
        to left,
        #f0e3c6 0,             #f0e3c6 2px,
        rgba(0,0,0,0.28) 2px,  rgba(0,0,0,0.28) 2.5px,
        #ece0bc 2.5px,         #ece0bc 4.5px,
        rgba(0,0,0,0.22) 4.5px, rgba(0,0,0,0.22) 5px,
        #f3e7cb 5px,           #f3e7cb 7px,
        rgba(0,0,0,0.25) 7px,  rgba(0,0,0,0.25) 7.5px,
        #e8d9b2 7.5px,         #e8d9b2 9.5px,
        rgba(0,0,0,0.22) 9.5px, rgba(0,0,0,0.22) 10px
      );
    mask-image: linear-gradient(to left, black 60%, rgba(0, 0, 0, 0.75) 100%);
  }

  /* ── Gutter seam (persistent, above spread, below modals) ───────────── */

  .shell-seam {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 6px;
    transform: translateX(-50%);
    pointer-events: none;
    z-index: 5;
    transition: opacity 700ms cubic-bezier(0.4, 0, 0.2, 1);
    background:
      linear-gradient(
        to right,
        rgba(0, 0, 0, 0.18) 0%,
        rgba(0, 0, 0, 0.05) 30%,
        rgba(0, 0, 0, 0.08) 50%,
        rgba(0, 0, 0, 0.05) 70%,
        rgba(0, 0, 0, 0.18) 100%
      );
  }

  .book-shell.is-closed .shell-seam,
  .book-shell.is-closed .shell-stack {
    opacity: 0;
    transition: none;
  }
</style>
