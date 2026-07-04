import type { EmphasisRange } from '$lib/epub/model.js';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import PageView from './PageView.svelte';

afterEach(() => cleanup());

const chapter = 'Once upon a MIDNIGHT dreary and weak';

function rangeOver(needle: string, kind: EmphasisRange['kind']): EmphasisRange {
  const start = chapter.indexOf(needle);
  return { start, end: start + needle.length, kind };
}

describe('PageView', () => {
  it('renders word spans that reconstruct the slice exactly', () => {
    const { container } = render(PageView, {
      props: { text: chapter, sliceStart: 0 },
    });
    const spans = [...container.querySelectorAll('.page-text > span')];
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.map((s) => s.textContent).join('')).toBe(chapter);
    // The container itself holds nothing but the spans — stray template
    // whitespace would shift wrapping against the measurer.
    expect(container.querySelector('.page-text')?.textContent).toBe(chapter);
    expect(container.querySelectorAll('.page-word')).toHaveLength(7);
  });

  it('renders emphasis as em/strong semantics on the right words', () => {
    const emphasis = [rangeOver('MIDNIGHT', 'em'), rangeOver('weak', 'strong')];
    const { container } = render(PageView, {
      props: { text: chapter, sliceStart: 0, emphasis },
    });
    const em = container.querySelector('.page-word em');
    expect(em?.textContent).toBe('MIDNIGHT');
    const strong = container.querySelector('.page-word strong');
    expect(strong?.textContent).toBe('weak');
    // Un-emphasized words carry no wrapper.
    const first = container.querySelector('.page-word');
    expect(first?.textContent).toBe('Once');
    expect(first?.querySelector('em, strong')).toBeNull();
  });

  it('nests em>strong when both kinds overlap one word', () => {
    const emphasis = [rangeOver('MIDNIGHT', 'em'), rangeOver('MIDNIGHT', 'strong')];
    const { container } = render(PageView, {
      props: { text: chapter, sliceStart: 0, emphasis },
    });
    const nested = container.querySelector('.page-word em > strong');
    expect(nested?.textContent).toBe('MIDNIGHT');
  });

  it('keeps word spans free of layout-affecting inline styles', () => {
    // The layout discipline (see component header): character-driven layout
    // must not shift under emphasis or highlight. Spans carry classes only.
    const emphasis = [rangeOver('MIDNIGHT', 'em')];
    const { container } = render(PageView, {
      props: { text: chapter, sliceStart: 0, emphasis, currentCharIndex: 5 },
    });
    for (const span of container.querySelectorAll('.page-text > span')) {
      expect(span.getAttribute('style')).toBeNull();
    }
  });

  it('highlights the word containing currentCharIndex (chapter-absolute)', () => {
    const sliceStart = chapter.indexOf('MIDNIGHT');
    const slice = chapter.slice(sliceStart);
    const { container } = render(PageView, {
      props: {
        text: slice,
        sliceStart,
        currentCharIndex: chapter.indexOf('dreary') + 3,
      },
    });
    const current = container.querySelectorAll('.page-word.is-current');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe('dreary');
  });

  it('renders no highlight when currentCharIndex is null or off-page', () => {
    for (const currentCharIndex of [null, 999]) {
      const { container } = render(PageView, {
        props: { text: chapter, sliceStart: 0, currentCharIndex },
      });
      expect(container.querySelectorAll('.is-current')).toHaveLength(0);
      cleanup();
    }
  });

  it('renders an empty page for an empty slice', () => {
    const { container } = render(PageView, {
      props: { text: '', sliceStart: 42 },
    });
    expect(container.querySelector('.page-text')?.textContent).toBe('');
  });
});
