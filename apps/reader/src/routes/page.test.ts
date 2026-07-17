// @vitest-environment happy-dom
import type { NormalizedBook } from '$lib/epub/model.js';
import type { ShelfBook } from '$lib/position.js';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

// Two books on the household shelf. happy-dom computes no layout, so every
// chapter paginates to a single spread — chapter INDEX is what these tests
// assert on, which is exactly the state-machine behavior under test.
const alice: NormalizedBook = {
  id: 'alice',
  title: 'Alice',
  author: 'L. Carroll',
  language: 'en',
  coverImage: null,
  chapters: [
    { idx: 0, title: 'I', text: 'Down the rabbit hole.', emphasis: [], images: [] },
    { idx: 1, title: 'II', text: 'The pool of tears runs deep.', emphasis: [], images: [] },
  ],
};
const wind: NormalizedBook = {
  id: 'wind',
  title: 'Wind',
  author: 'K. Grahame',
  language: 'en',
  coverImage: null,
  chapters: [
    { idx: 0, title: 'I', text: 'The River Bank in springtime.', emphasis: [], images: [] },
  ],
};
const booksById: Record<string, NormalizedBook> = { alice, wind };

type Put = {
  id: string;
  body: { person: string; chapterIdx: number; charOffset: number };
  keepalive: boolean;
};

function stubFetch(shelf: ShelfBook[]): { puts: Put[] } {
  const puts: Put[] = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === '/api/books' && !init) {
      return new Response(JSON.stringify({ books: shelf }), { status: 200 });
    }
    const pos = u.match(/^\/api\/books\/(.+)\/position$/);
    if (pos && init?.method === 'PUT') {
      puts.push({
        id: pos[1],
        body: JSON.parse(init.body as string),
        keepalive: init.keepalive ?? false,
      });
      return new Response(null, { status: 200 });
    }
    const one = u.match(/^\/api\/books\/(.+)$/);
    if (one) {
      const b = booksById[one[1]];
      return new Response(b ? JSON.stringify(b) : 'no', { status: b ? 200 : 404 });
    }
    return new Response('no', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { puts };
}

function shelfWith(positions: Record<string, ShelfBook['positions']>): ShelfBook[] {
  return [
    {
      id: 'alice',
      title: 'Alice',
      author: 'L. Carroll',
      cover: null,
      addedBy: 'iona',
      positions: positions.alice ?? [],
    },
    {
      id: 'wind',
      title: 'Wind',
      author: 'K. Grahame',
      cover: null,
      addedBy: 'iona',
      positions: positions.wind ?? [],
    },
  ];
}

const cover = (c: HTMLElement) => c.querySelector('.placeholder-cover span');
const leftText = (c: HTMLElement) => c.querySelector('.spread .page-left')?.textContent ?? '';
const nextZone = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.flip-zone-next');

// Node 25 ships an experimental `localStorage` global that shadows happy-dom's
// and is inert without --localstorage-file; provide a working in-memory Storage
// so the picker's browser-correct localStorage calls behave under test.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  } as Storage;
}

beforeEach(() => {
  // Reduced motion → BookShell.flip takes its synchronous fast path.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('the book route', () => {
  it('shows a plain cover until a person and shelf are loaded, then the active book', async () => {
    localStorage.setItem('reader.person', 'iona');
    stubFetch(shelfWith({}));
    const { container } = render(Page);
    // Default active book is the first on the shelf (Alice), on the closed cover.
    await waitFor(() => expect(cover(container)?.textContent).toBe('Alice'));
    expect(container.querySelector('.book-shell.is-closed')).not.toBeNull();
  });

  it('opens to the title page when the person has no stored position', async () => {
    localStorage.setItem('reader.person', 'iona');
    stubFetch(shelfWith({}));
    const { container } = render(Page);
    await waitFor(() => expect(cover(container)?.textContent).toBe('Alice'));
    await fireEvent.click(nextZone(container)!);
    await waitFor(() =>
      expect(container.querySelector('.title-page h1')?.textContent).toBe('Alice')
    );
  });

  it('restores on open: opens straight into the stored chapter', async () => {
    localStorage.setItem('reader.person', 'iona');
    // iona was last reading Alice, chapter 1.
    stubFetch(
      shelfWith({
        alice: [
          { person: 'iona', chapterIdx: 1, charOffset: 0, updatedAt: '2026-07-15T00:00:00Z' },
        ],
      })
    );
    const { container } = render(Page);
    await waitFor(() => expect(cover(container)?.textContent).toBe('Alice'));
    await fireEvent.click(nextZone(container)!);
    // Lands in chapter 1 (its text), not the title page.
    await waitFor(() => expect(leftText(container)).toContain('The pool of tears'));
  });

  it('saves the reading position after settling on a spread (debounced PUT)', async () => {
    localStorage.setItem('reader.person', 'iona');
    const { puts } = stubFetch(
      shelfWith({
        alice: [
          { person: 'iona', chapterIdx: 1, charOffset: 0, updatedAt: '2026-07-15T00:00:00Z' },
        ],
      })
    );
    const { container } = render(Page);
    await waitFor(() => expect(cover(container)?.textContent).toBe('Alice'));
    await fireEvent.click(nextZone(container)!);
    await waitFor(() => expect(leftText(container)).toContain('The pool of tears'));
    // The debounced save (1s) lands a PUT for the current place.
    await waitFor(
      () => {
        const put = puts.find((p) => p.body.chapterIdx === 1);
        expect(put).toMatchObject({
          id: 'alice',
          body: { person: 'iona', chapterIdx: 1, charOffset: 0 },
          keepalive: false,
        });
      },
      { timeout: 2000 }
    );
  });

  it('flushes the position immediately on pagehide, with keepalive', async () => {
    localStorage.setItem('reader.person', 'iona');
    const { puts } = stubFetch(
      shelfWith({
        alice: [
          { person: 'iona', chapterIdx: 1, charOffset: 0, updatedAt: '2026-07-15T00:00:00Z' },
        ],
      })
    );
    const { container } = render(Page);
    await waitFor(() => expect(cover(container)?.textContent).toBe('Alice'));
    await fireEvent.click(nextZone(container)!);
    await waitFor(() => expect(leftText(container)).toContain('The pool of tears'));
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(() => {
      const put = puts.find((p) => p.keepalive);
      expect(put).toMatchObject({ id: 'alice', body: { chapterIdx: 1 }, keepalive: true });
    });
  });

  it('library selection swaps books and restores THAT book’s position', async () => {
    localStorage.setItem('reader.person', 'iona');
    // iona has a place in both books; Alice is most recent (default restore),
    // Wind holds an older place at chapter 0.
    const { puts } = stubFetch(
      shelfWith({
        alice: [
          { person: 'iona', chapterIdx: 1, charOffset: 0, updatedAt: '2026-07-15T00:00:00Z' },
        ],
        wind: [{ person: 'iona', chapterIdx: 0, charOffset: 0, updatedAt: '2026-07-10T00:00:00Z' }],
      })
    );
    const { container } = render(Page);
    await waitFor(() => expect(cover(container)?.textContent).toBe('Alice'));

    // Open Alice at its restored chapter, then step back to the library.
    await fireEvent.click(nextZone(container)!);
    await waitFor(() => expect(leftText(container)).toContain('The pool of tears'));
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.library-link')!);
    await waitFor(() => expect(container.querySelectorAll('.library-item')).toHaveLength(2));

    // Select Wind — lands on Wind's title page (its own book now active).
    const windItem = [...container.querySelectorAll<HTMLButtonElement>('.library-item')].find((b) =>
      b.textContent?.includes('Wind')
    );
    await fireEvent.click(windItem!);
    await waitFor(() =>
      expect(container.querySelector('.title-page h1')?.textContent).toBe('Wind')
    );

    // Flip title → library → chapters: restores Wind's stored chapter (0).
    await fireEvent.click(nextZone(container)!); // title → library
    await waitFor(() => expect(container.querySelectorAll('.library-item').length).toBe(2));
    await fireEvent.click(nextZone(container)!); // library → chapter (restore)
    await waitFor(() => expect(leftText(container)).toContain('The River Bank'));

    // And a save now attributes to Wind, not Alice.
    await waitFor(
      () => expect(puts.some((p) => p.id === 'wind' && p.body.chapterIdx === 0)).toBe(true),
      { timeout: 2000 }
    );
  });

  it('navigates with the arrow keys', async () => {
    localStorage.setItem('reader.person', 'iona');
    stubFetch(shelfWith({}));
    const { container } = render(Page);
    await waitFor(() => expect(cover(container)?.textContent).toBe('Alice'));
    await fireEvent.keyDown(window, { key: 'ArrowRight' }); // open → title
    await waitFor(() =>
      expect(container.querySelector('.title-page h1')?.textContent).toBe('Alice')
    );
    await fireEvent.keyDown(window, { key: 'ArrowRight' }); // title → library
    await waitFor(() => expect(container.querySelector('.library-page')).not.toBeNull());
    await fireEvent.keyDown(window, { key: 'ArrowLeft' }); // library → title
    await waitFor(() =>
      expect(container.querySelector('.title-page h1')?.textContent).toBe('Alice')
    );
  });

  it('lets a new reader enter their name (no stored person)', async () => {
    stubFetch(shelfWith({}));
    const { container, getByPlaceholderText, getByText } = render(Page);
    // No stored person → the picker prompts for a name; the shelf has not loaded.
    await waitFor(() => expect(container.querySelector('#person-name')).not.toBeNull());
    await fireEvent.input(getByPlaceholderText('Your name'), { target: { value: 'Isla' } });
    await fireEvent.click(getByText('Set'));
    // Naming a reader loads the shelf and its default book.
    await waitFor(() => expect(cover(container)?.textContent).toBe('Alice'));
    expect(localStorage.getItem('reader.person')).toBe('Isla');
  });
});
