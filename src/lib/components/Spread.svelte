<script lang="ts">
import type { Snippet } from 'svelte';

type Props = {
  onFlipPrev: () => void;
  onFlipNext: () => void;
  canFlipPrev?: boolean;
  canFlipNext?: boolean;
  spreadIndex?: number;
  spreadCount?: number;
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
  leftPage,
  rightPage,
}: Props = $props();

const MAX_STACK = 12;

let flipping = $state<'prev' | 'next' | null>(null);
// biome-ignore lint/style/useConst: bind:this requires let
let leafEl = $state<HTMLDivElement | null>(null);

const leftLayers = $derived(Math.min(spreadIndex, MAX_STACK));
const rightLayers = $derived(Math.min(Math.max(spreadCount - spreadIndex - 1, 0), MAX_STACK));

/* v8 ignore next 26 */
function triggerFlipNext() {
  if (flipping || !canFlipNext) return;
  flipping = 'next';
  if (!leafEl) return;
  leafEl.style.display = 'block';
  leafEl.style.transformOrigin = 'left center';
  leafEl.style.transform = 'rotateY(0deg)';
  leafEl.style.right = '0';
  leafEl.style.left = 'auto';
  requestAnimationFrame(() => {
    if (!leafEl) return;
    leafEl.style.transition = 'transform 500ms cubic-bezier(0.4, 0, 0.2, 1)';
    leafEl.style.transform = 'rotateY(-180deg)';
    leafEl.addEventListener(
      'transitionend',
      () => {
        if (leafEl) leafEl.style.display = 'none';
        flipping = null;
        onFlipNext();
      },
      { once: true }
    );
  });
}

/* v8 ignore next 26 */
function triggerFlipPrev() {
  if (flipping || !canFlipPrev) return;
  flipping = 'prev';
  if (!leafEl) return;
  leafEl.style.display = 'block';
  leafEl.style.transformOrigin = 'right center';
  leafEl.style.transform = 'rotateY(0deg)';
  leafEl.style.left = '0';
  leafEl.style.right = 'auto';
  requestAnimationFrame(() => {
    if (!leafEl) return;
    leafEl.style.transition = 'transform 500ms cubic-bezier(0.4, 0, 0.2, 1)';
    leafEl.style.transform = 'rotateY(180deg)';
    leafEl.addEventListener(
      'transitionend',
      () => {
        if (leafEl) leafEl.style.display = 'none';
        flipping = null;
        onFlipPrev();
      },
      { once: true }
    );
  });
}
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
			aria-label="Previous page"
			disabled={!canFlipPrev}
			onclick={triggerFlipPrev}
		></button>

		<button
			type="button"
			class="flip-zone flip-zone-next"
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
		background: #fdf6e3;
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
		background: #fdf6e3;
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
		left: -50px;
		width: calc(15% + 50px);
	}

	.flip-zone-next {
		right: -50px;
		width: calc(15% + 50px);
	}
</style>
