<script lang="ts">
import BookSpread from '$lib/components/BookSpread.svelte';
import { untrack } from 'svelte';
import type { PageData } from './$types';

const { data }: { data: PageData } = $props();

let content = $state(untrack(() => data.content));
let saved = $state(false);

$effect(() => {
  const timer = setTimeout(async () => {
    await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: data.date, content }),
    });
    saved = true;
    setTimeout(() => {
      saved = false;
    }, 1000);
  }, 1500);
  return () => clearTimeout(timer);
});

function handleContentChange(value: string) {
  content = value;
}
</script>

<BookSpread
  {content}
  date={data.date}
  displayDate={data.displayDate}
  prevDate={data.prevDate}
  prevContent={data.prevContent}
  prevDisplayDate={data.prevDisplayDate}
  nextDate={data.nextDate}
  {saved}
  onContentChange={handleContentChange}
/>
