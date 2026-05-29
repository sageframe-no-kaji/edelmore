import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TocPage from './TocPage.svelte';

afterEach(() => cleanup());

const entries = [
  { entry_date: '2026-05-14', preview: 'Today.' },
  { entry_date: '2026-05-13', preview: 'Yesterday.' },
];

describe('TocPage', () => {
  it('calls onNavigate with the entry date when a row is clicked', async () => {
    const onNavigate = vi.fn();
    const { getAllByRole } = render(TocPage, { entries, onNavigate });
    const buttons = getAllByRole('button');
    buttons[0].click();
    expect(onNavigate).toHaveBeenCalledWith('2026-05-14');
  });

  it('renders entries newest first', () => {
    const { getAllByRole } = render(TocPage, { entries, onNavigate: vi.fn() });
    const buttons = getAllByRole('button');
    expect(buttons[0].textContent).toContain('May 14');
    expect(buttons[1].textContent).toContain('May 13');
  });

  it('renders empty state when entries is empty', () => {
    const { getByText } = render(TocPage, { entries: [], onNavigate: vi.fn() });
    expect(getByText('No entries yet.')).toBeTruthy();
  });

  it('renders all entry rows', () => {
    const { getAllByRole } = render(TocPage, { entries, onNavigate: vi.fn() });
    expect(getAllByRole('button')).toHaveLength(2);
  });
});
