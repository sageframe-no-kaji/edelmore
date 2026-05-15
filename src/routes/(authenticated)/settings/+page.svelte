<script lang="ts">
import CoverPage from '$lib/components/CoverPage.svelte';
import type { PageData } from './$types';

const { data }: { data: PageData } = $props();
</script>

<div class="settings-shell">
  <header class="settings-header">
    <a href="/" class="back-link" aria-label="Back to diary">← Back</a>
    <h1 class="settings-title">Choose a cover</h1>
  </header>

  <div class="covers-grid">
    {#each data.covers as cover (cover.id)}
      <form method="POST" action="?/select">
        <input type="hidden" name="cover_id" value={cover.id} />
        <button
          type="submit"
          class="cover-btn"
          class:cover-btn--selected={cover.id === data.coverId}
          title={cover.label}
          aria-label="Select {cover.label}"
          aria-pressed={cover.id === data.coverId}
        >
          <div class="cover-thumb">
            <CoverPage config={cover} username={data.username} showSettings={false} />
          </div>
          <span class="cover-label">{cover.label}</span>
        </button>
      </form>
    {/each}
  </div>
</div>

<style>
  .settings-shell {
    min-height: 100vh;
    background: #2a2018;
    display: flex;
    flex-direction: column;
    padding: 2rem 1.5rem;
  }

  .settings-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .back-link {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.9rem;
    color: #c4a96d;
    text-decoration: none;
    letter-spacing: 0.05em;
    opacity: 0.8;
    transition: opacity 0.15s;
  }

  .back-link:hover {
    opacity: 1;
  }

  .settings-title {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 1.25rem;
    font-weight: 400;
    color: #e8dcc0;
    letter-spacing: 0.15em;
    margin: 0;
  }

  .covers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 1.25rem;
  }

  .cover-btn {
    all: unset;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    border-radius: 2px;
    transition: transform 0.15s;
  }

  .cover-btn:hover {
    transform: translateY(-2px);
  }

  .cover-thumb {
    width: 100%;
    aspect-ratio: 3 / 4;
    border-radius: 2px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    outline: 2px solid transparent;
    outline-offset: 3px;
    transition: outline-color 0.15s, box-shadow 0.15s;
  }

  .cover-btn--selected .cover-thumb {
    outline-color: #c4a96d;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }

  .cover-label {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.75rem;
    color: #a89070;
    letter-spacing: 0.08em;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .cover-btn--selected .cover-label {
    color: #c4a96d;
  }
</style>
