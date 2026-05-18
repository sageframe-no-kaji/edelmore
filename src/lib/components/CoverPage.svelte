<script lang="ts">
import type { CoverConfig } from '$lib/covers.js';

type Props = {
  config: CoverConfig;
  username: string;
  diaryTitle?: string;
  showSettings?: boolean;
};

const { config, username, diaryTitle = 'D I A R Y', showSettings = false }: Props = $props();
</script>

<div class="cover">
  <img src="/cover.png" class="cover-photo" alt="" aria-hidden="true" />

  <div class="title-block">
    <p class="name">{username}</p>
    <div class="rule"></div>
    <p class="diary">{diaryTitle}</p>
    {#if showSettings}
      <a href="/settings" class="settings-link" aria-label="Choose cover" onclick={(e) => e.stopPropagation()}>
        <img src="/edelweiss.svg" style="width: clamp(28px, 6cqw, 56px); height: auto" alt="" />
      </a>
    {/if}
  </div>
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
    position: relative;
    z-index: 1;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(0.4rem, 1.5cqw, 1.2rem);
  }

  .name {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: clamp(0.9rem, 5.5cqw, 2.5rem);
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
    width: min(7.5rem, 40cqw);
    height: 1px;
    background: #c8a84b;
    opacity: 0.65;
  }

  .diary {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: clamp(0.5rem, 2.2cqw, 1rem);
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
    margin-top: clamp(0.25rem, 1cqw, 0.75rem);
    opacity: 0.45;
    transition: opacity 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .settings-link:hover {
    opacity: 0.9;
  }
</style>
