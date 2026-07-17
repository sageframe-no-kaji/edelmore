import type { NormalizedBook } from '$lib/epub/model.js';
// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Route-level narration wiring, exercised with a MOCKED engine. happy-dom
// computes no layout, so real pagination collapses every chapter to a single
// spread and an in-chapter boundary can never arise from real audio — mocking
// the engine lets us fire its callbacks (onWordHighlight, onPageBoundaryReached)
// directly and observe the route's response: highlight in PageView, flip via
// BookShell.flip, and the manual-flip-stops-narration rule.

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
      images: [],
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

async function renderRoute() {
  const rendered = render(DevBookPage, { props: { data: { book } } as any });
  await tick(); // let the pagination effect run
  return rendered;
}

describe('dev route narration wiring', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
    engineMock.play.mockClear();
    engineMock.stop.mockClear();
    engineMock.getPhase.mockReturnValue('idle');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('Play narrates the current chapter from the current spread start', async () => {
    const { container } = await renderRoute();
    const primary = container.querySelector<HTMLButtonElement>('[data-role="primary"]');
    expect(primary?.textContent?.trim()).toBe('Play');
    await fireEvent.click(primary!);
    expect(engineMock.play).toHaveBeenCalledTimes(1);
    // Whole-chapter model: the full chapter text, from the current spread start (0).
    expect(engineMock.play).toHaveBeenCalledWith(book.chapters[0].text, 0);
  });

  it('onWordHighlight drives PageView’s currentCharIndex', async () => {
    const { container } = await renderRoute();
    // No highlight until the engine emits one.
    expect(container.querySelector('.page-word.is-current')).toBeNull();

    capturedConfig.onWordHighlight?.(0); // char 0 → the word "Chapter"
    await tick();

    const highlighted = container.querySelector('.page-word.is-current');
    expect(highlighted).not.toBeNull();
    expect(highlighted?.textContent).toBe('Chapter');
  });

  it('onPageBoundaryReached flips forward via BookShell.flip without stopping narration', async () => {
    const { container } = await renderRoute();
    // Single-spread chapters in happy-dom → the boundary flip crosses the
    // chapter boundary into chapter two.
    expect(container.querySelector('.spread .page-left')?.textContent).toContain('Chapter one');

    capturedConfig.onPageBoundaryReached?.();
    await tick();

    expect(container.querySelector('.spread .page-left')?.textContent).toContain('Chapter two');
    // The engine-initiated flip must NOT stop the engine.
    expect(engineMock.stop).not.toHaveBeenCalled();
  });

  it('a manual forward flip stops narration', async () => {
    engineMock.getPhase.mockReturnValue('playing'); // narration is live
    const { container } = await renderRoute();

    const next = container.querySelector<HTMLButtonElement>('.flip-zone-next');
    await fireEvent.click(next!);
    await tick();

    expect(engineMock.stop).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.spread .page-left')?.textContent).toContain('Chapter two');
  });

  it('a manual backward flip stops narration', async () => {
    engineMock.getPhase.mockReturnValue('playing');
    const { container } = await renderRoute();
    // Advance first (engine idle for this forward step is fine; clear after).
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.flip-zone-next')!);
    await tick();
    engineMock.stop.mockClear();

    await fireEvent.click(container.querySelector<HTMLButtonElement>('.flip-zone-prev')!);
    await tick();
    expect(engineMock.stop).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.spread .page-left')?.textContent).toContain('Chapter one');
  });

  it('the Stop control stops the engine', async () => {
    engineMock.getPhase.mockReturnValue('playing');
    const { container } = await renderRoute();
    // onPhaseChange lifts the UI into a running state so Stop is enabled.
    capturedConfig.onPhaseChange?.('playing');
    await tick();
    const stop = container.querySelector<HTMLButtonElement>('[data-role="stop"]');
    expect(stop?.disabled).toBe(false);
    await fireEvent.click(stop!);
    expect(engineMock.stop).toHaveBeenCalled();
  });
});
