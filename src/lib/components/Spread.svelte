<script lang="ts">
import type { Snippet } from 'svelte';

type Props = {
  onFlipPrev: () => void;
  onFlipNext: () => void;
  canFlipPrev?: boolean;
  canFlipNext?: boolean;
  spreadIndex?: number;
  spreadCount?: number;
  flipDuration?: number;
  // Incrementing flipTrigger programmatically fires a flip in flipTriggerDir.
  flipTrigger?: number;
  flipTriggerDir?: 'next' | 'prev';
  // Zone widths as % of spread width. Cover state passes nextZonePct=50 so the
  // whole right page is a click target; entry state keeps them narrow.
  prevZonePct?: number;
  nextZonePct?: number;
  leftPage?: Snippet;
  rightPage?: Snippet;
};

const {
  onFlipPrev,
  onFlipNext,
  canFlipPrev = true,
  canFlipNext = true,
  spreadIndex = 0,
  spreadCount = 0,
  flipDuration = 500,
  flipTrigger = 0,
  flipTriggerDir = 'next',
  prevZonePct = 12,
  nextZonePct = 12,
  leftPage,
  rightPage,
}: Props = $props();

const MAX_STACK = 12;

let flipping = $state<'prev' | 'next' | null>(null);
// biome-ignore lint/style/useConst: bind:this requires let
let leafEl = $state<HTMLDivElement | null>(null);

const leftLayers = $derived(Math.min(spreadIndex, MAX_STACK));
const rightLayers = $derived(Math.min(Math.max(spreadCount - spreadIndex - 1, 0), MAX_STACK));

/* v8 ignore next 30 */
function triggerFlipNext() {
  if (flipping || !canFlipNext) return;
  if (!leafEl) return;
  flipping = 'next';
  // Clear any previous transition before setting initial state, then force a
  // reflow so the browser commits the initial position before we animate.
  leafEl.style.transition = 'none';
  leafEl.style.display = 'block';
  leafEl.style.transformOrigin = 'left center';
  leafEl.style.right = '0';
  leafEl.style.left = 'auto';
  leafEl.style.transform = 'perspective(1200px) rotateY(0deg)';
  void leafEl.offsetHeight; // force reflow
  requestAnimationFrame(() => {
    if (!leafEl) return;
    leafEl.style.transition = `transform ${flipDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    leafEl.style.transform = 'perspective(1200px) rotateY(-180deg)';
    const finish = () => {
      if (leafEl) leafEl.style.display = 'none';
      flipping = null;
      onFlipNext();
    };
    const fallback = setTimeout(finish, flipDuration + 100);
    leafEl.addEventListener(
      'transitionend',
      () => {
        clearTimeout(fallback);
        finish();
      },
      { once: true }
    );
  });
}

/* v8 ignore next 30 */
function triggerFlipPrev() {
  if (flipping || !canFlipPrev) return;
  if (!leafEl) return;
  flipping = 'prev';
  leafEl.style.transition = 'none';
  leafEl.style.display = 'block';
  leafEl.style.transformOrigin = 'right center';
  leafEl.style.left = '0';
  leafEl.style.right = 'auto';
  leafEl.style.transform = 'perspective(1200px) rotateY(0deg)';
  void leafEl.offsetHeight; // force reflow
  requestAnimationFrame(() => {
    if (!leafEl) return;
    leafEl.style.transition = `transform ${flipDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    leafEl.style.transform = 'perspective(1200px) rotateY(180deg)';
    const finish = () => {
      if (leafEl) leafEl.style.display = 'none';
      flipping = null;
      onFlipPrev();
    };
    const fallback = setTimeout(finish, flipDuration + 100);
    leafEl.addEventListener(
      'transitionend',
      () => {
        clearTimeout(fallback);
        finish();
      },
      { once: true }
    );
  });
}

$effect(() => {
  void flipTrigger;
  /* v8 ignore next 4 */
  if (!flipTrigger) return;
  if (flipTriggerDir === 'next') triggerFlipNext();
  else triggerFlipPrev();
});
</script>

<div class="spread-container">
	<div class="spread">
		<!-- Page-edge stacks (decorative) -->
		{#if leftLayers > 0}
			<div class="stack stack-left" aria-hidden="true">
				{#each { length: leftLayers } as _, i}
					<div class="stack-leaf" style="left: {-(i + 1) * 2}px; z-index: {-i}"></div>
				{/each}
			</div>
		{/if}

		{#if rightLayers > 0}
			<div class="stack stack-right" aria-hidden="true">
				{#each { length: rightLayers } as _, i}
					<div class="stack-leaf" style="right: {-(i + 1) * 2}px; z-index: {-i}"></div>
				{/each}
			</div>
		{/if}

		<!-- Left page -->
		<div class="page page-left">
			{#if leftPage}{@render leftPage()}{/if}
		</div>

		<!-- Right page -->
		<div class="page page-right">
			{#if rightPage}{@render rightPage()}{/if}
		</div>

		<!-- Animating leaf (hidden at rest) -->
		<div
			class="leaf"
			bind:this={leafEl}
			style="display: none; transform-style: preserve-3d;"
		>
			<div class="leaf-face leaf-front"></div>
			<div class="leaf-face leaf-back"></div>
		</div>

		<!-- Click zones -->
		<button
			type="button"
			class="flip-zone flip-zone-prev"
			style="width: {prevZonePct}%"
			aria-label="Previous page"
			disabled={!canFlipPrev}
			onclick={triggerFlipPrev}
		></button>

		<button
			type="button"
			class="flip-zone flip-zone-next"
			style="width: {nextZonePct}%"
			aria-label="Next page"
			disabled={!canFlipNext}
			onclick={triggerFlipNext}
		></button>
	</div>
</div>

<style>
	.spread-container {
		position: relative;
		width: 100%;
		height: 100%;
		perspective: 1000px;
	}

	.spread {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
	}

	.page {
		flex: 1;
		position: relative;
		overflow: hidden;
		background: #f5e9cf;
	}

	.page::before,
	.leaf-face::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65 0.55' numOctaves='4' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23p)' opacity='0.07'/%3E%3C/svg%3E");
		background-size: 300px 300px;
		pointer-events: none;
	}

	.page-left {
		border-right: 1px solid #d4c5a0;
	}

	/* Page-edge stacks */
	.stack {
		position: absolute;
		top: 0;
		height: 100%;
		pointer-events: none;
	}

	.stack-left {
		left: 0;
	}

	.stack-right {
		right: 0;
	}

	.stack-leaf {
		position: absolute;
		top: 0;
		width: 2px;
		height: 100%;
		background: #f5ead0;
		box-shadow: -1px 0 2px rgba(0, 0, 0, 0.08);
	}

	/* Animating leaf */
	.leaf {
		position: absolute;
		top: 0;
		width: 50%;
		height: 100%;
		transform-style: preserve-3d;
		z-index: 5;
	}

	.leaf-face {
		position: absolute;
		inset: 0;
		backface-visibility: hidden;
		background: #f5e9cf;
	}

	.leaf-front {
		box-shadow: inset -8px 0 20px rgba(0, 0, 0, 0.08);
	}

	.leaf-back {
		transform: rotateY(180deg);
		box-shadow: inset 8px 0 20px rgba(0, 0, 0, 0.08);
	}

	/* Click zones */
	.flip-zone {
		position: absolute;
		top: 0;
		height: 100%;
		z-index: 10;
		cursor: pointer;
		background: transparent;
		border: none;
		padding: 0;
	}

	.flip-zone:disabled {
		cursor: default;
		pointer-events: none;
	}

	.flip-zone-prev {
		left: 0;
	}

	.flip-zone-next {
		right: 0;
	}
</style>
