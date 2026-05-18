<script lang="ts">
import type { Snippet } from 'svelte';

type Props = {
  onFlipPrev: () => void;
  onFlipNext: () => void;
  canFlipPrev?: boolean;
  canFlipNext?: boolean;
  spreadIndex?: number;
  spreadCount?: number;
  // Kept for API compatibility; unused until animation is re-added.
  flipDuration?: number;
  flipTrigger?: number;
  flipTriggerDir?: 'next' | 'prev';
  // 0 = no zone rendered.
  prevZonePct?: number;
  nextZonePct?: number;
  // Extra reach of the flip zones outside the page edge into the gutter (rem).
  overhangRem?: number;
  // When true the left page is invisible but still occupies its layout space,
  // so the right page stays on the right (used for the closed-book cover view).
  hideLeftPage?: boolean;
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
  flipTrigger = 0,
  flipTriggerDir = 'next',
  prevZonePct = 0,
  nextZonePct = 0,
  overhangRem = 0,
  hideLeftPage = false,
  leftPage,
  rightPage,
}: Props = $props();

const MAX_STACK = 12;
const leftLayers = $derived(Math.min(spreadIndex, MAX_STACK));
const rightLayers = $derived(Math.min(Math.max(spreadCount - spreadIndex - 1, 0), MAX_STACK));

/* v8 ignore next 6 */
$effect(() => {
  void flipTrigger;
  if (!flipTrigger) return;
  if (flipTriggerDir === 'next') {
    if (canFlipNext) onFlipNext();
  } else {
    if (canFlipPrev) onFlipPrev();
  }
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
		<div class="page page-left" style={hideLeftPage ? 'visibility:hidden;border-right:none' : ''}>
			{#if leftPage}{@render leftPage()}{/if}
		</div>

		<!-- Right page -->
		<div class="page page-right">
			{#if rightPage}{@render rightPage()}{/if}
		</div>

		<!-- Click zones — only rendered when width > 0 -->
		{#if prevZonePct > 0}
			<button
				type="button"
				class="flip-zone flip-zone-prev"
				style="left: -{overhangRem}rem; width: calc({overhangRem}rem + {prevZonePct}%)"
				aria-label="Previous page"
				disabled={!canFlipPrev}
				onclick={onFlipPrev}
			></button>
		{/if}

		{#if nextZonePct > 0}
			<button
				type="button"
				class="flip-zone flip-zone-next"
				style="right: -{overhangRem}rem; width: calc({overhangRem}rem + {nextZonePct}%)"
				aria-label="Next page"
				disabled={!canFlipNext}
				onclick={onFlipNext}
			></button>
		{/if}
	</div>
</div>

<style>
	.spread-container {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: visible;
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
		container-type: inline-size;
	}

	.page::before {
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
