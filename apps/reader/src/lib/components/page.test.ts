import { cleanup, render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../../routes/+page.svelte';

// Node 25's experimental `localStorage` global shadows happy-dom's and is inert
// without --localstorage-file; an in-memory Storage keeps the mounted picker's
// (browser-correct) localStorage calls from throwing under test.
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

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

// The substrate every reader task builds on (R-AT-01): before a reader names
// themselves, `/` mounts a BookShell in the closed/cover state with the
// placeholder cover. R-AT-05 makes that cover OPEN (the book is now the real
// spread-state machine), which this test also pins.
describe('reader cover page', () => {
  it('renders a closed BookShell in cover state', () => {
    const { container } = render(Page);

    const frame = container.querySelector<HTMLElement>('.book-frame');
    expect(frame).not.toBeNull();
    expect(frame?.classList.contains('is-closed')).toBe(true);
    expect(frame?.classList.contains('is-cover-state')).toBe(true);
    expect(container.querySelector('.book-shell.is-closed')).not.toBeNull();
  });

  it('shows the placeholder cover on the right page only', () => {
    const { container } = render(Page);

    // Cover state: left page hidden (occupies layout space), right page holds
    // the placeholder cover. Before any book is chosen the title is the app name.
    const leftPage = container.querySelector<HTMLElement>('.spread .page-left');
    const rightPage = container.querySelector<HTMLElement>('.spread .page-right');
    expect(leftPage?.style.visibility).toBe('hidden');
    expect(rightPage?.textContent).toContain('Edelmore');
  });

  it('the cover now opens the book (R-AT-05: a next flip zone covers it)', () => {
    const { container } = render(Page);
    // R-AT-01 rendered no flip zones ("does not open in this slice"); R-AT-05's
    // state machine makes the whole cover the open target.
    expect(container.querySelector('.flip-zone-next')).not.toBeNull();
  });
});
