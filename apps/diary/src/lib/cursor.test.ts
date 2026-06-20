import { describe, expect, it } from 'vitest';
import { insertAtCursor } from './cursor.js';

function ta(
  value: string,
  selectionStart: number,
  selectionEnd = selectionStart
): HTMLTextAreaElement {
  return {
    value,
    selectionStart,
    selectionEnd,
  } as HTMLTextAreaElement;
}

describe('insertAtCursor', () => {
  it('inserts into empty textarea without leading space', () => {
    const { newValue, cursorPos } = insertAtCursor(ta('', 0), 'Hello world.');
    expect(newValue).toBe('Hello world.');
    expect(cursorPos).toBe(12);
  });

  it('replaces a selection with the new text', () => {
    const { newValue, cursorPos } = insertAtCursor(ta('foo bar baz', 4, 7), 'qux');
    expect(newValue).toBe('foo qux baz');
    expect(cursorPos).toBe(7);
  });

  it('prepends a space when inserting after a non-whitespace character', () => {
    const { newValue, cursorPos } = insertAtCursor(ta('Hello.', 6), 'world');
    expect(newValue).toBe('Hello. world');
    expect(cursorPos).toBe(12);
  });

  it('does not prepend a space when the previous character is whitespace', () => {
    const { newValue } = insertAtCursor(ta('Hello ', 6), 'world');
    expect(newValue).toBe('Hello world');
  });

  it('does not prepend a space when the new text already starts with whitespace', () => {
    const { newValue } = insertAtCursor(ta('Hello.', 6), ' world');
    expect(newValue).toBe('Hello. world');
  });

  it('lowercases the first character when inserting mid-sentence', () => {
    // "I went" then mid-sentence transcription: "Then we walked"
    const { newValue } = insertAtCursor(ta('I went', 6), 'Then we walked');
    expect(newValue).toBe('I went then we walked');
  });

  it('keeps capitalization when inserting at sentence boundary (after .!?)', () => {
    const { newValue } = insertAtCursor(ta('Done.', 5), 'Next thought');
    expect(newValue).toBe('Done. Next thought');
  });

  it('keeps capitalization when inserting after question mark', () => {
    const { newValue } = insertAtCursor(ta('What?', 5), 'Then');
    expect(newValue).toBe('What? Then');
  });

  it('keeps capitalization at the very start of the textarea', () => {
    const { newValue } = insertAtCursor(ta('', 0), 'Hello.');
    expect(newValue).toBe('Hello.');
  });

  it('handles selection replacement with no leading space when previous is whitespace', () => {
    const { newValue } = insertAtCursor(ta('keep this part', 5, 9), 'that');
    expect(newValue).toBe('keep that part');
  });

  it('inserts non-letter starts without capitalization mangling', () => {
    const { newValue } = insertAtCursor(ta('I have', 6), '5 apples');
    expect(newValue).toBe('I have 5 apples');
  });
});
