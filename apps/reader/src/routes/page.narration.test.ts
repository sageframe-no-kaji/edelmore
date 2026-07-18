// @vitest-environment happy-dom
import type { NormalizedBook } from '$lib/epub/model.js';
import type { ShelfBook } from '$lib/position.js';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Route-level narration wiring on the REAL book route, exercised with a MOCKED
// engine — the same technique the dev route uses (routes/dev/book/[id]/
// page.narration.test.ts). happy-dom computes no layout, so real pagination
// collapses every chapter to a single spread and an in-chapter boundary can
// never arise from real audio; mocking the engine lets us fire its callbacks
// (onWordHighlight, onPageBoundaryReached) directly and observe the route's
// response through the state machine: highlight in PageView, flip via
// BookShell.flip, the manual-flip-stops rule, book-switch stops, and that the
// debounced position save still fires on an engine-driven flip.

type EngineConfig = {
  fetchSpeak: unknown;
  onPhaseChange?: (p: string) => void;
  onWordHighlight?: (i: number) => void;
  onPageBoundaryReached?: () => void;
};

let capturedConfig: EngineConfig;
const engineMock = {
  play: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  setRate: vi.fn(),
  setPageEndOffset: vi.fn(),
  getPhase: vi.fn(() => 'idle'),
  getRate: vi.fn(() => 1.0),
};

vi.mock('$lib/narration-engine.js', () => ({
  createNarrationEngine: (config: EngineConfig) => {
    capturedConfig = config;
    return engineMock;
  },
  RATE_MIN: 0.5,
  RATE_MAX: 1.6,
}));

import Page from './+page.svelte';

// Two books; Alice has two chapters so an engine-driven flip crosses from
// chapter 0 into chapter 1 (single-spread chapters under happy-dom).
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
const prevZone = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.flip-zone-prev');
const controls = (c: HTMLElement) => c.querySelector('.dev-narration-controls');
const primary = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('[data-role="primary"]');

// Node 25 ships an experimental `localStorage` global that shadows happy-dom's
// and is inert; provide a working in-memory Storage (as page.test.ts does).
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
  engineMock.play.mockClear();
  engineMock.stop.mockClear();
  engineMock.getPhase.mockReturnValue('idle');
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

// Restore-on-open: with a stored position, one flip from the closed cover lands
// straight in the stored chapter (mirrors the book route's own restore test).
async function openIntoAliceChapter(container: HTMLElement, chapterIdx = 0): Promise<void> {
  await waitFor(() => expect(cover(container)?.textContent).toBe('Alice'));
  await fireEvent.click(nextZone(container)!);
  const wanted = alice.chapters[chapterIdx].text;
  await waitFor(() => expect(leftText(container)).toContain(wanted.slice(0, 12)));
}

describe('the book route — narration wiring', () => {
  it('renders NarrationControls only on chapter spreads', async () => {
    localStorage.setItem('reader.person', 'iona');
    stubFetch(shelfWith({})); // no stored position → walk cover → title → library → chapter
    const { container } = render(Page);

    await waitFor(() => expect(cover(container)?.textContent).toBe('Alice'));
    expect(controls(container)).toBeNull(); // closed cover

    await fireEvent.click(nextZone(container)!); // → title
    await waitFor(() =>
      expect(container.querySelector('.title-page h1')?.textContent).toBe('Alice')
    );
    expect(controls(container)).toBeNull();

    await fireEvent.click(nextZone(container)!); // → library
    await waitFor(() => expect(container.querySelector('.library-page')).not.toBeNull());
    expect(controls(container)).toBeNull();

    await fireEvent.click(nextZone(container)!); // → first chapter
    await waitFor(() => expect(leftText(container)).toContain('Down the rabbit'));
    expect(controls(container)).not.toBeNull();
  });

  it('Play narrates the current chapter from the current spread start', async () => {
    localStorage.setItem('reader.person', 'iona');
    stubFetch(
      shelfWith({
        alice: [
          { person: 'iona', chapterIdx: 0, charOffset: 0, updatedAt: '2026-07-15T00:00:00Z' },
        ],
      })
    );
    const { container } = render(Page);
    await openIntoAliceChapter(container, 0);

    expect(primary(container)?.textContent?.trim()).toBe('Play');
    await fireEvent.click(primary(container)!);
    expect(engineMock.play).toHaveBeenCalledTimes(1);
    // Whole-chapter model: full chapter text, from the current spread start (0).
    expect(engineMock.play).toHaveBeenCalledWith(alice.chapters[0].text, 0);
  });

  it('onWordHighlight drives PageView’s currentCharIndex on both pages', async () => {
    localStorage.setItem('reader.person', 'iona');
    stubFetch(
      shelfWith({
        alice: [
          { person: 'iona', chapterIdx: 0, charOffset: 0, updatedAt: '2026-07-15T00:00:00Z' },
        ],
      })
    );
    const { container } = render(Page);
    await openIntoAliceChapter(container, 0);
    expect(container.querySelector('.page-word.is-current')).toBeNull();

    capturedConfig.onWordHighlight?.(0); // char 0 → the word "Down"
    await tick();

    const highlighted = container.querySelector('.page-word.is-current');
    expect(highlighted).not.toBeNull();
    expect(highlighted?.textContent).toBe('Down');
  });

  it('onPageBoundaryReached flips forward via BookShell.flip without stopping narration', async () => {
    localStorage.setItem('reader.person', 'iona');
    const { puts } = stubFetch(
      shelfWith({
        alice: [
          { person: 'iona', chapterIdx: 0, charOffset: 0, updatedAt: '2026-07-15T00:00:00Z' },
        ],
      })
    );
    const { container } = render(Page);
    await openIntoAliceChapter(container, 0);
    expect(leftText(container)).toContain('Down the rabbit');

    capturedConfig.onPageBoundaryReached?.();
    await tick();

    // Single-spread chapters → the boundary flip crosses into chapter two.
    await waitFor(() => expect(leftText(container)).toContain('The pool of tears'));
    // The engine-initiated flip must NOT stop the engine.
    expect(engineMock.stop).not.toHaveBeenCalled();
    // Position persistence continues through the narrated flip.
    await waitFor(
      () => expect(puts.some((p) => p.id === 'alice' && p.body.chapterIdx === 1)).toBe(true),
      { timeout: 2000 }
    );
  });

  it('a manual forward flip stops narration', async () => {
    engineMock.getPhase.mockReturnValue('playing'); // narration is live
    localStorage.setItem('reader.person', 'iona');
    stubFetch(
      shelfWith({
        alice: [
          { person: 'iona', chapterIdx: 0, charOffset: 0, updatedAt: '2026-07-15T00:00:00Z' },
        ],
      })
    );
    const { container } = render(Page);
    await openIntoAliceChapter(container, 0);
    engineMock.stop.mockClear(); // ignore any stop from the restore-open flip

    await fireEvent.click(nextZone(container)!);
    await tick();

    expect(engineMock.stop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(leftText(container)).toContain('The pool of tears'));
  });

  it('a manual backward flip stops narration', async () => {
    engineMock.getPhase.mockReturnValue('playing');
    localStorage.setItem('reader.person', 'iona');
    stubFetch(
      shelfWith({
        alice: [
          { person: 'iona', chapterIdx: 1, charOffset: 0, updatedAt: '2026-07-15T00:00:00Z' },
        ],
      })
    );
    const { container } = render(Page);
    await openIntoAliceChapter(container, 1);
    engineMock.stop.mockClear();

    await fireEvent.click(prevZone(container)!);
    await tick();

    expect(engineMock.stop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(leftText(container)).toContain('Down the rabbit'));
  });

  it('switching books from the library stops narration', async () => {
    engineMock.getPhase.mockReturnValue('playing');
    localStorage.setItem('reader.person', 'iona');
    stubFetch(
      shelfWith({
        alice: [
          { person: 'iona', chapterIdx: 0, charOffset: 0, updatedAt: '2026-07-15T00:00:00Z' },
        ],
      })
    );
    const { container } = render(Page);
    await openIntoAliceChapter(container, 0);

    // Step back to the library (the provisional Library control), then pick Wind.
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.library-link')!);
    await waitFor(() => expect(container.querySelectorAll('.library-item')).toHaveLength(2));
    engineMock.stop.mockClear();

    const windItem = [...container.querySelectorAll<HTMLButtonElement>('.library-item')].find((b) =>
      b.textContent?.includes('Wind')
    );
    await fireEvent.click(windItem!);
    await waitFor(() =>
      expect(container.querySelector('.title-page h1')?.textContent).toBe('Wind')
    );

    // Selecting a different book stopped the outgoing book's narration.
    expect(engineMock.stop).toHaveBeenCalled();
  });
});

describe('voice resting note', () => {
  it('appears when a play attempt dies before audio (loading → idle) and clears on the next attempt', async () => {
    localStorage.setItem('reader.person', 'iona');
    stubFetch(
      shelfWith({
        alice: [
          { person: 'iona', chapterIdx: 0, charOffset: 0, updatedAt: '2026-07-15T00:00:00Z' },
        ],
      })
    );
    const { container } = render(Page);
    await openIntoAliceChapter(container);
    // Engine reports loading, then idle without ever playing — service down.
    capturedConfig?.onPhaseChange?.('loading');
    capturedConfig?.onPhaseChange?.('idle');
    await waitFor(() => {
      expect(container.textContent).toMatch(/the voice is resting/i);
    });
    // A fresh attempt clears the note the moment loading begins.
    capturedConfig?.onPhaseChange?.('loading');
    await waitFor(() => {
      expect(container.textContent).not.toMatch(/the voice is resting/i);
    });
  });
});
