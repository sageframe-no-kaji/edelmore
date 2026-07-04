import { BookShell } from '@edelmore/book';
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => cleanup());

// Minimal spread markup — flip() locates its live pages via
// `.spread .page-left` / `.spread .page-right` inside the shell.
const spread = createRawSnippet(() => ({
  render: () =>
    '<div class="spread"><div class="page page-left">old left</div><div class="page page-right">old right</div></div>',
}));

function renderShell() {
  const { component, container } = render(BookShell, {
    props: { progress: 0.5, children: spread },
  });
  const shellEl = container.querySelector<HTMLElement>('.book-shell');
  if (!shellEl) throw new Error('BookShell did not render .book-shell');
  return { component, container, shellEl };
}

// AT-02: a rejected mutate() (e.g. failed navigation) must never leave
// isFlipping latched true or strand clones / flip-hidden classes in the DOM.
describe('BookShell.flip() exception safety', () => {
  it('cleans up clones and flip-hidden classes when mutate() rejects', async () => {
    const { component, container, shellEl } = renderShell();
    const baselineChildCount = shellEl.childElementCount;

    // Sentinels captured mid-flight, at mutate() time: prove the animated
    // path was in progress (clones inserted, live pages hidden) before the
    // rejection, so the cleanup assertions below aren't trivially true.
    let hiddenAtMutate = 0;
    let shellChildrenAtMutate = 0;
    const mutate = vi.fn(() => {
      hiddenAtMutate = container.querySelectorAll('.flip-hidden').length;
      shellChildrenAtMutate = shellEl.childElementCount;
      return Promise.reject(new Error('boom'));
    });

    // The rejection propagates to the caller — not swallowed.
    await expect(component.flip('forward', mutate)).rejects.toThrow('boom');

    expect(mutate).toHaveBeenCalledOnce();
    // Both live pages were hidden and overlay + wrapper were attached…
    expect(hiddenAtMutate).toBe(2);
    expect(shellChildrenAtMutate).toBe(baselineChildCount + 2);
    // …and the failure path removed all of it.
    expect(container.querySelectorAll('.flip-hidden')).toHaveLength(0);
    expect(shellEl.childElementCount).toBe(baselineChildCount);
  });

  it('releases isFlipping so a second flip runs after a failed one', async () => {
    const { component, container } = renderShell();

    await expect(
      component.flip('forward', () => Promise.reject(new Error('boom')))
    ).rejects.toThrow('boom');

    // Were isFlipping still latched, flip() would return at its guard
    // without invoking mutate — resolving, and failing both assertions.
    const secondMutate = vi.fn(() => Promise.reject(new Error('boom again')));
    await expect(component.flip('forward', secondMutate)).rejects.toThrow('boom again');
    expect(secondMutate).toHaveBeenCalledOnce();
    expect(container.querySelectorAll('.flip-hidden')).toHaveLength(0);
  });
});
