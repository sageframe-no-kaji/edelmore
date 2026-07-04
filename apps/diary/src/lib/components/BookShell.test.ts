import { BookShell } from '@edelmore/book';
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => cleanup());

// happy-dom ships no View Transitions API. This minimal stub mirrors the shape
// flip() depends on: startViewTransition(cb) runs cb (the DOM mutation) and
// exposes `finished`, which resolves when cb resolves and rejects when it
// rejects — the invariant flip() relies on for AT-02 propagation.
type ViewTransitionStub = {
  updateCallbackDone: Promise<unknown>;
  ready: Promise<unknown>;
  finished: Promise<unknown>;
  skipTransition: () => void;
};
type DocWithVT = {
  startViewTransition?: (callback: () => unknown) => ViewTransitionStub;
};

function stubViewTransitions(): { calls: () => number; restore: () => void } {
  const doc = document as unknown as DocWithVT;
  let calls = 0;
  doc.startViewTransition = (callback: () => unknown) => {
    calls += 1;
    const updateCallbackDone = Promise.resolve().then(() => callback());
    const finished = updateCallbackDone.then(() => undefined);
    const ready = updateCallbackDone.then(() => undefined);
    // flip() only awaits `finished`; guard the rest so a mutate() rejection
    // doesn't surface as an unhandled promise rejection in the test run.
    updateCallbackDone.catch(() => undefined);
    ready.catch(() => undefined);
    return { updateCallbackDone, ready, finished, skipTransition: () => {} };
  };
  return {
    calls: () => calls,
    restore: () => {
      doc.startViewTransition = undefined;
    },
  };
}

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
//
// happy-dom has no `document.startViewTransition`, so these exercise flip()'s
// no-View-Transitions branch — the clone-rotate fallback. The stubbed-present
// branch is covered in the block below.
describe('BookShell.flip() exception safety (no View Transitions)', () => {
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

// Phase B: where document.startViewTransition exists, flip() hands the turn to
// the browser and never builds the clone wrapper / flip-hidden. AT-02's
// exception safety must hold on this branch too.
describe('BookShell.flip() with View Transitions present', () => {
  let vt: ReturnType<typeof stubViewTransitions> | null = null;

  afterEach(() => {
    vt?.restore();
    vt = null;
  });

  it('drives the turn through startViewTransition and never builds clone DOM', async () => {
    vt = stubViewTransitions();
    const { component, container, shellEl } = renderShell();
    const baselineChildCount = shellEl.childElementCount;

    // Sample the DOM at mutate() time: the clone path would have hidden both
    // live pages and appended wrapper + overlay by now. The VT path does not.
    let hiddenAtMutate = -1;
    let shellChildrenAtMutate = -1;
    const mutate = vi.fn(() => {
      hiddenAtMutate = container.querySelectorAll('.flip-hidden').length;
      shellChildrenAtMutate = shellEl.childElementCount;
    });

    await component.flip('forward', mutate);

    expect(vt.calls()).toBe(1);
    expect(mutate).toHaveBeenCalledOnce();
    // No clone wrapper/overlay was appended and no page was flip-hidden.
    expect(hiddenAtMutate).toBe(0);
    expect(shellChildrenAtMutate).toBe(baselineChildCount);
    expect(container.querySelectorAll('.flip-hidden')).toHaveLength(0);
    expect(shellEl.childElementCount).toBe(baselineChildCount);
  });

  it('propagates a mutate() rejection and releases isFlipping (no residue)', async () => {
    vt = stubViewTransitions();
    const { component, container } = renderShell();
    const baselineChildCount =
      container.querySelector<HTMLElement>('.book-shell')?.childElementCount;

    await expect(
      component.flip('forward', () => Promise.reject(new Error('boom')))
    ).rejects.toThrow('boom');

    expect(vt.calls()).toBe(1);
    // Nothing stranded: the VT branch built no clone DOM to leak.
    expect(container.querySelectorAll('.flip-hidden')).toHaveLength(0);
    expect(container.querySelector<HTMLElement>('.book-shell')?.childElementCount).toBe(
      baselineChildCount
    );

    // isFlipping was released by the finally, so a second flip runs.
    const secondMutate = vi.fn(() => Promise.reject(new Error('boom again')));
    await expect(component.flip('forward', secondMutate)).rejects.toThrow('boom again');
    expect(secondMutate).toHaveBeenCalledOnce();
    expect(vt.calls()).toBe(2);
  });
});
