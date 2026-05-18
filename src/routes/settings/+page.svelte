<script lang="ts">
import { enhance } from '$app/forms';
import { untrack } from 'svelte';
import type { PageData } from './$types';

const { data }: { data: PageData } = $props();

const FONT_STEPS = [2.4, 2.8, 3.2, 3.6, 4.0, 4.4];

// Optimistic local state — initialized once from server, updated on each step click.
// biome-ignore lint/style/useConst: mutated via onsubmit handlers in template
let currentSize = $state(untrack(() => data.font_size));
const prevSize = $derived(FONT_STEPS[FONT_STEPS.indexOf(currentSize) - 1] ?? null);
const nextSize = $derived(FONT_STEPS[FONT_STEPS.indexOf(currentSize) + 1] ?? null);
</script>

<div class="settings-shell">
  <header class="settings-header">
    <a href="/" class="back-link" aria-label="Back to diary">← Back</a>
    <h1 class="settings-title">Settings</h1>
  </header>

  <div class="cards">
    <!-- Display name -->
    <section class="card">
      <h2 class="card-title">Display name</h2>
      <form method="POST" action="?/updateName" use:enhance>
        <div class="field-row">
          <input
            type="text"
            name="username"
            value={data.username}
            maxlength="40"
            required
            class="text-input"
          />
          <button type="submit" class="save-btn">Save</button>
        </div>
      </form>
    </section>

    <!-- Diary title -->
    <section class="card">
      <h2 class="card-title">Diary title</h2>
      <p class="card-hint">Appears on the cover below your name</p>
      <form method="POST" action="?/updateDiaryTitle" use:enhance>
        <div class="field-row">
          <input
            type="text"
            name="diary_title"
            value={data.diary_title}
            maxlength="40"
            required
            class="text-input"
          />
          <button type="submit" class="save-btn">Save</button>
        </div>
      </form>
    </section>

    <!-- Text size -->
    <section class="card">
      <h2 class="card-title">Text size</h2>
      <div class="size-row">
        <form method="POST" action="?/updateFontSize" use:enhance onsubmit={() => { if (prevSize) currentSize = prevSize; }}>
          <input type="hidden" name="font_size" value={prevSize ?? currentSize} />
          <button type="submit" class="step-btn" disabled={prevSize === null} aria-label="Decrease text size">−</button>
        </form>
        <span class="size-label">
          {FONT_STEPS.indexOf(currentSize) + 1} / {FONT_STEPS.length}
        </span>
        <form method="POST" action="?/updateFontSize" use:enhance onsubmit={() => { if (nextSize) currentSize = nextSize; }}>
          <input type="hidden" name="font_size" value={nextSize ?? currentSize} />
          <button type="submit" class="step-btn" disabled={nextSize === null} aria-label="Increase text size">+</button>
        </form>
      </div>
    </section>

    <!-- PIN -->
    <section class="card">
      <h2 class="card-title">Change PIN</h2>
      <p class="card-hint">4 digits — no current PIN required</p>
      <form method="POST" action="?/updatePin" use:enhance>
        <div class="pin-fields">
          <input
            type="password"
            name="pin"
            inputmode="numeric"
            pattern="\d{4}"
            maxlength="4"
            placeholder="New PIN"
            required
            class="text-input pin-input"
          />
          <input
            type="password"
            name="confirm"
            inputmode="numeric"
            pattern="\d{4}"
            maxlength="4"
            placeholder="Confirm PIN"
            required
            class="text-input pin-input"
          />
          <button type="submit" class="save-btn">Set</button>
        </div>
      </form>
    </section>
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

  .cards {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 480px;
  }

  .card {
    background: #352a1a;
    border: 1px solid #4a3a22;
    border-radius: 4px;
    padding: 1.25rem 1.5rem;
  }

  .card-title {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.8rem;
    font-weight: 400;
    color: #c4a96d;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin: 0 0 0.75rem;
  }

  .card-hint {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.8rem;
    color: #7a6a50;
    margin: -0.25rem 0 0.75rem;
  }

  .field-row {
    display: flex;
    gap: 0.5rem;
  }

  .text-input {
    flex: 1;
    background: #1e1610;
    border: 1px solid #4a3a22;
    border-radius: 2px;
    color: #e8dcc0;
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 1rem;
    padding: 0.4rem 0.75rem;
    outline: none;
    transition: border-color 0.15s;
  }

  .text-input:focus {
    border-color: #c4a96d;
  }

  .save-btn {
    background: transparent;
    border: 1px solid #c4a96d;
    border-radius: 2px;
    color: #c4a96d;
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.9rem;
    letter-spacing: 0.1em;
    padding: 0.4rem 1rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .save-btn:hover {
    background: #c4a96d;
    color: #1e1610;
  }

  .size-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .step-btn {
    background: transparent;
    border: 1px solid #c4a96d;
    border-radius: 2px;
    color: #c4a96d;
    font-size: 1.25rem;
    line-height: 1;
    width: 2.25rem;
    height: 2.25rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step-btn:hover:not(:disabled) {
    background: #c4a96d;
    color: #1e1610;
  }

  .step-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .size-label {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 1rem;
    color: #e8dcc0;
    min-width: 4rem;
    text-align: center;
  }

  .pin-fields {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .pin-input {
    flex: 1;
    min-width: 100px;
  }
</style>
