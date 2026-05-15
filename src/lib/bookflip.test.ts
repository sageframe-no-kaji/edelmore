import { describe, expect, it } from 'vitest';
import { bookflip } from './bookflip.js';

function fakeNode(): HTMLElement {
  return {
    querySelectorAll: () => [],
  } as unknown as HTMLElement;
}

describe('bookflip action', () => {
  it('returns an object with a destroy function', () => {
    const result = bookflip(fakeNode(), {});
    expect(result).toBeDefined();
    expect(typeof result?.destroy).toBe('function');
  });

  it('destroy does not throw when called before async init resolves', () => {
    const { destroy } = bookflip(fakeNode(), {}) as { destroy: () => void };
    expect(() => destroy()).not.toThrow();
  });

  it('destroy does not throw when called a second time', () => {
    const { destroy } = bookflip(fakeNode(), {}) as { destroy: () => void };
    destroy();
    expect(() => destroy()).not.toThrow();
  });

  it('accepts an empty params object', () => {
    const result = bookflip(fakeNode(), {});
    expect(result).toBeDefined();
    (result as { destroy: () => void }).destroy();
  });

  it('accepts all optional params without throwing', () => {
    const onReady = () => {};
    const result = bookflip(fakeNode(), { startPage: 2, width: 400, height: 550, onReady });
    expect(result).toBeDefined();
    (result as { destroy: () => void }).destroy();
  });
});
