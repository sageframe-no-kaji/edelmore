import { describe, expect, it } from 'vitest';
import { applyPageEdit, insertAtAnchor, sideForOffset, spreadForOffset } from './content.js';

describe('applyPageEdit', () => {
  it('replaces the page window with the new value (single page, no overflow)', () => {
    // splitPoints empty → page is the whole content; oldSlice is everything.
    expect(applyPageEdit('hello world', 0, 'hello world', 'hello there world')).toBe(
      'hello there world'
    );
  });

  it('keeps a trailing suffix intact when editing an earlier page', () => {
    // content "AAABBB", left page = "AAA" at offset 0, suffix "BBB".
    expect(applyPageEdit('AAABBB', 0, 'AAA', 'AAAX')).toBe('AAAXBBB');
  });

  it('keeps a leading prefix intact when editing a later page', () => {
    // content "AAABBB", right page = "BBB" at offset 3, prefix "AAA".
    expect(applyPageEdit('AAABBB', 3, 'BBB', 'BBBY')).toBe('AAABBBY');
  });

  it('handles deletion (new value shorter than old slice)', () => {
    expect(applyPageEdit('AAABBB', 0, 'AAA', 'AA')).toBe('AABBB');
  });

  it('handles emptying a page', () => {
    expect(applyPageEdit('AAABBB', 0, 'AAA', '')).toBe('BBB');
  });
});

describe('applyPageEdit — regression: the 2026-06-12 cascade', () => {
  // The old editor rebuilt content as
  //   content.slice(0, pageStart) + value + content.slice(staleEnd)
  // where staleEnd came from splitPoints, frozen during the 50ms pagination
  // debounce. This reproduces the duplication two fast keystrokes caused, then
  // shows applyPageEdit (end derived from the prior slice) does not.
  function buggyReconstruct(
    content: string,
    pageStart: number,
    staleEnd: number,
    value: string
  ): string {
    return content.slice(0, pageStart) + value + content.slice(staleEnd);
  }

  it('characterizes the bug: stale end duplicates a fragment across two keystrokes', () => {
    // content "AAABBB", left page "AAA", splitPoints[0] = 3 (the stale end).
    let content = 'AAABBB';
    const staleEnd = 3; // frozen — pagination has not recomputed yet
    content = buggyReconstruct(content, 0, staleEnd, 'AAAX'); // keystroke 1
    expect(content).toBe('AAAXBBB');
    content = buggyReconstruct(content, 0, staleEnd, 'AAAXY'); // keystroke 2, same stale end
    expect(content).toBe('AAAXYXBBB'); // the corruption: a duplicated "X"
  });

  it('applyPageEdit does not duplicate across the same two keystrokes', () => {
    let content = 'AAABBB';
    let oldSlice = 'AAA';
    content = applyPageEdit(content, 0, oldSlice, 'AAAX');
    oldSlice = 'AAAX';
    expect(content).toBe('AAAXBBB');
    content = applyPageEdit(content, 0, oldSlice, 'AAAXY');
    oldSlice = 'AAAXY';
    expect(content).toBe('AAAXYBBB'); // clean — suffix "BBB" preserved exactly once
  });
});

describe('insertAtAnchor', () => {
  it('inserts at an absolute offset mid-content', () => {
    const { content, cursorPos } = insertAtAnchor('Hello world', 5, 'there');
    // offset 5 is after "Hello"; non-whitespace before → leading space added.
    expect(content).toBe('Hello there world');
    expect(cursorPos).toBe(11);
  });

  it('inserts at the start with no leading space', () => {
    const { content, cursorPos } = insertAtAnchor('world', 0, 'Hello');
    expect(content).toBe('Helloworld');
    expect(cursorPos).toBe(5);
  });

  it('clamps an anchor past the end to the end of content', () => {
    const { content, cursorPos } = insertAtAnchor('Done.', 999, 'Next');
    expect(content).toBe('Done. Next');
    expect(cursorPos).toBe(10);
  });

  it('clamps a negative anchor to the start', () => {
    const { content } = insertAtAnchor('abc', -5, 'X');
    expect(content).toBe('Xabc');
  });

  it('lowercases the first character when landing mid-sentence', () => {
    const { content } = insertAtAnchor('I went', 6, 'Then we walked');
    expect(content).toBe('I went then we walked');
  });

  it('keeps capitalization when landing after a sentence boundary', () => {
    const { content } = insertAtAnchor('Done.', 5, 'Next thought');
    expect(content).toBe('Done. Next thought');
  });

  it('does not add a leading space when the anchor follows whitespace', () => {
    const { content } = insertAtAnchor('Hello ', 6, 'world');
    expect(content).toBe('Hello world');
  });
});

describe('spreadForOffset', () => {
  it('returns 0 when content fits one page (no splits)', () => {
    expect(spreadForOffset([], 0)).toBe(0);
    expect(spreadForOffset([], 50)).toBe(0);
  });

  it('maps offsets to spreads across boundaries', () => {
    // splitPoints [10, 20, 30, 40] → spread 0 ends at 20, spread 1 ends at 40,
    // spread 2 is the tail.
    const sp = [10, 20, 30, 40];
    expect(spreadForOffset(sp, 0)).toBe(0);
    expect(spreadForOffset(sp, 19)).toBe(0);
    expect(spreadForOffset(sp, 20)).toBe(1);
    expect(spreadForOffset(sp, 39)).toBe(1);
    expect(spreadForOffset(sp, 40)).toBe(2);
    expect(spreadForOffset(sp, 999)).toBe(2);
  });
});

describe('sideForOffset', () => {
  it('treats a single page as the left side', () => {
    expect(sideForOffset([], 0, 0)).toBe('left');
    expect(sideForOffset([], 0, 5)).toBe('left');
  });

  it('splits left/right at the spread mid-boundary', () => {
    // splitPoints [10, 20, 30, 40]; spread 0 mid = splitPoints[0] = 10.
    const sp = [10, 20, 30, 40];
    expect(sideForOffset(sp, 0, 9)).toBe('left');
    expect(sideForOffset(sp, 0, 10)).toBe('right');
    // spread 1 mid = splitPoints[2] = 30.
    expect(sideForOffset(sp, 1, 29)).toBe('left');
    expect(sideForOffset(sp, 1, 30)).toBe('right');
  });
});
