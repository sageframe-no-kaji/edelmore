<script lang="ts">
/**
 * Identity picker — chooses a person from the shared household roster
 * (`GET`/`POST /api/people`, ho-12 Decision 4), or adds someone new. *Which*
 * person you are stays device-local: `localStorage['reader.person']`, same
 * as before this ho.
 *
 * A person name is attribution, never a credential — both the roster fetch
 * and the add-person POST degrade gracefully (no crash, no block) if the
 * server is unreachable: the picker falls back to a local-only commit.
 *
 * PROVISIONAL. Visuals are placeholder parchment-and-text, like every
 * surface in this slice — the designed roster/shelf UI is Phase 4.
 */
import { onMount } from 'svelte';

const STORAGE_KEY = 'reader.person';

const { person, onPerson }: { person: string | null; onPerson: (name: string | null) => void } =
  $props();

interface RosterPerson {
  id: number;
  name: string;
}

let draft = $state('');
let editing = $state(false);
let roster = $state<RosterPerson[]>([]);

onMount(() => {
  void loadRoster();
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) onPerson(stored);
  else editing = true;
});

/** The roster is a convenience list, not a gate — a failed fetch just leaves
 *  it empty and the free-text "someone new" field still works. */
async function loadRoster(): Promise<void> {
  try {
    const res = await fetch('/api/people');
    if (!res.ok) return;
    const body = (await res.json()) as { people: RosterPerson[] };
    roster = body.people;
  } catch {
    // stays empty
  }
}

function choose(name: string): void {
  localStorage.setItem(STORAGE_KEY, name);
  onPerson(name);
  draft = '';
  editing = false;
}

/** Free-text "someone new" path: POSTs to the shared roster, then selects
 *  the server's canonical name (casing/whitespace dedup is the server's —
 *  `people.name UNIQUE` — this only trims before sending). A failed POST
 *  still lets the reader proceed locally; the roster catches up next load. */
async function commit(): Promise<void> {
  const name = draft.trim();
  if (!name) return;
  try {
    const res = await fetch('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const body = (await res.json()) as { name: string };
      choose(body.name);
      return;
    }
  } catch {
    // fall through — commit locally below
  }
  choose(name);
}

function startEditing(): void {
  draft = person ?? '';
  editing = true;
}
</script>

<div class="person-picker">
  {#if editing}
    <label class="person-label" for="person-name">Who's reading?</label>
    {#if roster.length > 0}
      <div class="person-roster">
        {#each roster as p (p.id)}
          <button type="button" class="person-roster-item" onclick={() => choose(p.name)}>
            {p.name}
          </button>
        {/each}
      </div>
    {/if}
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

  .person-roster {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .person-roster-item {
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 1px solid #c8b888;
    padding: 0.1rem 0.4rem;
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
