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
  // When true the right page is invisible but still occupies its layout space,
  // so the left page stays on the left (used for the back-cover view).
  hideRightPage?: boolean;
  // When true: spread and page backgrounds are transparent so the leather
  // frame (edge.png) shows through the ragged clip-path gaps on endpapers.
  noBackground?: boolean;
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
  hideRightPage = false,
  noBackground = false,
  leftPage,
  rightPage,
}: Props = $props();
</script>

<div class="spread-container">
	<div class="spread" class:is-cover-spread={hideLeftPage || hideRightPage} class:no-background={noBackground}>
		<!-- Left page -->
		<div class="page page-left" style={hideLeftPage ? 'visibility:hidden;background:transparent;border-right:none;box-shadow:none' : ''}>
			{#if leftPage}{@render leftPage()}{/if}
		</div>

		<!-- Right page -->
		<div class="page page-right" style={hideRightPage ? 'visibility:hidden;background:transparent;box-shadow:none' : (hideLeftPage ? 'background:transparent;box-shadow:none' : '')}>
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
		/* Paper color fills the ragged-edge gaps created by clip-path on each page */
		background-color: #e2d8ac;
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.38),
			0 3px 8px  rgba(0, 0, 0, 0.22),
			0 1px 2px  rgba(0, 0, 0, 0.14);
		/* Smooth the open ↔ closed shadow fade. Note: do NOT transition
		   background-color — when a page is hidden (cover/backCover), the
		   paper color would be briefly visible through the hidden half. */
		transition: box-shadow 700ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Cover and back-cover: kill all shadows — transparent left page bleeds the shadow */
	.spread.is-cover-spread {
		background: transparent;
		box-shadow: none;
	}

	/* Endpaper mode: let leather show through clip-path gaps */
	.spread.no-background {
		background: transparent;
		box-shadow: none;
	}

	.spread.no-background .page {
		background: transparent;
	}

	/* Cover/back-cover: full-bleed leather image — strip all page frame effects */
	.spread.is-cover-spread .page {
		background: transparent;
		box-shadow: none;
		filter: none;
		clip-path: none;
		border: none;
	}

	.spread.is-cover-spread .page::before,
	.spread.is-cover-spread .page::after {
		display: none;
	}

	.page {
		flex: 1;
		position: relative;
		overflow: hidden;
		background: #e8ddb5;
		container-type: inline-size;
		box-shadow:
			inset 0 5px 18px rgba(50, 28, 4, 0.22),
			inset 0 -5px 14px rgba(50, 28, 4, 0.16),
			inset 0 -2px 0 0 rgba(110, 70, 15, 0.40);
		/* Drop shadow following the clip-path outline — gives each page perceived lift */
		filter: drop-shadow(0px 2px 5px rgba(0, 0, 0, 0.22));
	}

	.page::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65 0.55' numOctaves='4' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23p)' opacity='0.16'/%3E%3C/svg%3E");
		background-size: 300px 300px;
		pointer-events: none;
		z-index: 1;
	}

	.page::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse at 50% 0%,   rgba(160, 110, 20, 0.09) 0%, transparent 55%),
			radial-gradient(ellipse at 50% 100%, rgba(140,  95, 15, 0.07) 0%, transparent 45%);
		pointer-events: none;
		z-index: 1;
	}

	/* Slightly different ragged vertical on each page — left page irregular at left edge */
	.page-left {
		border-right: 1px solid #c8b888;
		clip-path: polygon(
			0% 0%,
			100% 0%,
			100% 100%,
			0% 100%,
			2px 78%,
			0% 58%,
			3px 38%,
			1px 18%,
			0% 0%
		);
		/* Outer-edge inset + strip simulates page-stack depth on the left side */
		box-shadow:
			inset 10px 0 20px rgba(0, 0, 0, 0.22),
			inset 2px 0 0 0 rgba(0, 0, 0, 0.18);
	}

	/* Right page irregular at right edge */
	.page-right {
		clip-path: polygon(
			0% 0%,
			calc(100% - 1px) 0%,
			100% 20%,
			calc(100% - 2px) 42%,
			100% 62%,
			calc(100% - 3px) 82%,
			100% 100%,
			0% 100%
		);
		/* Outer-edge inset + strip simulates page-stack depth on the right side */
		box-shadow:
			inset -10px 0 20px rgba(0, 0, 0, 0.22),
			inset -2px 0 0 0 rgba(0, 0, 0, 0.18);
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
