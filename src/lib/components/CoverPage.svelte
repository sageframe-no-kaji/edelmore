<script lang="ts">
import type { CoverConfig } from '$lib/covers.js';
import { onMount } from 'svelte';

type Props = {
  config: CoverConfig;
  username: string;
  diaryTitle?: string;
  showSettings?: boolean;
  buttonLabel?: string;
  backCover?: boolean;
  onOpenSettings?: () => void;
};

const {
  config,
  username,
  diaryTitle = 'D I A R Y',
  showSettings = false,
  buttonLabel = 'Open settings',
  backCover = false,
  onOpenSettings,
}: Props = $props();

// biome-ignore lint/style/useConst: $state with bind:this — Svelte assigns via binding
let titleBlockEl: HTMLDivElement | null = $state(null);
// biome-ignore lint/style/useConst: $state with bind:this — Svelte assigns via binding
let nameEl: HTMLParagraphElement | null = $state(null);
let nameScale = $state(1);

function fitCoverName() {
  if (!titleBlockEl || !nameEl) return;
  nameScale = 1;
  requestAnimationFrame(() => {
    if (!titleBlockEl || !nameEl) return;
    const available = titleBlockEl.clientWidth * 0.92;
    const required = nameEl.scrollWidth;
    if (required <= 0) {
      nameScale = 1;
      return;
    }
    nameScale = required > available ? Math.max(0.55, available / required) : 1;
  });
}

$effect(() => {
  void username;
  fitCoverName();
});

onMount(() => {
  fitCoverName();
  const ro = new ResizeObserver(() => fitCoverName());
  if (titleBlockEl) ro.observe(titleBlockEl);
  return () => ro.disconnect();
});
</script>

<div class="cover">
  <img src={backCover ? '/back.png' : '/cover.png'} class="cover-photo" alt="" aria-hidden="true" />

  {#if backCover}
    <a href="https://sageframe.net" class="press-link" target="_blank" rel="noreferrer">Sageframe Press</a>
  {:else}
    <div class="title-block" bind:this={titleBlockEl}>
      <p
        bind:this={nameEl}
        class="name"
        style={`--cover-name-scale: ${nameScale};`}
      >{username}</p>
      <p class="diary">{diaryTitle}</p>
      {#if showSettings}
        <button
          type="button"
          class="settings-link"
          aria-label={buttonLabel}
          onclick={(e) => {
            e.stopPropagation();
            onOpenSettings?.();
          }}
        >
          <img src="/edelweiss.svg" style="width: clamp(40px, 12cqw, 96px); height: auto" alt="" />
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cover {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cover-photo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
    /* No drop-shadow: cover.png has fully rectangular alpha, so any
       drop-shadow produces a visible rectangular outline that doesn't
       match the cover's softer leather edges. The image's own embossing
       and frame carry the visual weight in closed states. */
  }

  .title-block {
    position: absolute;
    left: 54%;
    top: 50%;
    width: 54%;
    transform: translate(-50%, -50%);
    z-index: 1;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(0.6rem, 3cqw, 2rem);
  }

  .name {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: max(1.15rem, calc(8.2cqw * var(--cover-name-scale)));
    font-weight: 500;
    letter-spacing: calc(0.12em * var(--cover-name-scale));
    padding-left: 0;
    text-transform: uppercase;
    margin: 0;
    line-height: 1;
    max-inline-size: 100%;
    white-space: nowrap;
    color: #c8a84b;
    text-shadow:
      0 1px 3px rgba(0, 0, 0, 0.9),
      0 -1px 0 rgba(255, 210, 80, 0.35);
  }

  .diary {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: max(0.8rem, 3.8cqw);
    letter-spacing: 0.24em;
    padding-left: 0;
    margin: 0;
    line-height: 1;
    color: #c8a84b;
    text-shadow:
      0 1px 3px rgba(0, 0, 0, 0.9),
      0 -1px 0 rgba(255, 210, 80, 0.35);
  }

  .settings-link {
    margin-top: clamp(0.4rem, 2cqw, 1.2rem);
    padding-left: 0;
    opacity: 0.7;
    background: transparent;
    border: none;
    padding-top: 0;
    padding-right: 0;
    padding-bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .press-link {
    position: absolute;
    left: 46.5%;
    bottom: 4.5%;
    transform: translateX(-50%);
    font-family: 'EB Garamond', Georgia, serif;
    font-size: clamp(0.72rem, 1.8cqw, 1.14rem);
    color: #c8a84b;
    text-decoration: none;
    letter-spacing: 0.16em;
    white-space: nowrap;
    text-transform: uppercase;
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.8),
      0 -1px 0 rgba(255, 210, 80, 0.2);
    pointer-events: auto;
  }
</style>
