import type { NormalizedBook } from '$lib/epub/model.js';
// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page';
import DevBookPage from './+page.svelte';

const book: NormalizedBook = {
  id: 'b1',
  title: 'Fixture Book',
  author: 'A. Fixture',
  language: 'en',
  coverImage: null,
  chapters: [
    {
      idx: 0,
      title: 'One',
      text: 'Chapter one begins with EMPHATIC words on parchment.',
      emphasis: [{ start: 24, end: 32, kind: 'em' }],
      // A plate mid-chapter: pagination and rendering must not break on it.
      // (Rendering is TODO — see PageView; plates occupy no characters.)
      images: [{ anchor: 12, href: 'images/plate1.png', alt: 'a plate' }],
    },
    {
      idx: 1,
      title: 'Two',
      text: 'Chapter two continues the tale.',
      emphasis: [],
      images: [],
    },
  ],
};

describe('load', () => {
  it('fetches the normalized book from the R-AT-03 API', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(book), { status: 200 })
    ) as unknown as typeof fetch;
    const result = await load({ fetch: fetchMock, params: { id: 'b1' } } as any);
    expect(result).toEqual({ book });
    expect(fetchMock).toHaveBeenCalledWith('/api/books/b1');
  });

  it('propagates the API error status for unknown books', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 404 }));
    await expect(load({ fetch: fetchMock, params: { id: 'ghost' } } as any)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('dev book route', () => {
  beforeEach(() => {
    // Reduced motion: BookShell.flip() takes its documented fast path (mutate
    // without the 1.2s animation) — the wiring through flip() is still what's
    // exercised. happy-dom computes no layout, so every chapter paginates to a
    // single spread and forward/back flips are exactly the chapter-boundary
    // continuation this route must handle.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  async function renderRoute() {
    const rendered = render(DevBookPage, { props: { data: { book } } as any });
    await tick(); // let the pagination effect run
    return rendered;
  }

  it('renders chapter one as word spans inside the BookShell spread', async () => {
    const { container } = await renderRoute();
    expect(container.querySelector('.book-shell')).not.toBeNull();
    const left = container.querySelector('.spread .page-left');
    expect(left?.textContent).toContain('Chapter one begins');
    // Emphasis flows through to the renderer.
    expect(left?.querySelector('.page-word em')?.textContent).toBe('EMPHATIC');
    // Right page of a single-spread chapter is empty.
    const right = container.querySelector('.spread .page-right .page-text');
    expect(right?.textContent).toBe('');
  });

  it('starts with prev disabled and next enabled', async () => {
    const { container } = await renderRoute();
    const prev = container.querySelector<HTMLButtonElement>('.flip-zone-prev');
    const next = container.querySelector<HTMLButtonElement>('.flip-zone-next');
    expect(prev?.disabled).toBe(true);
    expect(next?.disabled).toBe(false);
  });

  it('flips forward across the chapter boundary through BookShell.flip', async () => {
    const { container } = await renderRoute();
    const next = container.querySelector<HTMLButtonElement>('.flip-zone-next');
    if (!next) throw new Error('no next flip zone');
    await fireEvent.click(next);
    await tick();
    const left = container.querySelector('.spread .page-left');
    expect(left?.textContent).toContain('Chapter two continues');
    // Now at the last spread of the last chapter: next disabled, prev enabled.
    expect(container.querySelector<HTMLButtonElement>('.flip-zone-next')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('.flip-zone-prev')?.disabled).toBe(false);
  });

  it("flips backward to the previous chapter's last spread", async () => {
    const { container } = await renderRoute();
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.flip-zone-next')!);
    await tick();
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.flip-zone-prev')!);
    await tick();
    const left = container.querySelector('.spread .page-left');
    expect(left?.textContent).toContain('Chapter one begins');
  });

  it('flips on arrow keys', async () => {
    const { container } = await renderRoute();
    await fireEvent.keyDown(window, { key: 'ArrowRight' });
    await tick();
    expect(container.querySelector('.spread .page-left')?.textContent).toContain('Chapter two');
    await fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await tick();
    expect(container.querySelector('.spread .page-left')?.textContent).toContain('Chapter one');
  });
});
