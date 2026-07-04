import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Page from '../../routes/+page.svelte';

afterEach(() => cleanup());

// R-AT-01: the substrate every subsequent reader task builds on — `/` must
// mount a BookShell in the closed/cover state with the placeholder cover.
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
    // the placeholder cover.
    const leftPage = container.querySelector<HTMLElement>('.spread .page-left');
    const rightPage = container.querySelector<HTMLElement>('.spread .page-right');
    expect(leftPage?.style.visibility).toBe('hidden');
    expect(rightPage?.textContent).toContain('Edelmore');

    // No flip zones on the cover — the book does not open in this slice.
    expect(container.querySelectorAll('.flip-zone')).toHaveLength(0);
  });
});
