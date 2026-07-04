<script lang="ts">
import { BookShell, Spread } from '@edelmore/book';

// Placeholder cover only — cover art, transforms, and all book UI are later,
// practitioner-supervised work. The book never opens in this slice, so the
// flip callbacks are inert.
const noop = () => {};
</script>

<svelte:head>
  <title>Edelmore</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center">
  <div class="w-full max-w-5xl">
    <BookShell progress={0} isClosed isCoverState>
      <Spread onFlipPrev={noop} onFlipNext={noop} hideLeftPage noBackground>
        {#snippet rightPage()}
          <div class="placeholder-cover">
            <span>Edelmore</span>
          </div>
        {/snippet}
      </Spread>
    </BookShell>
  </div>
</main>

<style>
  /* Plain colored stand-in for the front cover — no design work here. */
  .placeholder-cover {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #5a3d2b;
    border-radius: 4px 8px 8px 4px;
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.45),
      0 6px 18px rgba(0, 0, 0, 0.3);
    color: #e8ddb5;
    font-family: 'EB Garamond', serif;
    font-size: 8cqw;
  }
</style>
