<script lang="ts">
import type { Snippet } from 'svelte';

type Props = {
  onFlipPrev: () => void;
  onFlipNext: () => void;
  canFlipPrev?: boolean;
  canFlipNext?: boolean;
  spreadIndex?: number;
  spreadCount?: number;
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
  prevZonePct = 0,
  nextZonePct = 0,
  overhangRem = 0,
  hideLeftPage = false,
  leftPage,
  rightPage,
}: Props = $props();
</script>

<div class="spread-container">
	<div class="spread">
		<!-- Left page -->
		<div class="page page-left" style={hideLeftPage ? 'visibility:hidden;background:transparent;border-right:none' : ''}>
			{#if leftPage}{@render leftPage()}{/if}
		</div>

		<!-- Right page -->
		<div class="page page-right" style={hideLeftPage ? 'background:transparent' : ''}>
			{#if rightPage}{@render rightPage()}{/if}
		</div>

		<!-- Click zones — only rendered when width > 0 -->
		{#if prevZonePct > 0}
			<button
				type="button"
				class="flip-zone flip-zone-prev"
				style={hideLeftPage
					? `left: calc(50% - ${overhangRem}rem); width: calc(${overhangRem}rem + ${prevZonePct}%);`
					: `left: -${overhangRem}rem; width: calc(${overhangRem}rem + ${prevZonePct}%);`}
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
		z-index: 1;
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
		background: #ede4c2;
		container-type: inline-size;
		box-shadow: inset 0 0 80px rgba(120, 80, 10, 0.07);
	}

	.page::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65 0.55' numOctaves='4' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23p)' opacity='0.13'/%3E%3C/svg%3E");
		background-size: 300px 300px;
		pointer-events: none;
		z-index: 1;
	}

	.page::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse at 50% 0%, rgba(160, 110, 20, 0.07) 0%, transparent 65%),
			radial-gradient(ellipse at 50% 100%, rgba(140, 95, 15, 0.05) 0%, transparent 55%);
		pointer-events: none;
		z-index: 1;
	}

	.page-left {
		border-right: 1px solid #d4c5a0;
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
