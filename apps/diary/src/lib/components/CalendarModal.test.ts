import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CalendarModal from './CalendarModal.svelte';

afterEach(() => cleanup());

const baseProps = {
  entryDates: new Set(['2026-05-10', '2026-05-15']),
  currentDate: '2026-05-19',
  onClose: vi.fn(),
  onNavigate: vi.fn(),
};

describe('CalendarModal', () => {
  it('displays the month name for the current date', () => {
    render(CalendarModal, baseProps);
    expect(screen.getByText('May')).toBeTruthy();
  });

  it('displays the year for the current date', () => {
    render(CalendarModal, baseProps);
    const yearSelect = screen.getByRole('combobox', { name: 'Year' }) as HTMLSelectElement;
    expect(yearSelect.value).toBe('2026');
  });

  it('navigates to the previous month', async () => {
    render(CalendarModal, baseProps);
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('April')).toBeTruthy();
  });

  it('navigates to the next month', async () => {
    render(CalendarModal, baseProps);
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('June')).toBeTruthy();
  });

  it('wraps from January to December when going to previous month', async () => {
    render(CalendarModal, { ...baseProps, currentDate: '2026-01-15' });
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('December')).toBeTruthy();
  });

  it('wraps from December to January when going to next month', async () => {
    render(CalendarModal, { ...baseProps, currentDate: '2026-12-01' });
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('January')).toBeTruthy();
  });

  it('marks the current date button with aria-current="date"', () => {
    render(CalendarModal, baseProps);
    const btn = screen.getByRole('button', { name: '2026-05-19' });
    expect(btn.getAttribute('aria-current')).toBe('date');
  });

  it('does not mark other dates with aria-current', () => {
    render(CalendarModal, baseProps);
    const btn = screen.getByRole('button', { name: '2026-05-10' });
    expect(btn.getAttribute('aria-current')).toBeNull();
  });

  it('calls onNavigate and onClose when a day is clicked', async () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    render(CalendarModal, { ...baseProps, onClose, onNavigate });
    await userEvent.click(screen.getByRole('button', { name: '2026-05-10' }));
    expect(onNavigate).toHaveBeenCalledWith('2026-05-10');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the Close button is clicked', async () => {
    const onClose = vi.fn();
    render(CalendarModal, { ...baseProps, onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(CalendarModal, { ...baseProps, onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('changes the displayed year via the year select', async () => {
    render(CalendarModal, baseProps);
    const yearSelect = screen.getByRole('combobox', { name: 'Year' }) as HTMLSelectElement;
    await userEvent.selectOptions(yearSelect, '2025');
    expect(yearSelect.value).toBe('2025');
  });
});
