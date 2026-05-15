<script lang="ts">
import type { CoverConfig } from '$lib/covers.js';

type Props = {
  config: CoverConfig;
  username: string;
  showSettings?: boolean;
};

const { config, username, showSettings = false }: Props = $props();

const FLOWER_POSITIONS: [number, number][] = [
  [150, 80],
  [231, 114],
  [265, 195],
  [231, 276],
  [150, 310],
  [69, 276],
  [35, 195],
  [69, 114],
];
const PETAL_ROTATIONS = [0, 60, 120, 180, 240, 300];
</script>

<div
  class="cover"
  style="background-color: {config.palette.background}; color: {config.palette.text};"
>
  <!-- Texture layer -->
  {#if config.texture !== 'none'}
    <svg
      class="abs-fill"
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <defs>
        {#if config.texture === 'linen'}
          <pattern
            id="linen-{config.id}"
            patternUnits="userSpaceOnUse"
            width="4"
            height="4"
          >
            <line
              x1="0"
              y1="0"
              x2="4"
              y2="4"
              stroke={config.palette.accent}
              stroke-width="0.35"
              opacity="0.25"
            />
            <line
              x1="4"
              y1="0"
              x2="0"
              y2="4"
              stroke={config.palette.accent}
              stroke-width="0.35"
              opacity="0.15"
            />
          </pattern>
        {:else}
          <filter id="noise-{config.id}" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={config.texture === 'cotton' ? '0.45' : '0.65'}
              numOctaves="3"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        {/if}
      </defs>
      {#if config.texture === 'linen'}
        <rect width="100%" height="100%" fill="url(#linen-{config.id})" />
      {:else}
        <rect width="100%" height="100%" filter="url(#noise-{config.id})" opacity="0.07" />
      {/if}
    </svg>
  {/if}

  <!-- Ornament layer -->
  <svg
    class="abs-fill"
    viewBox="0 0 300 400"
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {#if config.ornament === 'simple-border'}
      <rect x="18" y="18" width="264" height="364" fill="none" stroke={config.palette.accent} stroke-width="2" />
      <rect x="25" y="25" width="250" height="350" fill="none" stroke={config.palette.accent} stroke-width="0.75" />
      <polygon points="18,10 26,18 18,26 10,18" fill={config.palette.accent} />
      <polygon points="282,10 290,18 282,26 274,18" fill={config.palette.accent} />
      <polygon points="18,390 26,382 18,374 10,382" fill={config.palette.accent} />
      <polygon points="282,390 290,382 282,374 274,382" fill={config.palette.accent} />
      <circle cx="150" cy="18" r="2.5" fill={config.palette.accent} />
      <circle cx="150" cy="382" r="2.5" fill={config.palette.accent} />
      <circle cx="18" cy="200" r="2.5" fill={config.palette.accent} />
      <circle cx="282" cy="200" r="2.5" fill={config.palette.accent} />

    {:else if config.ornament === 'corner-flourish'}
      <!-- Top-left -->
      <path d="M 50,22 L 22,22 L 22,50" fill="none" stroke={config.palette.accent} stroke-width="2" stroke-linecap="round" />
      <path d="M 22,50 Q 22,65 37,65" fill="none" stroke={config.palette.accent} stroke-width="1" stroke-linecap="round" />
      <circle cx="50" cy="22" r="2.5" fill={config.palette.accent} />
      <!-- Top-right -->
      <path d="M 250,22 L 278,22 L 278,50" fill="none" stroke={config.palette.accent} stroke-width="2" stroke-linecap="round" />
      <path d="M 278,50 Q 278,65 263,65" fill="none" stroke={config.palette.accent} stroke-width="1" stroke-linecap="round" />
      <circle cx="250" cy="22" r="2.5" fill={config.palette.accent} />
      <!-- Bottom-left -->
      <path d="M 50,378 L 22,378 L 22,350" fill="none" stroke={config.palette.accent} stroke-width="2" stroke-linecap="round" />
      <path d="M 22,350 Q 22,335 37,335" fill="none" stroke={config.palette.accent} stroke-width="1" stroke-linecap="round" />
      <circle cx="50" cy="378" r="2.5" fill={config.palette.accent} />
      <!-- Bottom-right -->
      <path d="M 250,378 L 278,378 L 278,350" fill="none" stroke={config.palette.accent} stroke-width="2" stroke-linecap="round" />
      <path d="M 278,350 Q 278,335 263,335" fill="none" stroke={config.palette.accent} stroke-width="1" stroke-linecap="round" />
      <circle cx="250" cy="378" r="2.5" fill={config.palette.accent} />

    {:else if config.ornament === 'floral-wreath'}
      {#each FLOWER_POSITIONS as [fx, fy]}
        <g transform="translate({fx},{fy})">
          {#each PETAL_ROTATIONS as rot}
            <ellipse
              rx="2.5"
              ry="6"
              fill={config.palette.accent}
              opacity="0.72"
              transform="rotate({rot})"
            />
          {/each}
          <circle r="3" fill={config.palette.accent} />
        </g>
      {/each}

    {:else if config.ornament === 'vine-border'}
      <!-- Top vine -->
      <path d="M 28,38 Q 62,22 90,38 Q 118,54 150,38 Q 182,22 210,38 Q 238,54 272,38" fill="none" stroke={config.palette.accent} stroke-width="1.3" stroke-linecap="round" />
      <!-- Bottom vine -->
      <path d="M 28,362 Q 62,378 90,362 Q 118,346 150,362 Q 182,378 210,362 Q 238,346 272,362" fill="none" stroke={config.palette.accent} stroke-width="1.3" stroke-linecap="round" />
      <!-- Left vine -->
      <path d="M 28,38 Q 12,80 28,110 Q 44,140 28,170 Q 12,200 28,230 Q 44,260 28,290 Q 12,320 28,362" fill="none" stroke={config.palette.accent} stroke-width="1.3" stroke-linecap="round" />
      <!-- Right vine -->
      <path d="M 272,38 Q 288,80 272,110 Q 256,140 272,170 Q 288,200 272,230 Q 256,260 272,290 Q 288,320 272,362" fill="none" stroke={config.palette.accent} stroke-width="1.3" stroke-linecap="round" />
      <!-- Leaf diamonds at wave peaks -->
      <polygon points="150,31 155,38 150,45 145,38" fill={config.palette.accent} opacity="0.7" />
      <polygon points="90,31 95,38 90,45 85,38" fill={config.palette.accent} opacity="0.5" />
      <polygon points="210,31 215,38 210,45 205,38" fill={config.palette.accent} opacity="0.5" />
      <polygon points="150,355 155,362 150,369 145,362" fill={config.palette.accent} opacity="0.7" />
      <polygon points="90,355 95,362 90,369 85,362" fill={config.palette.accent} opacity="0.5" />
      <polygon points="210,355 215,362 210,369 205,362" fill={config.palette.accent} opacity="0.5" />
    {/if}
  </svg>

  <!-- Title text -->
  <div class="cover-text">
    <p class="cover-name" style="color: {config.palette.text};">{username}</p>
    <p class="cover-subhead" style="color: {config.palette.subtext};">Diary</p>
    {#if showSettings}
      <a href="/settings" class="cover-settings" aria-label="Choose a cover">
        <img src="/edelweiss.svg" width="26" height="26" alt="" />
      </a>
    {/if}
  </div>
</div>

<style>
  .cover {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .abs-fill {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .cover-text {
    position: relative;
    z-index: 1;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .cover-name {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 2rem;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin: 0;
  }

  .cover-subhead {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.85rem;
    font-style: italic;
    letter-spacing: 0.35em;
    text-transform: uppercase;
    margin: 0;
  }

  .cover-settings {
    margin-top: 1rem;
    opacity: 0.55;
    transition: opacity 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cover-settings:hover {
    opacity: 1;
  }
</style>
