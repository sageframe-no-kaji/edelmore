<script lang="ts">
/**
 * Minimal identity picker — a name, kept in localStorage under `reader.person`.
 *
 * PROVISIONAL. Decision D (parent note) settles that the library is a house,
 * not accounts: a person name is attribution, never a credential, and the exact
 * identity/curation-rights mechanic ("don't break the magic") is an OPEN Kamae
 * decision. This stub does the least that unblocks position persistence: it
 * names who is reading so positions attribute and restore. No auth, no server
 * round-trip, no people administration — all of that awaits that decision.
 *
 * Visuals are placeholder parchment-and-text, like every surface in this slice.
 */
import { onMount } from 'svelte';

const STORAGE_KEY = 'reader.person';

const { person, onPerson }: { person: string | null; onPerson: (name: string | null) => void } =
  $props();

let draft = $state('');
let editing = $state(false);

onMount(() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) onPerson(stored);
  else editing = true;
});

function commit(): void {
  const name = draft.trim();
  if (!name) return;
  localStorage.setItem(STORAGE_KEY, name);
  onPerson(name);
  draft = '';
  editing = false;
}

function startEditing(): void {
  draft = person ?? '';
  editing = true;
}
</script>

<div class="person-picker">
  {#if editing}
    <label class="person-label" for="person-name">Who's reading?</label>
    <input
      id="person-name"
      type="text"
      bind:value={draft}
      maxlength="40"
      placeholder="Your name"
      onkeydown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
    <button type="button" onclick={commit} disabled={draft.trim().length === 0}>Set</button>
  {:else}
    <span class="person-current">Reading as {person}</span>
    <button type="button" class="person-change" onclick={startEditing}>Change</button>
  {/if}
</div>

<style>
  /* Placeholder only — plain legible controls, no design work here. */
  .person-picker {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 0.85rem;
    color: #3b2f1e;
  }

  input {
    font: inherit;
    padding: 0.15rem 0.4rem;
    border: 1px solid #c8b888;
    background: transparent;
  }

  button {
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 1px solid #c8b888;
    padding: 0.15rem 0.5rem;
  }

  button:disabled {
    cursor: default;
    opacity: 0.4;
  }
</style>
