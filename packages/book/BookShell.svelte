<script lang="ts">
import { tweened } from 'svelte/motion';
import { cubicOut } from 'svelte/easing';
import { tick } from 'svelte';
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

// ── Page-flip primitive (lifted from the diary's +layout.svelte) ────────────
//
// Forward: only the right page rotates, pivoting at its left edge (= spine).
// Backward: only the left page rotates, pivoting at its right edge (= spine).
//
// The rotating wrapper has TWO absolutely-positioned faces:
//   - front: clone of the OLD page (snapshot taken before mutation)
//   - back: clone of the NEW page (snapshot taken after mutation),
//           pre-rotated 180° so its content reads correctly when revealed.
// Both faces use `backface-visibility: hidden` so each is visible only on
// the matching half of the rotation arc.
//
// The live (now-new-content) page underneath is hidden via `visibility`
// during the rotation so it doesn't bleed around the rotating wrapper.

const flipDurationMs = 700;
const flipAngle = tweened(0, { duration: flipDurationMs, easing: cubicOut });
let isFlipping = $state(false);
// biome-ignore lint/style/useConst: bind:this requires let — Biome doesn't see template bindings
let bookShellEl: HTMLDivElement | null = $state(null);

function getLivePage(direction: 'forward' | 'backward'): HTMLElement | null {
  const selector = direction === 'forward' ? '.page-right' : '.page-left';
  return bookShellEl?.querySelector<HTMLElement>(`.spread ${selector}`) ?? null;
}

function makeFace(source: HTMLElement, isBack: boolean): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.position = 'absolute';
  clone.style.top = '0';
  clone.style.left = '0';
  clone.style.width = '100%';
  clone.style.height = '100%';
  clone.style.margin = '0';
  clone.style.backfaceVisibility = 'hidden';
  // Strip page edge artifacts:
  //  - filter:drop-shadow would double up against the live page underneath
  //  - boxShadow: the outer-edge 2px strip becomes visible at edge-on angles
  //  - clipPath: the clone's clip-path must not differ subpixel-wise from
  //    the live page's, otherwise the live's 2px inset strip peeks out at
  //    the bump points. Making the clone a clean rectangle guarantees full
  //    coverage with no peek.
  clone.style.filter = 'none';
  clone.style.boxShadow = 'none';
  clone.style.clipPath = 'none';
  clone.style.visibility = 'visible';
  if (isBack) clone.style.transform = 'rotateY(180deg)';
  return clone;
}

export async function flip(
  direction: 'forward' | 'backward',
  mutate: () => void | Promise<void>
): Promise<void> {
  if (isFlipping) return;
  if (!bookShellEl) {
    await mutate();
    return;
  }
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    await mutate();
    return;
  }
  // Front face = OLD page being turned (forward = right; backward = left).
  // Opposite = the OLD page on the other side, which stays visible during
  // the first half of the flip (so the user sees the OLD spread until the
  // turning page passes 90°).
  const oldFront = getLivePage(direction);
  const oppositeDirection = direction === 'forward' ? 'backward' : 'forward';
  const oldOpposite = getLivePage(oppositeDirection);
  if (!oldFront) {
    await mutate();
    return;
  }

  // Claim the flip BEFORE the forward-flip delay — during that 500ms the
  // guard at the top otherwise let a second flip start concurrently
  // (double-click = double navigation + overlapping clone animations).
  isFlipping = true;
  if (direction === 'forward') {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Snapshot the OLD turning page (front face) and OLD opposite-side page
  // (static overlay) — both BEFORE mutation, so they hold the OLD content.
  const frontFace = makeFace(oldFront, false);
  const oppositeOverlay = oldOpposite
    ? (() => {
        const clone = oldOpposite.cloneNode(true) as HTMLElement;
        clone.style.position = 'absolute';
        clone.style.top = '0';
        clone.style.width = '50%';
        clone.style.height = '100%';
        clone.style.left = oppositeDirection === 'backward' ? '0' : '50%';
        clone.style.margin = '0';
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '45';
        clone.style.filter = 'none';
        clone.style.boxShadow = 'none';
        clone.style.clipPath = 'none';
        clone.style.visibility = 'visible';
        return clone;
      })()
    : null;

  // Build the rotating wrapper with the front face. Back face is added
  // after mutation. The wrapper at rotateY(0deg) sits on the same-side
  // half showing the OLD turning page content. All positioning is inline
  // (not via CSS classes) so there's zero risk of cascade/specificity
  // putting the wrapper on the wrong half.
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.top = '0';
  wrapper.style.width = '50%';
  wrapper.style.height = '100%';
  wrapper.style.left = direction === 'forward' ? '50%' : '0';
  wrapper.style.transformOrigin = direction === 'forward' ? 'left center' : 'right center';
  wrapper.style.transformStyle = 'preserve-3d';
  wrapper.style.willChange = 'transform';
  wrapper.style.zIndex = '50';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.transform = 'rotateY(0deg)';
  wrapper.appendChild(frontFace);

  // CRITICAL: insert overlay + wrapper BEFORE awaiting mutate. Once we
  // await, the browser can paint, and live pages will have updated to NEW
  // content under us. The OLD-content overlay must be in place by then.
  // Hide both live pages via the flip-hidden class so neither's NEW content
  // can peek out from under the rotating wrapper (same-side, where the
  // wrapper foreshortens) or from clip-path bump mismatches with the
  // overlay (opposite-side).
  if (oppositeOverlay) bookShellEl.appendChild(oppositeOverlay);
  bookShellEl.appendChild(wrapper);
  const livePages = { same: oldFront, opposite: oldOpposite };
  livePages.same.classList.add('flip-hidden');
  livePages.opposite?.classList.add('flip-hidden');

  // Run the mutation (sync state change, or async routed navigation).
  await Promise.resolve(mutate());
  await tick();

  // Tween the rotation. backFace is NOT appended yet — we add it at the
  // 90° midpoint and remove the frontFace then too. This avoids relying
  // on backface-visibility:hidden, which doesn't always work reliably in
  // nested 3D contexts (without it, the back face's rotateY(180°) shows
  // its NEW content MIRRORED during 0-90°, visible behind the front face).
  // Each face is only in the DOM during the half-rotation it should be
  // visible in.
  let crossedMidpoint = false;
  flipAngle.set(0, { duration: 0 });
  const unsubscribe = flipAngle.subscribe((angle) => {
    wrapper.style.transform = `rotateY(${angle}deg)`;
    if (!crossedMidpoint && Math.abs(angle) >= 90) {
      crossedMidpoint = true;
      // Swap front face out, back face in. Wrapper at 90° is edge-on, so
      // the swap happens during its invisible moment.
      frontFace.remove();
      const newBack = getLivePage(oppositeDirection);
      if (newBack) wrapper.appendChild(makeFace(newBack, true));
      livePages.same.classList.remove('flip-hidden');
      livePages.opposite?.classList.remove('flip-hidden');
      if (oppositeOverlay?.parentNode) oppositeOverlay.remove();
    }
  });
  const target = direction === 'forward' ? -180 : 180;
  await flipAngle.set(target);

  // Cleanup.
  unsubscribe();
  wrapper.remove();
  if (oppositeOverlay?.parentNode) oppositeOverlay.remove();
  livePages.same.classList.remove('flip-hidden');
  livePages.opposite?.classList.remove('flip-hidden');
  isFlipping = false;
}
</script>

<div
  class="book-frame flip-stage relative aspect-[331/194]"
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
   * consumer's cover artwork provides its own shadow. */
  .book-frame.is-cover-state .book-shadow-backdrop,
  .book-frame.is-back-cover-state .book-shadow-backdrop {
    opacity: 0;
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
