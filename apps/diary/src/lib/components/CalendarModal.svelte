<script lang="ts">
import { DAY_LABELS, MONTH_NAMES, getCalendarDays, nextMonth, prevMonth } from '$lib/calendar.js';
import { untrack } from 'svelte';

type Props = {
  entryDates: Set<string>;
  currentDate: string;
  onClose: () => void;
  onNavigate: (date: string) => void;
};

const { entryDates, currentDate, onClose, onNavigate }: Props = $props();

// Snapshot prop at open time — modal intentionally doesn't track prop changes.
const initYear = untrack(() => Number(currentDate.slice(0, 4)));
const initMonth = untrack(() => Number(currentDate.slice(5, 7)) - 1);

let viewYear = $state(initYear);
let viewMonth = $state(initMonth);

const minYear = initYear - 5;
const maxYear = new Date().getUTCFullYear() + 5;
const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);

function days() {
  return getCalendarDays(viewYear, viewMonth);
}

function goPrevMonth() {
  const p = prevMonth(viewYear, viewMonth);
  viewYear = p.year;
  viewMonth = p.month;
}

function goNextMonth() {
  const n = nextMonth(viewYear, viewMonth);
  viewYear = n.year;
  viewMonth = n.month;
}

function setYear(y: number) {
  viewYear = y;
}

function navigateTo(date: string) {
  onClose();
  onNavigate(date);
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') onClose();
}
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- Backdrop -->
<div
  role="dialog"
  aria-modal="true"
  aria-label="Calendar"
  tabindex="-1"
  class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 backdrop-blur-sm"
  onclick={(e) => e.target === e.currentTarget && onClose()}
  onkeydown={handleKeyDown}
>
  <div class="paper rounded-sm shadow-xl w-80 p-6 space-y-4">
    <!-- Month/year navigation header -->
    <div class="flex items-center justify-between">
      <button
        type="button"
        onclick={goPrevMonth}
        class="font-serif text-cream-600 hover:text-ornament-gold px-2 py-1"
        aria-label="Previous month"
      >
        ‹
      </button>

      <div class="flex items-center gap-2">
        <span class="font-serif text-sm text-ink-900">{MONTH_NAMES[viewMonth]}</span>
        <select
          class="font-serif text-sm text-ink-900 bg-transparent border-none focus:outline-none cursor-pointer"
          value={viewYear}
          onchange={(e) => setYear(Number((e.currentTarget as HTMLSelectElement).value))}
          aria-label="Year"
        >
          {#each yearOptions as year}
            <option value={year}>{year}</option>
          {/each}
        </select>
      </div>

      <button
        type="button"
        onclick={goNextMonth}
        class="font-serif text-cream-600 hover:text-ornament-gold px-2 py-1"
        aria-label="Next month"
      >
        ›
      </button>
    </div>

    <!-- Day-of-week labels -->
    <div class="grid grid-cols-7 text-center">
      {#each DAY_LABELS as label}
        <span class="font-serif text-xs text-cream-500 pb-1">{label}</span>
      {/each}
    </div>

    <!-- Calendar grid -->
    <div class="grid grid-cols-7 text-center gap-y-1">
      {#each days() as day}
        {@const hasEntry = entryDates.has(day.date)}
        {@const isCurrent = day.date === currentDate}
        <button
          type="button"
          onclick={() => navigateTo(day.date)}
          class="
            font-serif text-xs rounded-sm w-8 h-8 mx-auto flex items-center justify-center
            {isCurrent ? 'bg-ornament-gold text-cream-50' : ''}
            {hasEntry && !isCurrent ? 'text-ink-900 font-medium underline decoration-ornament-gold decoration-1 underline-offset-2' : ''}
            {!hasEntry && !isCurrent && day.inMonth ? 'text-cream-600 hover:bg-cream-200' : ''}
            {!day.inMonth ? 'text-cream-400 hover:bg-cream-100' : ''}
          "
          aria-label={day.date}
          aria-current={isCurrent ? 'date' : undefined}
        >
          {Number(day.date.slice(8))}
        </button>
      {/each}
    </div>

    <!-- Close -->
    <div class="flex justify-end pt-1">
      <button
        type="button"
        onclick={onClose}
        class="font-serif text-xs text-cream-500 hover:text-cream-700"
      >
        Close
      </button>
    </div>
  </div>
</div>
