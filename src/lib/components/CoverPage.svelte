<script lang="ts">
import type { CoverConfig } from '$lib/covers.js';

type Props = {
  config: CoverConfig;
  username: string;
  diaryTitle?: string;
  showSettings?: boolean;
  backCover?: boolean;
  onOpenSettings?: () => void;
};

const {
  config,
  username,
  diaryTitle = 'D I A R Y',
  showSettings = false,
  backCover = false,
  onOpenSettings,
}: Props = $props();
</script>

<div class="cover">
  <img src={backCover ? '/back.png' : '/cover.png'} class="cover-photo" alt="" aria-hidden="true" />

  {#if backCover}
    <a href="https://sageframe.net" class="press-link" target="_blank" rel="noreferrer">Sageframe Press</a>
  {:else}
    <div class="title-block">
      <p class="name">{username}</p>
      <div class="rule"></div>
      <p class="diary">{diaryTitle}</p>
      {#if showSettings}
        <button
          type="button"
          class="settings-link"
          aria-label="Open settings"
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
  }

  .title-block {
    position: absolute;
    inset: 17% 14% 18% 14%;
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
    font-size: clamp(1.5rem, 11cqw, 5rem);
    font-weight: 500;
    letter-spacing: 0.28em;
    padding-left: 0.28em;
    text-transform: uppercase;
    margin: 0;
    line-height: 1;
    color: #c8a84b;
    text-shadow:
      0 1px 3px rgba(0, 0, 0, 0.9),
      0 -1px 0 rgba(255, 210, 80, 0.35);
  }

  .rule {
    width: min(12rem, 60cqw);
    height: 1px;
    background: #c8a84b;
    opacity: 0.65;
  }

  .diary {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: clamp(0.8rem, 4.4cqw, 2rem);
    letter-spacing: 0.55em;
    padding-left: 0.55em;
    margin: 0;
    line-height: 1;
    color: #c8a84b;
    text-shadow:
      0 1px 3px rgba(0, 0, 0, 0.9),
      0 -1px 0 rgba(255, 210, 80, 0.35);
  }

  .settings-link {
    margin-top: clamp(0.4rem, 2cqw, 1.2rem);
    opacity: 0.7;
    background: transparent;
    border: none;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .press-link {
    position: absolute;
    left: 50%;
    bottom: 4.5%;
    transform: translateX(-50%);
    font-family: 'EB Garamond', Georgia, serif;
    font-size: clamp(1.2rem, 3cqw, 1.9rem);
    color: #c8a84b;
    text-decoration: none;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.8),
      0 -1px 0 rgba(255, 210, 80, 0.2);
    pointer-events: auto;
  }
</style>
