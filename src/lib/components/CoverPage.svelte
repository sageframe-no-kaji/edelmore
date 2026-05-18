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
        <img src="/edelweiss.svg" width="72" height="72" alt="" />
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

  .cover-photo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  .title-block {
    position: relative;
    z-index: 1;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }

  .name {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: clamp(3rem, 9.6vw, 6rem);
    font-weight: 500;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    margin: 0;
    line-height: 1;
    color: #c8a84b;
    text-shadow:
      0 1px 3px rgba(0, 0, 0, 0.9),
      0 -1px 0 rgba(255, 210, 80, 0.35);
  }

  .rule {
    width: 7.5rem;
    height: 1px;
    background: #c8a84b;
    opacity: 0.65;
  }

  .diary {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: clamp(1.5rem, 3.9vw, 2.25rem);
    letter-spacing: 0.55em;
    margin: 0;
    line-height: 1;
    color: #c8a84b;
    text-shadow:
      0 1px 3px rgba(0, 0, 0, 0.9),
      0 -1px 0 rgba(255, 210, 80, 0.35);
  }

  .settings-link {
    margin-top: 0.75rem;
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
